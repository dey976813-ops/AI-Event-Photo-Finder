const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const dgram = require('dgram');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const QRCode = require('qrcode');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'photo_finder_super_secret_jwt_key_2026_cinematic';

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mov', '.webm'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${ext}. Supported: JPG, PNG, WEBP, MP4, MOV, WEBM`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB per file
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

async function getRoutedAddress() {
  const routedAddress = await new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const finish = (value) => { try { socket.close(); } catch {} resolve(value); };
    const timer = setTimeout(() => finish(null), 500);
    socket.once('error', () => { clearTimeout(timer); finish(null); });
    socket.connect(80, '8.8.8.8', () => {
      clearTimeout(timer);
      const address = socket.address().address;
      finish(address && address !== '0.0.0.0' && !address.startsWith('127.') ? address : null);
    });
  });
  return routedAddress;
}

async function getLanOrigins() {
  const routedAddress = await getRoutedAddress();
  const candidates = [];
  const privateV4 = (value) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(value);
  const hotspotName = (value) => /(mobile\s*hotspot|hotspot|wi-?fi\s*direct|hosted\s*network|local area connection\s*\*)/i.test(value);
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if ((address.family !== 'IPv4' && address.family !== 4) || address.internal || !privateV4(address.address)) continue;
      const hotspot = hotspotName(name);
      const virtual = !hotspot && /(virtual|vmware|vbox|virtualbox|docker|wsl|hyper-v|vpn|tunnel|wireguard|tailscale|zerotier|\btap\b|loopback)/i.test(name);
      const physical = /(wi-?fi|wlan|wireless|ethernet|^(en|eth|wl)\d)/i.test(name);
      if (!virtual) candidates.push({ address: address.address, interface: name, hotspot, physical, origin: `http://${address.address}:${PORT}` });
    }
  }
  const unique = [...new Map(candidates.map((candidate) => [candidate.address, candidate])).values()];
  // Interfaces returned here are currently assigned to this machine; the
  // frontend listener is bound to 0.0.0.0, so its current private addresses
  // are the device-reachable origins. Reuse a loopback TCP probe would reject
  // Windows Wi-Fi Direct/hotspot interfaces under some firewall profiles.
  const reachable = unique;
  const configured = String(process.env.LAN_ORIGIN || '').trim();
  let configuredAddress = null;
  if (configured) {
    try { configuredAddress = new URL(configured).hostname; } catch { /* Ignore malformed overrides. */ }
  }
  const selected =
    reachable.find((candidate) => candidate.hotspot) ||
    reachable.find((candidate) => candidate.address === configuredAddress) ||
    reachable.find((candidate) => candidate.address === routedAddress) ||
    reachable.find((candidate) => candidate.physical) ||
    reachable[0] || null;
  return { origin: selected?.origin || null, candidates: reachable };
}

app.get('/api/runtime-config', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { origin, candidates } = await getLanOrigins();
  res.json({ origin, lanOrigin: origin, LAN_ORIGIN: origin, lanOrigins: candidates });
});

// Generate the same QR image used by event and loved-collection sharing
// without relying on a third-party browser CDN.
app.post('/api/qr', async (req, res) => {
  const text = req.body?.text;
  if (typeof text !== 'string' || !text.trim() || text.length > 2048) {
    return res.status(400).json({ error: 'A QR value up to 2048 characters is required.' });
  }
  try {
    const image = await QRCode.toBuffer(text, { type: 'png', errorCorrectionLevel: 'M', margin: 2, width: 512 });
    res.set('Cache-Control', 'no-store');
    res.type('png').send(image);
  } catch {
    res.status(500).json({ error: 'Could not generate the QR image.' });
  }
});

// Cache header middleware for frames
app.use('/frames', (req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  next();
});

// Static routes
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(__dirname));

// Auth Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Session expired or invalid token' });
    }
    req.user = user;
    next();
  });
}

// ==================== AUTH API ====================

// Sign Up
app.post('/api/auth/signup', (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    const newUser = db.createUser({ name, email, password });
    const token = jwt.sign(
      { id: newUser.id, name: newUser.name, email: newUser.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      user: { id: newUser.id, name: newUser.name, email: newUser.email },
      token
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Login
app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = db.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValid = bcrypt.compareSync(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      user: { id: user.id, name: user.name, email: user.email },
      token
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Current User profile
app.get('/api/auth/me', authenticateToken, (req, res) => {
  const user = db.getUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({
    user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt }
  });
});

// ==================== CODE VERIFICATION & PUBLIC VIEWER ====================

// Verify access code and fetch collection (Unauthenticated viewer)
app.post('/api/verify-code', (req, res) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({
        status: 'not_found',
        message: 'CODE NOT FOUND',
        sub: 'Check the code and try again.'
      });
    }

    // Format normalization: strip non-alphanumeric, re-format or match directly
    const rawClean = code.trim().toUpperCase();
    let collection = db.getCollectionByCode(rawClean);

    // If not found, try formatted with dash if user typed 8 chars without dash
    if (!collection) {
      const stripped = rawClean.replace(/[^A-Z0-9]/g, '');
      if (stripped.length === 8) {
        const withDash = `${stripped.slice(0, 4)}-${stripped.slice(4)}`;
        collection = db.getCollectionByCode(withDash);
      }
    }

    if (!collection) {
      return res.status(404).json({
        status: 'not_found',
        message: 'CODE NOT FOUND',
        sub: 'Check the code and try again.'
      });
    }

    if (collection.status === 'expired') {
      return res.status(410).json({
        status: 'expired',
        message: 'THIS COLLECTION IS NO LONGER AVAILABLE.',
        sub: 'Contact the owner for a renewed access link.'
      });
    }

    // Retrieve media items securely only on valid verification
    const media = db.getCollectionMedia(collection.id);
    const photos = media.filter(m => m.type === 'photo');
    const videos = media.filter(m => m.type === 'video');

    res.json({
      status: 'valid',
      collection: {
        id: collection.id,
        name: collection.name,
        accessCode: collection.accessCode,
        createdAt: collection.createdAt,
        photosCount: photos.length,
        videosCount: videos.length,
        media: media.map(m => ({
          id: m.id,
          type: m.type,
          url: m.url,
          filename: m.filename,
          size: m.size,
          createdAt: m.createdAt
        }))
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== UPLOADER DASHBOARD & COLLECTIONS ====================

// List collections for logged-in user
app.get('/api/collections', authenticateToken, (req, res) => {
  try {
    const collections = db.getCollectionsByOwner(req.user.id);
    res.json({ collections });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload media and create new collection
app.post('/api/collections', authenticateToken, upload.array('files', 50), (req, res) => {
  try {
    const { name } = req.body;
    const files = req.files || [];

    if (files.length === 0) {
      return res.status(400).json({ error: 'Please upload at least one photo or video' });
    }

    const collection = db.createCollection({
      ownerId: req.user.id,
      name: name && name.trim() ? name.trim() : 'Paris Trip — 2026'
    });

    const videoExts = ['.mp4', '.mov', '.webm'];
    const mediaItems = files.map(file => {
      const ext = path.extname(file.originalname).toLowerCase();
      const type = videoExts.includes(ext) ? 'video' : 'photo';
      return {
        id: 'med_' + crypto.randomBytes(8).toString('hex'),
        collectionId: collection.id,
        type,
        url: `/uploads/${file.filename}`,
        filename: file.originalname,
        size: file.size,
        createdAt: new Date().toISOString()
      };
    });

    db.addMediaItems(mediaItems);

    const photosCount = mediaItems.filter(m => m.type === 'photo').length;
    const videosCount = mediaItems.filter(m => m.type === 'video').length;

    res.status(201).json({
      success: true,
      collection: {
        ...collection,
        photosCount,
        videosCount,
        totalItems: mediaItems.length
      },
      accessCode: collection.accessCode
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete collection
app.delete('/api/collections/:id', authenticateToken, (req, res) => {
  try {
    const success = db.deleteCollection(req.params.id, req.user.id);
    if (!success) {
      return res.status(404).json({ error: 'Collection not found or unauthorized' });
    }
    res.json({ success: true, message: 'Collection deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback to index.html for SPA routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Photo Finder server running at http://localhost:${PORT}`);
});

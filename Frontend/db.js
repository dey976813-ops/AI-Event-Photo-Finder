const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const DB_FILE = path.join(__dirname, 'data', 'db.json');

function ensureDbFile() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    const initialData = {
      users: [],
      collections: [],
      media: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
    seedInitialData();
  }
}

function readDb() {
  ensureDbFile();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error reading DB, re-initializing:', e);
    return { users: [], collections: [], media: [] };
  }
}

function writeDb(data) {
  ensureDbFile();
  const tempFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempFile, DB_FILE);
}

function generateAccessCode() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const db = readDb();
  const existingCodes = new Set(db.collections.map(c => c.accessCode.toUpperCase()));

  for (let attempts = 0; attempts < 100; attempts++) {
    let part1 = '';
    let part2 = '';
    const bytes = crypto.randomBytes(8);
    for (let i = 0; i < 4; i++) {
      part1 += chars[bytes[i] % chars.length];
      part2 += chars[bytes[i + 4] % chars.length];
    }
    const code = `${part1}-${part2}`;
    if (!existingCodes.has(code)) {
      return code;
    }
  }
  return `${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

function seedInitialData() {
  const db = {
    users: [],
    collections: [],
    media: []
  };

  const userId = 'usr_demo_001';
  const passwordHash = bcrypt.hashSync('demo123', 10);

  db.users.push({
    id: userId,
    name: 'Alex Mercer',
    email: 'alex@photofinder.io',
    password: passwordHash,
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString()
  });

  const collectionId = 'col_paris_2026';
  db.collections.push({
    id: collectionId,
    ownerId: userId,
    name: 'Paris Trip — 2026',
    accessCode: 'PX7K-29QM',
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    status: 'active'
  });

  const demoMedia = [
    {
      id: 'med_001',
      collectionId,
      type: 'photo',
      url: '/uploads/demo/eiffel-summit.jpg',
      filename: 'eiffel-summit.jpg',
      size: 39353,
      createdAt: new Date().toISOString()
    },
    {
      id: 'med_002',
      collectionId,
      type: 'photo',
      url: '/uploads/demo/departure-flight.jpg',
      filename: 'departure-flight.jpg',
      size: 59079,
      createdAt: new Date().toISOString()
    },
    {
      id: 'med_003',
      collectionId,
      type: 'video',
      url: '/uploads/demo/paris-evening-stroll.mp4',
      filename: 'paris-evening-stroll.mp4',
      size: 8376370,
      createdAt: new Date().toISOString()
    },
    {
      id: 'med_004',
      collectionId,
      type: 'photo',
      url: '/uploads/demo/above-the-clouds.jpg',
      filename: 'above-the-clouds.jpg',
      size: 22810,
      createdAt: new Date().toISOString()
    },
    {
      id: 'med_005',
      collectionId,
      type: 'photo',
      url: '/uploads/demo/city-glow.jpg',
      filename: 'city-glow.jpg',
      size: 28684,
      createdAt: new Date().toISOString()
    },
    {
      id: 'med_006',
      collectionId,
      type: 'photo',
      url: '/uploads/demo/tower-reveal.jpg',
      filename: 'tower-reveal.jpg',
      size: 36038,
      createdAt: new Date().toISOString()
    },
    {
      id: 'med_007',
      collectionId,
      type: 'photo',
      url: '/uploads/demo/twilight-sky.jpg',
      filename: 'twilight-sky.jpg',
      size: 32682,
      createdAt: new Date().toISOString()
    }
  ];

  db.media.push(...demoMedia);
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

// Ensure DB is initialized
ensureDbFile();

module.exports = {
  readDb,
  writeDb,
  generateAccessCode,
  getUserByEmail(email) {
    const db = readDb();
    return db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  },
  getUserById(id) {
    const db = readDb();
    return db.users.find(u => u.id === id);
  },
  createUser({ name, email, password }) {
    const db = readDb();
    const existing = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      throw new Error('An account with this email already exists');
    }
    const newUser = {
      id: 'usr_' + crypto.randomBytes(8).toString('hex'),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: bcrypt.hashSync(password, 10),
      createdAt: new Date().toISOString()
    };
    db.users.push(newUser);
    writeDb(db);
    return { id: newUser.id, name: newUser.name, email: newUser.email, createdAt: newUser.createdAt };
  },
  getCollectionsByOwner(ownerId) {
    const db = readDb();
    const cols = db.collections.filter(c => c.ownerId === ownerId);
    return cols.map(c => {
      const mediaList = db.media.filter(m => m.collectionId === c.id);
      const photosCount = mediaList.filter(m => m.type === 'photo').length;
      const videosCount = mediaList.filter(m => m.type === 'video').length;
      const cover = mediaList[0] ? mediaList[0].url : null;
      return {
        ...c,
        photosCount,
        videosCount,
        totalItems: mediaList.length,
        coverUrl: cover
      };
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },
  getCollectionByCode(rawCode) {
    const db = readDb();
    const cleanCode = (rawCode || '').trim().toUpperCase();
    return db.collections.find(c => c.accessCode.toUpperCase() === cleanCode);
  },
  getCollectionById(id) {
    const db = readDb();
    return db.collections.find(c => c.id === id);
  },
  getCollectionMedia(collectionId) {
    const db = readDb();
    return db.media.filter(m => m.collectionId === collectionId);
  },
  createCollection({ ownerId, name }) {
    const db = readDb();
    const accessCode = generateAccessCode();
    const newCollection = {
      id: 'col_' + crypto.randomBytes(8).toString('hex'),
      ownerId,
      name: (name && name.trim()) ? name.trim() : 'Untitled Collection',
      accessCode,
      createdAt: new Date().toISOString(),
      status: 'active'
    };
    db.collections.push(newCollection);
    writeDb(db);
    return newCollection;
  },
  addMediaItems(items) {
    const db = readDb();
    db.media.push(...items);
    writeDb(db);
  },
  deleteCollection(id, ownerId) {
    const db = readDb();
    const colIdx = db.collections.findIndex(c => c.id === id && c.ownerId === ownerId);
    if (colIdx === -1) return false;

    db.collections.splice(colIdx, 1);
    db.media = db.media.filter(m => m.collectionId !== id);
    writeDb(db);
    return true;
  }
};

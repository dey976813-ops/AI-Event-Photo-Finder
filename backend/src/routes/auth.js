const express = require("express");

const supabase = require("../services/supabaseService");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Shapes a Supabase Auth user object into the { id, name, email } shape the
// existing frontend (main.js) already reads (currentUser.name, etc.). Never
// exposes anything else from the Supabase user record.
function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name:
      user.user_metadata?.name ||
      (user.email ? user.email.split("@")[0] : "User"),
  };
}

// =========================
// POST /api/auth/signup
//
// Body: { name, email, password, confirmPassword }
// Response: { success: true, token, user: { id, name, email } }
//
// Users are created directly in Supabase Auth (auth.users) via the admin
// API, which is available here because supabaseService.js is initialized
// with the service-role key. This makes auth.users.id the single, canonical
// user id everywhere else in the app -- in particular the id Phase 2 will
// write into events.owner_id.
// =========================
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: "Name, email and password are required",
      });
    }

    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: "Passwords do not match",
      });
    }

    // email_confirm: true auto-confirms the account. This backend has no
    // email delivery configured, so requiring email verification would
    // leave every new signup permanently unable to log in.
    const { data: created, error: createError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      });

    if (createError || !created?.user) {
      console.error("Signup error:", createError);
      return res.status(400).json({
        success: false,
        error: createError?.message || "Could not create account",
      });
    }

    // admin.createUser does not return a session, so sign in immediately to
    // hand the frontend a real, usable access token -- matching what
    // login below returns, and what main.js expects as `data.token`.
    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (signInError || !signInData?.session) {
      console.error("Post-signup sign-in error:", signInError);
      return res.status(500).json({
        success: false,
        error: "Account created, but automatic sign-in failed. Please log in.",
      });
    }

    return res.status(201).json({
      success: true,
      token: signInData.session.access_token,
      user: toPublicUser(signInData.user),
    });
  } catch (error) {
    console.error("Signup API error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to create account",
    });
  }
});

// =========================
// POST /api/auth/login
//
// Body: { email, password }
// Response: { success: true, token, user: { id, name, email } }
// =========================
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required",
      });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data?.session) {
      // Deliberately generic -- don't reveal whether the email exists.
      return res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
    }

    return res.json({
      success: true,
      token: data.session.access_token,
      user: toPublicUser(data.user),
    });
  } catch (error) {
    console.error("Login API error:", error);
    return res.status(500).json({
      success: false,
      error: "Login failed",
    });
  }
});

// =========================
// GET /api/auth/me
//
// Header: Authorization: Bearer <token>
// Response: { success: true, user: { id, name, email } }
//
// requireAuth is the single place the token is verified against Supabase
// Auth; this handler just reports back what it found.
// =========================
router.get("/me", requireAuth, async (req, res) => {
  return res.json({
    success: true,
    user: toPublicUser(req.user),
  });
});

module.exports = router;

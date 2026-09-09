const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const supabase = require("../services/supabaseService");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const supabaseAuth = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);

function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name:
      user.user_metadata?.name ||
      (user.email ? user.email.split("@")[0] : "User"),
  };
}

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

    const { data: created, error: createError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name,
        },
      });

    if (createError || !created?.user) {
      console.error("Signup error:", createError);

      return res.status(400).json({
        success: false,
        error: createError?.message || "Could not create account",
      });
    }

    const { data: signInData, error: signInError } =
      await supabaseAuth.auth.signInWithPassword({
        email,
        password,
      });

    if (signInError || !signInData?.session || !signInData?.user) {
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

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required",
      });
    }

    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data?.session || !data?.user) {
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

router.get("/me", requireAuth, async (req, res) => {
  return res.json({
    success: true,
    user: toPublicUser(req.user),
  });
});

module.exports = router;

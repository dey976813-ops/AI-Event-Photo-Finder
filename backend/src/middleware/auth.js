const supabase = require("../services/supabaseService");

// =========================
// Auth middleware
//
// This is the ONLY place the authenticated user is derived from a request.
// It verifies the bearer token against Supabase Auth (the same identity
// system used by routes/auth.js to issue tokens on login/signup) and
// attaches the verified user object to req.user. Nothing downstream should
// ever read a user/owner id from req.body or req.query -- ownership checks
// in Phase 2 must read req.user.id, which can only be set here, after a
// real token has been verified server-side.
// =========================

function extractBearerToken(req) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

// Use on any route that must be logged in. Responds 401 if the token is
// missing, malformed, or does not verify against Supabase Auth.
async function requireAuth(req, res, next) {
  const token = extractBearerToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired session",
      });
    }

    req.user = data.user; // { id, email, user_metadata, ... }
    return next();
  } catch (error) {
    console.error("Auth verification error:", error);
    return res.status(401).json({
      success: false,
      message: "Invalid or expired session",
    });
  }
}

// Use on routes that behave differently for a logged-in caller but don't
// strictly require one (not needed by Phase 1, kept here for Phase 2 --
// e.g. GET /api/events may want to return public + owned/shared events).
// Never fails the request; req.user is simply left undefined if there's no
// valid token.
async function attachUserIfPresent(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) return next();

  try {
    const { data } = await supabase.auth.getUser(token);
    if (data?.user) req.user = data.user;
  } catch (error) {
    console.warn("Optional auth verification failed:", error.message);
  }

  return next();
}

module.exports = { requireAuth, attachUserIfPresent };

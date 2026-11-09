const jwt = require("jsonwebtoken");
const { loadStore } = require("../db");

function getJwtSecret() {
  const secret = String(process.env.JWT_SECRET || "").trim();
  if (!secret || secret === "change-this-to-a-long-random-string") {
    const err = new Error("Server auth is not configured. Set JWT_SECRET to a long random value.");
    err.code = "JWT_SECRET_MISSING";
    throw err;
  }
  return secret;
}

function extractBearerToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  return req.headers["x-token"] || null;
}

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    phone: row.phone,
    displayName: row.display_name || row.displayName || row.username || row.email,
    role: row.role || "player",
    status: row.status || "active",
  };
}

function authRequired(req, res, next) {
  let secret;
  try {
    secret = getJwtSecret();
  } catch (err) {
    return res.status(503).json({ ok: false, error: err.message, code: err.code });
  }

  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: "Authentication required" });
  }

  try {
    const decoded = jwt.verify(token, secret);
    const userId = Number(decoded.sub);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(401).json({ ok: false, error: "Invalid authentication token" });
    }

    const store = loadStore();
    const row = (store.users || []).find((u) => Number(u.id) === userId);
    if (!row) {
      return res.status(401).json({ ok: false, error: "User account no longer exists" });
    }

    if (["blocked", "suspended", "archived"].includes(String(row.status || "active").toLowerCase())) {
      return res.status(403).json({ ok: false, error: "This account is not active" });
    }

    req.user = publicUser(row);
    next();
  } catch (err) {
    const expired = err && err.name === "TokenExpiredError";
    return res.status(401).json({
      ok: false,
      error: expired ? "Session expired. Please log in again." : "Invalid authentication token",
      code: expired ? "TOKEN_EXPIRED" : "TOKEN_INVALID",
    });
  }
}

function signToken(user) {
  const secret = getJwtSecret();
  return jwt.sign(
    {
      email: user.email,
      username: user.username,
      role: user.role || "player",
    },
    secret,
    {
      subject: String(user.id),
      expiresIn: process.env.JWT_EXPIRES_IN || "12h",
      issuer: "habtam-bet-api",
      audience: "habtam-bet-web",
    }
  );
}

function roleRequired(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return function requireRole(req, res, next) {
    authRequired(req, res, () => {
      if (!req.user || !allowed.includes(req.user.role)) {
        return res.status(403).json({ ok: false, error: "Access denied" });
      }
      next();
    });
  };
}

function superAdminRequired(req, res, next) {
  return roleRequired(["super_admin", "sys_core"])(req, res, next);
}

function adminOrSuperRequired(req, res, next) {
  return roleRequired(["admin", "super_admin", "sys_core"])(req, res, next);
}

module.exports = {
  authRequired,
  signToken,
  superAdminRequired,
  adminOrSuperRequired,
  roleRequired,
};

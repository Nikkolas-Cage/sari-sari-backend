const express = require("express");
const { authenticate, toAuthUser } = require("../middleware/auth");
const { verifyIdToken } = require("../config/firebase");
const User = require("../models/User");

const router = express.Router();

function extractIdentity(decoded) {
  const emailRaw = decoded.email || decoded.firebase?.identities?.email?.[0] || null;
  return {
    firebaseUid: decoded.uid,
    email: emailRaw ? String(emailRaw).toLowerCase().trim() : null,
    phone: decoded.phone_number || null,
    suggestedName: decoded.name || decoded.phone_number || emailRaw?.split("@")[0] || "User",
  };
}

function httpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

async function findExistingUser({ firebaseUid, email, phone }) {
  if (firebaseUid) {
    const byUid = await User.findOne({ firebaseUid });
    if (byUid) return byUid;
  }
  if (email) {
    const byEmail = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (byEmail) return byEmail;
  }
  if (phone) {
    const byPhone = await User.findOne({ phone });
    if (byPhone) return byPhone;
  }
  return null;
}

async function touchLogin(user, identity) {
  if (identity.firebaseUid && user.firebaseUid !== identity.firebaseUid) {
    user.firebaseUid = identity.firebaseUid;
  }
  if (identity.email && user.email !== identity.email) {
    user.email = identity.email;
  }
  if (identity.phone && user.phone !== identity.phone) {
    user.phone = identity.phone;
  }
  if (user.role === "seller") {
    // Keep store identity stable — never rotate storeId or products disappear
    if (!user.storeId) user.storeId = user._id;
    if (!user.storeName) user.storeName = `${user.name}'s Sari-Sari`;
  }
  user.lastLoginAt = new Date();
  await user.save();
  return user;
}

async function createUserProfile({ identity, name, role, setupComplete = false }) {
  if (!identity.email && !identity.phone) {
    throw httpError(400, "Your account needs an email or phone number to continue");
  }
  if (!["seller", "buyer"].includes(role)) {
    throw httpError(400, "Role must be seller or buyer");
  }

  // Do NOT store null email/phone — sparse unique indexes treat null as a real value
  const payload = {
    firebaseUid: identity.firebaseUid,
    name: name || identity.suggestedName,
    role,
    setupComplete: Boolean(setupComplete),
    lastLoginAt: new Date(),
  };
  if (identity.email) payload.email = identity.email;
  if (identity.phone) payload.phone = identity.phone;

  try {
    const user = await User.create(payload);

    if (role === "seller") {
      user.storeId = user._id;
      user.storeName = user.storeName || `${user.name}'s Sari-Sari`;
      await user.save();
    }

    return user;
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await findExistingUser(identity);
      if (existing) return existing;
      throw httpError(
        409,
        "An account with these details already exists. Please sign in instead.",
        "ACCOUNT_EXISTS"
      );
    }
    throw error;
  }
}

/**
 * 1. Profile exists + role selected → switch to that role if different, then login
 * 2. Profile exists + no role → login with current role
 * 3. Profile missing + role → create buyer/seller
 * 4. Profile missing + no role → NEEDS_PROFILE
 */
async function applyRole(user, role) {
  if (!role || !["seller", "buyer"].includes(role) || role === user.role) {
    return { user, switched: false };
  }

  user.role = role;
  if (role === "seller") {
    // Preserve existing storeId so inventory stays linked after role switches / renames
    if (!user.storeId) user.storeId = user._id;
    if (!user.storeName) user.storeName = `${user.name}'s Sari-Sari`;
  }
  await user.save();
  console.log("[auth/session] role switched", {
    id: user._id.toString(),
    role: user.role,
    storeId: user.storeId?.toString?.(),
  });
  return { user, switched: true };
}

async function resolveSession({ decoded, name, role, intent }) {
  const identity = extractIdentity(decoded);
  console.log("[auth/session]", {
    intent,
    role: role || null,
    uid: identity.firebaseUid,
    email: identity.email,
    phone: identity.phone,
  });

  const existing = await findExistingUser(identity);
  if (existing) {
    console.log("[auth/session] found", {
      id: existing._id.toString(),
      role: existing.role,
      email: existing.email,
    });

    // Same email can switch seller ↔ buyer whenever a role is explicitly chosen
    if (role) {
      await applyRole(existing, role);
    }

    const user = await touchLogin(existing, identity).catch(async (err) => {
      console.warn("[auth/session] touchLogin failed, returning existing profile", err.message);
      return existing;
    });
    return { user, created: false };
  }

  if (!role) {
    console.log("[auth/session] NEEDS_PROFILE — no role for new identity");
    throw httpError(
      404,
      "Almost done — choose whether you are a seller or buyer to finish setup.",
      "NEEDS_PROFILE"
    );
  }

  try {
    const user = await createUserProfile({
      identity,
      name,
      role,
      setupComplete: intent === "signup",
    });
    console.log("[auth/session] created", { id: user._id.toString(), role: user.role });
    return { user, created: true };
  } catch (error) {
    console.error("[auth/session] create failed", error.message, error.code || error.status);
    throw error;
  }
}

function sendAuthError(res, error, identity = {}) {
  const status = error.status || (error.codePrefix === "auth" ? 401 : 500);

  if (error.code === "NEEDS_PROFILE" || error.status === 404) {
    return res.status(404).json({
      error: error.message,
      code: "NEEDS_PROFILE",
      suggestedName: identity.suggestedName || "User",
      email: identity.email || identity.phone || "",
    });
  }

  return res.status(status).json({
    error: error.message || "Authentication failed",
    code: error.code,
  });
}

async function handleSession(req, res, forcedIntent) {
  try {
    const { idToken, name, role } = req.body;
    const intent = forcedIntent || req.body.intent || "login";

    if (!idToken) {
      return res.status(400).json({ error: "Sign-in is required" });
    }
    if (!["login", "signup"].includes(intent)) {
      return res.status(400).json({ error: "Intent must be login or signup" });
    }
    if (role && !["seller", "buyer"].includes(role)) {
      return res.status(400).json({ error: "Role must be seller or buyer" });
    }

    const decoded = await verifyIdToken(idToken);
    const identity = extractIdentity(decoded);

    try {
      const { user, created } = await resolveSession({
        decoded,
        name: name || identity.suggestedName,
        role: role || null,
        intent,
      });
      return res.status(created ? 201 : 200).json({ user: toAuthUser(user), created });
    } catch (error) {
      return sendAuthError(res, error, identity);
    }
  } catch (error) {
    console.error("Auth error:", error.message);
    return sendAuthError(res, error);
  }
}

router.post("/session", (req, res) => handleSession(req, res));
router.post("/login", (req, res) => handleSession(req, res, "login"));
router.post("/register", (req, res) => handleSession(req, res, "signup"));

router.get("/me", authenticate, async (req, res) => {
  res.json({ user: req.user });
});

router.patch("/profile", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const { name, storeName, avatarUrl, setupComplete, phone } = req.body;

    if (typeof name === "string" && name.trim()) {
      user.name = name.trim();
    }
    if (typeof storeName === "string") {
      const trimmedStore = storeName.trim();
      if (user.role === "seller") {
        user.storeName = trimmedStore || `${user.name}'s Sari-Sari`;
      }
    }
    if (avatarUrl === null || avatarUrl === "") {
      user.avatarUrl = null;
    } else if (typeof avatarUrl === "string") {
      user.avatarUrl = avatarUrl;
    }
    if (typeof phone === "string") {
      const trimmed = phone.trim();
      if (trimmed) user.phone = trimmed;
      else user.set("phone", undefined);
    }
    if (typeof setupComplete === "boolean") {
      user.setupComplete = setupComplete;
    }

    // Mark setup complete when profile has a name (and optionally avatar/password done client-side)
    if (user.name && setupComplete !== false) {
      if (req.body.markSetupComplete) {
        user.setupComplete = true;
      }
    }

    // Never drop seller store linkage when renaming the account
    if (user.role === "seller") {
      if (!user.storeId) user.storeId = user._id;
      if (!user.storeName) user.storeName = `${user.name}'s Sari-Sari`;
    }

    await user.save();
    res.json({ user: toAuthUser(user) });
  } catch (error) {
    console.error("Profile update error:", error);
    if (error?.code === 11000) {
      return res.status(409).json({ error: "Phone or email already in use" });
    }
    res.status(500).json({ error: "Failed to update profile" });
  }
});

module.exports = router;

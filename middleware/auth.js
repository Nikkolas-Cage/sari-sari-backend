const { verifyIdToken } = require("../config/firebase");
const User = require("../models/User");

function toAuthUser(user) {
  return {
    id: user._id.toString(),
    firebaseUid: user.firebaseUid,
    name: user.name,
    email: user.email || null,
    phone: user.phone || null,
    role: user.role,
    storeId: user.storeId ? user.storeId.toString() : null,
    storeName: user.storeName || null,
    avatarUrl: user.avatarUrl || null,
    setupComplete: Boolean(user.setupComplete),
  };
}

async function findUserForAuth(decoded) {
  const uid = decoded.uid;
  const email = decoded.email ? String(decoded.email).toLowerCase().trim() : null;
  const phone = decoded.phone_number || null;

  if (uid) {
    const byUid = await User.findOne({ firebaseUid: uid });
    if (byUid) return byUid;
  }
  if (email) {
    const byEmail = await User.findOne({ email });
    if (byEmail) return byEmail;
  }
  if (phone) {
    const byPhone = await User.findOne({ phone });
    if (byPhone) return byPhone;
  }
  return null;
}

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const idToken = header.slice(7);
    const decoded = await verifyIdToken(idToken);
    const user = await findUserForAuth(decoded);

    if (!user) {
      return res.status(401).json({ error: "User profile not found. Please complete signup." });
    }

    // Keep firebaseUid in sync so later lookups by uid work
    if (user.firebaseUid !== decoded.uid) {
      user.firebaseUid = decoded.uid;
      await user.save().catch(() => {});
    }

    // Sellers must always have a stable storeId (= their user id)
    if (user.role === "seller" && (!user.storeId || user.storeId.toString() !== user._id.toString())) {
      // Only set if missing — do NOT rotate an existing different storeId (would orphan products)
      if (!user.storeId) {
        user.storeId = user._id;
        if (!user.storeName) user.storeName = `${user.name}'s Sari-Sari`;
        await user.save().catch(() => {});
      }
    }

    req.firebaseUser = decoded;
    req.user = toAuthUser(user);
    next();
  } catch (error) {
    console.error("Auth error:", error.message);
    return res.status(401).json({ error: "Invalid or expired Firebase token" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. This area requires ${roles.join(" or ")} role.`,
        code: "WRONG_ROLE",
        currentRole: req.user?.role || null,
      });
    }
    next();
  };
}

module.exports = { authenticate, requireRole, toAuthUser, findUserForAuth };

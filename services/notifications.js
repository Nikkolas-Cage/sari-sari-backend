const Notification = require("../models/Notification");
const User = require("../models/User");

function serializeNotification(n) {
  return {
    id: n._id.toString(),
    type: n.type,
    title: n.title,
    body: n.body || "",
    actorId: n.actorId?.toString?.() || n.actorId || null,
    actorName: n.actorName || "",
    actorAvatarUrl: n.actorAvatarUrl || null,
    href: n.href || "",
    meta: n.meta || {},
    read: Boolean(n.read),
    createdAt: n.createdAt,
  };
}

/**
 * Create a notification for a user and push over WebSocket.
 */
async function createNotification(req, { userId, type, title, body, actorId, href, meta }) {
  if (!userId) return null;

  let actorName = "";
  let actorAvatarUrl = null;
  if (actorId) {
    const actor = await User.findById(actorId).select("name avatarUrl").lean();
    actorName = actor?.name || "";
    actorAvatarUrl = actor?.avatarUrl || null;
  }

  const doc = await Notification.create({
    userId,
    type,
    title,
    body: body || "",
    actorId: actorId || null,
    actorName,
    actorAvatarUrl,
    href: href || "",
    meta: meta || {},
    read: false,
  });

  const payload = {
    type: "notification:new",
    notification: serializeNotification(doc.toObject()),
  };

  const realtime = req?.app?.get?.("realtime");
  if (realtime) {
    realtime.broadcast(`user:${userId.toString()}`, payload);
  }

  return payload.notification;
}

module.exports = {
  createNotification,
  serializeNotification,
};

const express = require("express");
const { authenticate } = require("../middleware/auth");
const User = require("../models/User");
const Product = require("../models/Product");
const { Conversation, Message } = require("../models/Chat");
const { createNotification } = require("../services/notifications");

const router = express.Router();

function participantIds(conversation) {
  return conversation.participants.map((p) => p.toString());
}

function serializeOther(other) {
  if (!other) return null;
  return {
    id: other._id.toString(),
    name: other.name,
    email: other.email || null,
    role: other.role,
    avatarUrl: other.avatarUrl || null,
  };
}

function notifyChat(req, conversation, payload) {
  const realtime = req.app.get("realtime");
  if (!realtime) return;
  const cid = conversation._id.toString();
  realtime.broadcastChat(cid, payload);
  for (const p of conversation.participants) {
    const uid = p._id?.toString?.() || p.toString();
    realtime.broadcast(`user:${uid}`, payload);
  }
}

async function getOrCreateConversation(userId, otherUserId, productId = null) {
  let conversation = await Conversation.findOne({
    participants: { $all: [userId, otherUserId], $size: 2 },
  });

  if (!conversation) {
    conversation = await Conversation.create({
      participants: [userId, otherUserId],
      productId: productId || null,
      lastMessageAt: new Date(),
      lastMessagePreview: "",
    });
  } else if (productId && !conversation.productId) {
    conversation.productId = productId;
    await conversation.save();
  }

  return conversation;
}

router.get("/conversations", authenticate, async (req, res) => {
  try {
    const list = await Conversation.find({ participants: req.user.id })
      .sort({ lastMessageAt: -1 })
      .populate("participants", "name email role avatarUrl")
      .lean();

    const conversations = list.map((c) => {
      const other = (c.participants || []).find((p) => p._id.toString() !== req.user.id);
      return {
        id: c._id.toString(),
        productId: c.productId?.toString?.() || null,
        lastMessageAt: c.lastMessageAt,
        lastMessagePreview: c.lastMessagePreview,
        otherUser: serializeOther(other),
      };
    });

    res.json({ conversations });
  } catch (error) {
    console.error("List conversations error:", error);
    res.status(500).json({ error: "Failed to load conversations" });
  }
});

router.post("/conversations", authenticate, async (req, res) => {
  try {
    const { otherUserId, productId, prompt } = req.body;
    if (!otherUserId) {
      return res.status(400).json({ error: "otherUserId is required" });
    }
    if (otherUserId === req.user.id) {
      return res.status(400).json({ error: "Cannot chat with yourself" });
    }

    const other = await User.findById(otherUserId);
    if (!other) {
      return res.status(404).json({ error: "User not found" });
    }

    const conversation = await getOrCreateConversation(req.user.id, otherUserId, productId || null);
    await conversation.populate("participants", "name email role avatarUrl");

    let firstMessage = null;
    if (prompt && String(prompt).trim()) {
      firstMessage = await Message.create({
        conversationId: conversation._id,
        senderId: req.user.id,
        text: String(prompt).trim(),
        status: "sent",
      });
      conversation.lastMessageAt = new Date();
      conversation.lastMessagePreview = firstMessage.text.slice(0, 120);
      await conversation.save();

      notifyChat(req, conversation, {
        type: "chat:message",
        conversationId: conversation._id.toString(),
        message: {
          id: firstMessage._id.toString(),
          senderId: firstMessage.senderId.toString(),
          text: firstMessage.text,
          status: firstMessage.status,
          createdAt: firstMessage.createdAt,
        },
      });
    }

    const otherPop = conversation.participants.find((p) => p._id.toString() !== req.user.id);

    res.status(201).json({
      conversation: {
        id: conversation._id.toString(),
        productId: conversation.productId?.toString?.() || null,
        lastMessageAt: conversation.lastMessageAt,
        lastMessagePreview: conversation.lastMessagePreview,
        otherUser: serializeOther(otherPop),
      },
      message: firstMessage
        ? {
            id: firstMessage._id.toString(),
            senderId: firstMessage.senderId.toString(),
            text: firstMessage.text,
            status: firstMessage.status,
            createdAt: firstMessage.createdAt,
          }
        : null,
    });
  } catch (error) {
    console.error("Create conversation error:", error);
    res.status(500).json({ error: "Failed to start conversation" });
  }
});

/** Buyer inquires about a product — opens chat with store seller + prompt */
router.post("/inquire", authenticate, async (req, res) => {
  try {
    const { productId, prompt } = req.body;
    if (!productId) {
      return res.status(400).json({ error: "productId is required" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const sellerId = product.storeId.toString();
    if (sellerId === req.user.id) {
      return res.status(400).json({ error: "You own this product" });
    }

    const text =
      String(prompt || "").trim() ||
      `Hi! I'm inquiring about "${product.name}" (₱${Number(product.unitPrice).toFixed(2)}). Is this available for pickup?`;

    const conversation = await getOrCreateConversation(req.user.id, sellerId, productId);
    const message = await Message.create({
      conversationId: conversation._id,
      senderId: req.user.id,
      text,
      status: "sent",
    });

    conversation.lastMessageAt = new Date();
    conversation.lastMessagePreview = text.slice(0, 120);
    await conversation.save();
    await conversation.populate("participants", "name email role avatarUrl");

    const otherPop = conversation.participants.find((p) => p._id.toString() !== req.user.id);
    const payload = {
      type: "chat:message",
      conversationId: conversation._id.toString(),
      message: {
        id: message._id.toString(),
        senderId: message.senderId.toString(),
        text: message.text,
        status: message.status,
        createdAt: message.createdAt,
      },
    };
    notifyChat(req, conversation, payload);

    const conversationId = conversation._id.toString();
    await createNotification(req, {
      userId: sellerId,
      type: "inquire",
      title: `${req.user.name} inquired about a product`,
      body: `About "${product.name}" — tap to open chat`,
      actorId: req.user.id,
      href: `/seller/messages?c=${conversationId}`,
      meta: {
        productId: product._id.toString(),
        productName: product.name,
        conversationId,
      },
    });

    res.status(201).json({
      conversation: {
        id: conversation._id.toString(),
        productId: productId,
        lastMessageAt: conversation.lastMessageAt,
        lastMessagePreview: conversation.lastMessagePreview,
        otherUser: serializeOther(otherPop),
      },
      message: payload.message,
    });
  } catch (error) {
    console.error("Inquire error:", error);
    res.status(500).json({ error: "Failed to start inquiry" });
  }
});

router.get("/conversations/:id/messages", authenticate, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation || !participantIds(conversation).includes(req.user.id)) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Mark others' messages as delivered when fetched
    await Message.updateMany(
      {
        conversationId: conversation._id,
        senderId: { $ne: req.user.id },
        status: "sent",
      },
      { $set: { status: "delivered" } }
    );

    const messages = await Message.find({ conversationId: conversation._id })
      .sort({ createdAt: 1 })
      .limit(200)
      .lean();

    res.json({
      messages: messages.map((m) => ({
        id: m._id.toString(),
        senderId: m.senderId.toString(),
        text: m.text || "",
        attachments: m.attachments || [],
        status: m.status || "sent",
        createdAt: m.createdAt,
      })),
    });
  } catch (error) {
    console.error("List messages error:", error);
    res.status(500).json({ error: "Failed to load messages" });
  }
});

router.post("/conversations/:id/messages", authenticate, async (req, res) => {
  try {
    const text = String(req.body.text || "").trim();
    const attachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];
    const cleanAttachments = attachments
      .slice(0, 4)
      .map((a) => ({
        type: a?.type === "image" || String(a?.mimeType || "").startsWith("image/") ? "image" : "file",
        url: String(a?.url || ""),
        name: String(a?.name || "attachment").slice(0, 120),
        mimeType: String(a?.mimeType || ""),
      }))
      .filter((a) => a.url && a.url.length < 3_500_000);

    if (!text && cleanAttachments.length === 0) {
      return res.status(400).json({ error: "Message text or attachment is required" });
    }

    const conversation = await Conversation.findById(req.params.id);
    if (!conversation || !participantIds(conversation).includes(req.user.id)) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const message = await Message.create({
      conversationId: conversation._id,
      senderId: req.user.id,
      text,
      attachments: cleanAttachments,
      status: "sent",
    });

    const preview =
      text ||
      (cleanAttachments[0]?.type === "image" ? "📷 Photo" : `📎 ${cleanAttachments[0]?.name || "Attachment"}`);

    conversation.lastMessageAt = new Date();
    conversation.lastMessagePreview = preview.slice(0, 120);
    await conversation.save();

    const payload = {
      type: "chat:message",
      conversationId: conversation._id.toString(),
      message: {
        id: message._id.toString(),
        senderId: message.senderId.toString(),
        text: message.text || "",
        attachments: message.attachments || [],
        status: message.status,
        createdAt: message.createdAt,
      },
    };
    notifyChat(req, conversation, payload);

    const recipients = participantIds(conversation).filter((id) => id !== req.user.id);
    for (const recipientId of recipients) {
      const recipient = await User.findById(recipientId).select("role").lean();
      const base = recipient?.role === "seller" ? "/seller/messages" : "/buyer/messages";
      await createNotification(req, {
        userId: recipientId,
        type: "message",
        title: `${req.user.name} sent you a message`,
        body: preview.slice(0, 120),
        actorId: req.user.id,
        href: `${base}?c=${conversation._id.toString()}`,
        meta: { conversationId: conversation._id.toString() },
      });
    }

    res.status(201).json({ message: payload.message });
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

router.post("/conversations/:id/delivered", authenticate, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation || !participantIds(conversation).includes(req.user.id)) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const result = await Message.updateMany(
      {
        conversationId: conversation._id,
        senderId: { $ne: req.user.id },
        status: "sent",
      },
      { $set: { status: "delivered" } }
    );

    if ((result.modifiedCount || 0) > 0) {
      notifyChat(req, conversation, {
        type: "chat:delivered",
        conversationId: conversation._id.toString(),
        userId: req.user.id,
      });
    }

    res.json({ updated: result.modifiedCount || 0 });
  } catch (error) {
    console.error("Delivered receipts error:", error);
    res.status(500).json({ error: "Failed to mark delivered" });
  }
});

router.post("/conversations/:id/read", authenticate, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation || !participantIds(conversation).includes(req.user.id)) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const result = await Message.updateMany(
      {
        conversationId: conversation._id,
        senderId: { $ne: req.user.id },
        status: { $in: ["sent", "delivered"] },
      },
      { $set: { status: "read" } }
    );

    notifyChat(req, conversation, {
      type: "chat:read",
      conversationId: conversation._id.toString(),
      userId: req.user.id,
    });

    res.json({ updated: result.modifiedCount || 0 });
  } catch (error) {
    console.error("Read receipts error:", error);
    res.status(500).json({ error: "Failed to mark read" });
  }
});

router.get("/directory", authenticate, async (req, res) => {
  try {
    const oppositeRole = req.user.role === "seller" ? "buyer" : "seller";
    const users = await User.find({ role: oppositeRole })
      .select("name email role avatarUrl")
      .sort({ name: 1 })
      .limit(100)
      .lean();

    res.json({
      users: users.map((u) => ({
        id: u._id.toString(),
        name: u.name,
        email: u.email || null,
        role: u.role,
        avatarUrl: u.avatarUrl || null,
      })),
    });
  } catch (error) {
    console.error("Directory error:", error);
    res.status(500).json({ error: "Failed to load directory" });
  }
});

module.exports = router;

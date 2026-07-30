const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth");
const Notification = require("../models/Notification");
const Product = require("../models/Product");
const { createNotification, serializeNotification } = require("../services/notifications");

const router = express.Router();

router.get("/", authenticate, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 40, 100);
    const list = await Notification.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const unreadCount = await Notification.countDocuments({
      userId: req.user.id,
      read: false,
    });

    res.json({
      notifications: list.map(serializeNotification),
      unreadCount,
    });
  } catch (error) {
    console.error("List notifications error:", error);
    res.status(500).json({ error: "Failed to load notifications" });
  }
});

router.get("/unread-count", authenticate, async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({
      userId: req.user.id,
      read: false,
    });
    res.json({ unreadCount });
  } catch (error) {
    res.status(500).json({ error: "Failed to count notifications" });
  }
});

router.patch("/read-all", authenticate, async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { userId: req.user.id, read: false },
      { $set: { read: true } }
    );
    res.json({ updated: result.modifiedCount || 0 });
  } catch (error) {
    res.status(500).json({ error: "Failed to mark all read" });
  }
});

router.patch("/:id/read", authenticate, async (req, res) => {
  try {
    const n = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: { read: true } },
      { new: true }
    ).lean();
    if (!n) return res.status(404).json({ error: "Notification not found" });
    res.json({ notification: serializeNotification(n) });
  } catch (error) {
    res.status(500).json({ error: "Failed to mark read" });
  }
});

/** Buyer added a product to pickup cart — notify the shop seller */
router.post("/cart-add", authenticate, requireRole("buyer"), async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ error: "productId is required" });

    const product = await Product.findById(productId).lean();
    if (!product) return res.status(404).json({ error: "Product not found" });

    const sellerId = product.storeId.toString();
    if (sellerId === req.user.id) {
      return res.status(400).json({ error: "Cannot notify yourself" });
    }

    const notification = await createNotification(req, {
      userId: sellerId,
      type: "cart_add",
      title: `${req.user.name} added a product from your shop`,
      body: `${req.user.name} added "${product.name}" to their pickup cart`,
      actorId: req.user.id,
      href: "/seller/orders",
      meta: { productId: product._id.toString(), productName: product.name },
    });

    res.status(201).json({ notification });
  } catch (error) {
    console.error("Cart-add notify error:", error);
    res.status(500).json({ error: "Failed to notify seller" });
  }
});

module.exports = router;

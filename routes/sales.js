const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth");
const Product = require("../models/Product");
const Sale = require("../models/Sale");
const User = require("../models/User");
const { createNotification } = require("../services/notifications");

const router = express.Router();

function serializeSale(sale) {
  return {
    ...sale,
    id: sale._id.toString(),
    _id: sale._id.toString(),
    storeId:
      typeof sale.storeId === "object" && sale.storeId !== null && sale.storeId._id
        ? sale.storeId._id.toString()
        : sale.storeId?.toString?.() || sale.storeId,
    buyerId:
      typeof sale.buyerId === "object" && sale.buyerId !== null && sale.buyerId._id
        ? sale.buyerId._id.toString()
        : sale.buyerId?.toString?.() || sale.buyerId || null,
    items: (sale.items || []).map((item) => ({
      ...item,
      id: item._id?.toString?.() || item._id,
      _id: item._id?.toString?.() || item._id,
      productId: item.productId?.toString?.() || item.productId,
    })),
    fulfillmentType: sale.fulfillmentType || "pickup",
    status: sale.status || "completed",
    note: sale.note || "",
  };
}

async function checkout(req, res) {
  const { items, storeId: bodyStoreId, note } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Cart must contain at least one item" });
  }

  let storeId;
  let buyerId = null;
  let fulfillmentType = "pos";
  let status = "completed";

  if (req.user.role === "seller") {
    storeId = req.user.storeId;
    fulfillmentType = "pos";
    status = "completed";
  } else {
    if (!bodyStoreId) {
      return res.status(400).json({ error: "storeId is required for buyer orders" });
    }
    storeId = bodyStoreId;
    buyerId = req.user.id;
    fulfillmentType = "pickup";
    status = "pending";
  }

  try {
    let totalAmount = 0;
    const lineItems = [];
    const stockUpdates = [];

    for (const item of items) {
      const product = await Product.findOne({
        _id: item.productId,
        storeId,
      });

      if (!product) {
        return res.status(404).json({
          error: `Product ${item.productId} not found in this store`,
        });
      }

      const qty = Number(item.qty);
      if (qty <= 0) {
        return res.status(400).json({ error: "Quantity must be positive" });
      }

      if (product.currentStock < qty) {
        return res.status(400).json({
          error: `Insufficient stock for "${product.name}". Available: ${product.currentStock}, requested: ${qty}`,
        });
      }

      stockUpdates.push({ product, qty });
      totalAmount += product.unitPrice * qty;
      lineItems.push({
        productId: product._id,
        name: product.name,
        qty,
        unitPrice: product.unitPrice,
      });
    }

    for (const { product, qty } of stockUpdates) {
      product.currentStock -= qty;
      await product.save();
      req.app.get("realtime")?.broadcastProduct("updated", {
        ...product.toObject(),
        id: product._id.toString(),
        _id: product._id.toString(),
        storeId: product.storeId.toString(),
      });
    }

    const sale = await Sale.create({
      storeId,
      buyerId,
      items: lineItems,
      totalAmount,
      fulfillmentType,
      status,
      note: note || (fulfillmentType === "pickup" ? "Pickup at sari-sari store" : ""),
      timestamp: new Date(),
    });

    const populated = await Sale.findById(sale._id)
      .populate("buyerId", "name")
      .populate("storeId", "name storeName")
      .lean();

    const payload = {
      ...serializeSale(populated),
      buyerName: populated.buyerId?.name || null,
      sellerName: populated.storeId?.storeName || populated.storeId?.name || null,
    };

    req.app.get("realtime")?.broadcastOrder("created", payload);

    if (fulfillmentType === "pickup" && buyerId) {
      const itemNames = lineItems.map((i) => i.name).join(", ");
      await createNotification(req, {
        userId: storeId,
        type: "order",
        title: `Confirm ${req.user.name}'s pickup order`,
        body: `${req.user.name} ordered ${itemNames} · ₱${Number(totalAmount).toFixed(2)}`,
        actorId: buyerId,
        href: "/seller/orders",
        meta: {
          saleId: sale._id.toString(),
          totalAmount,
          items: lineItems.map((i) => i.name),
        },
      });
    }

    res.status(201).json({
      sale: payload,
      message:
        fulfillmentType === "pickup"
          ? "Pickup order placed. Wait for the seller to confirm, then pick up at the store."
          : "Sale recorded",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Checkout failed" });
  }
}

router.post("/", authenticate, checkout);

router.patch("/:id/status", authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["pending", "confirmed", "ready", "completed", "cancelled"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const sale = await Sale.findById(req.params.id);
    if (!sale) return res.status(404).json({ error: "Order not found" });

    if (req.user.role === "seller") {
      if (sale.storeId.toString() !== req.user.storeId) {
        return res.status(403).json({ error: "Access denied" });
      }
    } else if (sale.buyerId?.toString() !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    } else if (status !== "cancelled" || sale.status !== "pending") {
      return res.status(403).json({ error: "Buyers can only cancel pending orders" });
    }

    sale.status = status;
    await sale.save();

    const populated = await Sale.findById(sale._id)
      .populate("buyerId", "name")
      .populate("storeId", "name storeName")
      .lean();

    const payload = {
      ...serializeSale(populated),
      buyerName: populated.buyerId?.name || null,
      sellerName: populated.storeId?.storeName || populated.storeId?.name || null,
    };

    req.app.get("realtime")?.broadcastOrder("status", payload);

    if (sale.buyerId) {
      const storeLabel = payload.sellerName || "the sari-sari store";
      const map = {
        confirmed: {
          type: "order_confirmed",
          title: "Your order is confirmed",
          body: `${storeLabel} confirmed your pickup order`,
        },
        ready: {
          type: "order_ready",
          title: "Ready for pickup",
          body: `Your order from ${storeLabel} is ready — pick it up at the store`,
        },
        completed: {
          type: "order_completed",
          title: "Order completed",
          body: `Thanks! Your pickup from ${storeLabel} is marked done`,
        },
        cancelled: {
          type: "order_cancelled",
          title: "Order cancelled",
          body: `Your pickup order from ${storeLabel} was cancelled`,
        },
      };
      const info = map[status];
      if (info) {
        await createNotification(req, {
          userId: sale.buyerId.toString(),
          type: info.type,
          title: info.title,
          body: info.body,
          actorId: req.user.id,
          href: "/buyer/orders",
          meta: { saleId: sale._id.toString(), status },
        });
      }
    }

    res.json({ sale: payload });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update order status" });
  }
});

router.get("/", authenticate, async (req, res) => {
  const { from, to } = req.query;
  const filter = {};

  if (req.user.role === "seller") {
    filter.storeId = req.user.storeId;
  } else {
    filter.buyerId = req.user.id;
  }

  if (from) {
    filter.timestamp = { ...(filter.timestamp || {}), $gte: new Date(from) };
  }
  if (to) {
    filter.timestamp = { ...(filter.timestamp || {}), $lte: new Date(to) };
  }

  const sales = await Sale.find(filter)
    .sort({ timestamp: -1 })
    .populate("buyerId", "name")
    .populate("storeId", "name storeName")
    .lean();

  const salesWithItems = sales.map((sale) => ({
    ...serializeSale(sale),
    buyerName: sale.buyerId?.name || null,
    sellerName: sale.storeId?.storeName || sale.storeId?.name || null,
  }));

  res.json({ sales: salesWithItems });
});

router.get("/stores", authenticate, requireRole("buyer"), async (_req, res) => {
  const stores = await User.find({
    role: "seller",
    storeId: { $ne: null },
  })
    .select("name storeId storeName")
    .lean();

  res.json({
    stores: stores.map((store) => ({
      id: store._id.toString(),
      name: store.storeName || store.name,
      storeName: store.storeName || store.name,
      ownerName: store.name,
      storeId: store.storeId?.toString?.() || store.storeId,
    })),
  });
});

module.exports = router;

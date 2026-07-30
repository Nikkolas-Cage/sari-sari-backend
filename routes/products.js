const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth");
const Product = require("../models/Product");

const router = express.Router();

function serializeProduct(product) {
  return {
    ...product,
    id: product._id.toString(),
    _id: product._id.toString(),
    storeId: product.storeId?.toString?.() || product.storeId,
    description: product.description || "",
    viewCount: product.viewCount || 0,
    clickCount: product.clickCount || 0,
  };
}

router.get("/", authenticate, async (req, res) => {
  const { category, storeId, lowStock } = req.query;
  const mongoose = require("mongoose");

  const filter = {};

  if (req.user.role === "seller") {
    const sid = req.user.storeId || req.user.id;
    filter.storeId = mongoose.isValidObjectId(sid) ? new mongoose.Types.ObjectId(sid) : sid;
  } else if (storeId) {
    filter.storeId = mongoose.isValidObjectId(storeId)
      ? new mongoose.Types.ObjectId(storeId)
      : storeId;
  }

  if (category) {
    filter.category = category;
  }

  if (lowStock === "true" && req.user.role === "seller") {
    filter.$expr = { $lt: ["$currentStock", "$lowStockThreshold"] };
  }

  const products = await Product.find(filter).sort({ name: 1 }).lean();
  res.json({ products: products.map(serializeProduct) });
});

router.get("/analytics", authenticate, requireRole("seller"), async (req, res) => {
  try {
    const storeId = req.user.storeId || req.user.id;
    const products = await Product.find({ storeId })
      .select("name category viewCount clickCount currentStock unitPrice imageUrl")
      .sort({ clickCount: -1 })
      .lean();

    const totals = products.reduce(
      (acc, p) => {
        acc.views += p.viewCount || 0;
        acc.clicks += p.clickCount || 0;
        acc.stock += p.currentStock || 0;
        return acc;
      },
      { views: 0, clicks: 0, stock: 0 }
    );

    const byCategory = {};
    for (const p of products) {
      const key = p.category || "Other";
      if (!byCategory[key]) byCategory[key] = { category: key, views: 0, clicks: 0, products: 0 };
      byCategory[key].views += p.viewCount || 0;
      byCategory[key].clicks += p.clickCount || 0;
      byCategory[key].products += 1;
    }

    res.json({
      totals: { ...totals, products: products.length },
      products: products.map((p) => ({
        id: p._id.toString(),
        name: p.name,
        category: p.category,
        views: p.viewCount || 0,
        clicks: p.clickCount || 0,
        stock: p.currentStock || 0,
        unitPrice: p.unitPrice,
      })),
      byCategory: Object.values(byCategory),
    });
  } catch (error) {
    console.error("Analytics error:", error);
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

router.get("/barcode/:code", authenticate, async (req, res) => {
  const { code } = req.params;

  const filter = { barcode: code };

  if (req.user.role === "seller") {
    filter.storeId = req.user.storeId;
  }

  const product = await Product.findOne(filter).lean();
  if (!product) {
    return res.status(404).json({ error: "Product not found for this barcode" });
  }

  res.json({ product: serializeProduct(product) });
});

router.post("/:id/view", authenticate, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $inc: { viewCount: 1 } },
      { new: true }
    ).lean();
    if (!product) return res.status(404).json({ error: "Product not found" });
    const serialized = serializeProduct(product);
    req.app.get("realtime")?.broadcastAnalytics(serialized);
    res.json({ product: serialized });
  } catch (error) {
    res.status(500).json({ error: "Failed to track view" });
  }
});

router.post("/:id/click", authenticate, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $inc: { clickCount: 1 } },
      { new: true }
    ).lean();
    if (!product) return res.status(404).json({ error: "Product not found" });
    const serialized = serializeProduct(product);
    req.app.get("realtime")?.broadcastAnalytics(serialized);
    res.json({ product: serialized });
  } catch (error) {
    res.status(500).json({ error: "Failed to track click" });
  }
});

router.get("/:id", authenticate, async (req, res) => {
  const product = await Product.findById(req.params.id).lean();

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  if (req.user.role === "seller" && product.storeId.toString() !== req.user.storeId) {
    return res.status(403).json({ error: "Access denied" });
  }

  res.json({ product: serializeProduct(product) });
});

router.post("/", authenticate, requireRole("seller"), async (req, res) => {
  const {
    name,
    description,
    category,
    unitPrice,
    currentStock,
    barcode,
    imageUrl,
    lowStockThreshold,
  } = req.body;

  if (!name || !category || unitPrice == null) {
    return res.status(400).json({ error: "Name, category, and unit price are required" });
  }

  const product = await Product.create({
    storeId: req.user.storeId || req.user.id,
    name,
    description: description || "",
    category,
    unitPrice: Number(unitPrice),
    currentStock: Math.max(0, Number(currentStock) || 0),
    barcode: barcode || null,
    imageUrl: imageUrl || null,
    lowStockThreshold: Number(lowStockThreshold) || 5,
  });
  const serialized = serializeProduct(product.toObject());
  req.app.get("realtime")?.broadcastProduct("created", serialized);
  res.status(201).json({ product: serialized });
});

router.patch("/:id/stock", authenticate, requireRole("seller"), async (req, res) => {
  const { quantity } = req.body;

  if (!quantity || quantity <= 0) {
    return res.status(400).json({ error: "Quantity must be a positive number" });
  }

  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }
  if (product.storeId.toString() !== req.user.storeId) {
    return res.status(403).json({ error: "Access denied" });
  }

  product.currentStock += Number(quantity);
  await product.save();
  const serialized = serializeProduct(product.toObject());
  req.app.get("realtime")?.broadcastProduct("updated", serialized);
  res.json({ product: serialized });
});

router.put("/:id", authenticate, requireRole("seller"), async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }
  if (product.storeId.toString() !== req.user.storeId) {
    return res.status(403).json({ error: "Access denied" });
  }

  const {
    name,
    description,
    category,
    unitPrice,
    barcode,
    imageUrl,
    lowStockThreshold,
    currentStock,
  } = req.body;

  if (name != null) product.name = name;
  if (description !== undefined) product.description = String(description || "").slice(0, 2000);
  if (category != null) product.category = category;
  if (unitPrice != null) product.unitPrice = Number(unitPrice);
  if (barcode !== undefined) product.barcode = barcode || null;
  if (imageUrl !== undefined) product.imageUrl = imageUrl || null;
  if (lowStockThreshold != null) product.lowStockThreshold = Number(lowStockThreshold);
  if (currentStock != null) product.currentStock = Number(currentStock);

  await product.save();
  const serialized = serializeProduct(product.toObject());
  req.app.get("realtime")?.broadcastProduct("updated", serialized);
  res.json({ product: serialized });
});

router.delete("/:id", authenticate, requireRole("seller"), async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }
  if (product.storeId.toString() !== req.user.storeId) {
    return res.status(403).json({ error: "Access denied" });
  }

  const serialized = serializeProduct(product.toObject());
  await product.deleteOne();
  req.app.get("realtime")?.broadcastProduct("deleted", serialized);
  res.json({ message: "Product deleted" });
});

module.exports = router;

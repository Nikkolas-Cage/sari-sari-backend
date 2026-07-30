/**
 * Restore demo products onto the first real seller without wiping users.
 * Usage: node scripts/restore-products.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");
const Product = require("../models/Product");

const DEMO_PRODUCTS = [
  {
    name: "Lucky Me Pancit Canton",
    description: "Classic instant pancit canton — savory and filling.",
    category: "Snacks",
    unitPrice: 15,
    currentStock: 50,
    barcode: "4800016001234",
    lowStockThreshold: 10,
  },
  {
    name: "Coca-Cola 1.5L",
    description: "Ice-cold classic cola for sharing.",
    category: "Beverages",
    unitPrice: 65,
    currentStock: 30,
    barcode: "4800016005678",
    lowStockThreshold: 5,
  },
  {
    name: "Sardines in Tomato Sauce",
    description: "Ready-to-eat canned sardines.",
    category: "Canned Goods",
    unitPrice: 28,
    currentStock: 12,
    barcode: "4800016009012",
    lowStockThreshold: 5,
  },
  {
    name: "Safeguard Soap",
    description: "Antibacterial bath soap.",
    category: "Personal Care",
    unitPrice: 35,
    currentStock: 20,
    barcode: "4800016003456",
    lowStockThreshold: 5,
  },
  {
    name: "Joy Dishwashing Liquid",
    description: "Cuts grease for everyday dishes.",
    category: "Household",
    unitPrice: 45,
    currentStock: 15,
    barcode: "4800016007890",
    lowStockThreshold: 5,
  },
  {
    name: "Chippy Extruded Corn",
    description: "Crunchy corn snack — perfect with softdrinks.",
    category: "Snacks",
    unitPrice: 12,
    currentStock: 40,
    barcode: "4800016001111",
    lowStockThreshold: 8,
  },
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const seller = await User.findOne({ role: "seller" }).sort({ updatedAt: -1 });
  if (!seller) {
    throw new Error("No seller account found. Sign up as seller first.");
  }

  if (!seller.storeId) {
    seller.storeId = seller._id;
  }
  if (!seller.storeName) {
    seller.storeName = `${seller.name}'s Sari-Sari`;
  }
  await seller.save();

  const storeId = seller.storeId;
  let created = 0;
  let updated = 0;

  for (const item of DEMO_PRODUCTS) {
    const existing = await Product.findOne({ storeId, barcode: item.barcode });
    if (existing) {
      existing.name = item.name;
      existing.description = item.description;
      existing.category = item.category;
      existing.unitPrice = item.unitPrice;
      existing.currentStock = Math.max(existing.currentStock, item.currentStock);
      existing.lowStockThreshold = item.lowStockThreshold;
      await existing.save();
      updated += 1;
    } else {
      await Product.create({ ...item, storeId });
      created += 1;
    }
  }

  // Re-link any orphan products (missing/invalid store) to this seller
  const orphans = await Product.updateMany(
    { $or: [{ storeId: null }, { storeId: { $exists: false } }] },
    { $set: { storeId } }
  );

  const total = await Product.countDocuments({ storeId });
  console.log(`Seller: ${seller.email || seller.name} (${seller._id})`);
  console.log(`Store: ${seller.storeName} / storeId ${storeId}`);
  console.log(`Products created: ${created}, updated: ${updated}, orphans fixed: ${orphans.modifiedCount || 0}`);
  console.log(`Total products in store: ${total}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");
const Product = require("../models/Product");

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const sellers = await User.find({ role: "seller" }).select("name email storeId storeName").lean();
  console.log("SELLERS", JSON.stringify(sellers, null, 2));
  const products = await Product.find().select("name storeId barcode currentStock").lean();
  console.log(
    "PRODUCTS",
    products.map((p) => ({
      name: p.name,
      storeId: String(p.storeId),
      barcode: p.barcode,
      stock: p.currentStock,
    }))
  );
  for (const s of sellers) {
    const sid = s.storeId || s._id;
    const n = await Product.countDocuments({ storeId: sid });
    console.log(s.email || s.name, "storeId", String(sid), "productCount", n);
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

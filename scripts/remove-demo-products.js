require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("../models/Product");
const User = require("../models/User");

const DEMO_BARCODES = [
  "4800016001234",
  "4800016005678",
  "4800016009012",
  "4800016003456",
  "4800016007890",
  "4800016001111",
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const sellers = await User.find({ role: "seller" });
  let deleted = 0;
  for (const seller of sellers) {
    const storeId = seller.storeId || seller._id;
    const result = await Product.deleteMany({
      storeId,
      barcode: { $in: DEMO_BARCODES },
    });
    deleted += result.deletedCount || 0;
  }
  // Also remove by known demo names if barcode missing
  const byName = await Product.deleteMany({
    name: {
      $in: [
        "Lucky Me Pancit Canton",
        "Coca-Cola 1.5L",
        "Sardines in Tomato Sauce",
        "Safeguard Soap",
        "Joy Dishwashing Liquid",
        "Chippy Extruded Corn",
      ],
    },
  });
  deleted += byName.deletedCount || 0;

  const remaining = await Product.find().select("name barcode storeId").lean();
  console.log("Deleted demo products:", deleted);
  console.log(
    "Remaining products:",
    remaining.map((p) => ({ name: p.name, barcode: p.barcode }))
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

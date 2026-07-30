require("dotenv").config();
const connectDb = require("./config/db");
const { initFirebaseAdmin } = require("./config/firebase");
const User = require("./models/User");
const Product = require("./models/Product");
const Sale = require("./models/Sale");

async function seed() {
  await connectDb();
  initFirebaseAdmin();

  await Promise.all([Sale.deleteMany({}), Product.deleteMany({}), User.deleteMany({})]);

  const seller = await User.create({
    firebaseUid: "seed-seller-uid",
    name: "Demo Seller Store",
    email: "seller@demo.local",
    phone: null,
    role: "seller",
  });
  seller.storeId = seller._id;
  await seller.save();

  const buyer = await User.create({
    firebaseUid: "seed-buyer-uid",
    name: "Demo Buyer",
    email: "buyer@demo.local",
    phone: null,
    role: "buyer",
  });

  const products = await Product.insertMany([
    {
      storeId: seller.storeId,
      name: "Lucky Me Pancit Canton",
      category: "Snacks",
      unitPrice: 15,
      currentStock: 50,
      barcode: "4800016001234",
      lowStockThreshold: 10,
    },
    {
      storeId: seller.storeId,
      name: "Coca-Cola 1.5L",
      category: "Beverages",
      unitPrice: 65,
      currentStock: 30,
      barcode: "4800016005678",
      lowStockThreshold: 5,
    },
    {
      storeId: seller.storeId,
      name: "Sardines in Tomato Sauce",
      category: "Canned Goods",
      unitPrice: 28,
      currentStock: 3,
      barcode: "4800016009012",
      lowStockThreshold: 5,
    },
    {
      storeId: seller.storeId,
      name: "Safeguard Soap",
      category: "Personal Care",
      unitPrice: 35,
      currentStock: 20,
      barcode: "4800016003456",
      lowStockThreshold: 5,
    },
    {
      storeId: seller.storeId,
      name: "Joy Dishwashing Liquid",
      category: "Household",
      unitPrice: 45,
      currentStock: 2,
      barcode: "4800016007890",
      lowStockThreshold: 5,
    },
    {
      storeId: seller.storeId,
      name: "Chippy Extruded Corn",
      category: "Snacks",
      unitPrice: 12,
      currentStock: 40,
      barcode: "4800016001111",
      lowStockThreshold: 8,
    },
  ]);

  await Sale.create({
    storeId: seller.storeId,
    buyerId: buyer._id,
    items: [
      {
        productId: products[0]._id,
        name: products[0].name,
        qty: 2,
        unitPrice: products[0].unitPrice,
      },
      {
        productId: products[1]._id,
        name: products[1].name,
        qty: 1,
        unitPrice: products[1].unitPrice,
      },
    ],
    totalAmount: products[0].unitPrice * 2 + products[1].unitPrice,
    timestamp: new Date(),
  });

  console.log("Inventory seeded.");
  console.log("Sign in with Google or Phone in the app (Firebase Auth).");
  console.log("On first login, choose Seller or Buyer to create your Mongo profile.");
  console.log(`Products seeded: ${products.length}`);

  process.exit(0);
}

seed().catch((error) => {
  console.error("Seed failed:", error.message || error);
  process.exit(1);
});

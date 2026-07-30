const mongoose = require("mongoose");

const saleItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    qty: {
      type: Number,
      required: true,
      min: 1,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: true }
);

const saleSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    items: {
      type: [saleItemSchema],
      default: [],
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    fulfillmentType: {
      type: String,
      enum: ["pickup", "pos"],
      default: "pickup",
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "ready", "completed", "cancelled"],
      default: "pending",
      index: true,
    },
    note: {
      type: String,
      default: "",
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Sale", saleSchema);

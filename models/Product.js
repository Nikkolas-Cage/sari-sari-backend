const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    currentStock: {
      type: Number,
      default: 0,
      min: 0,
    },
    barcode: {
      type: String,
      trim: true,
      index: true,
      sparse: true,
    },
    imageUrl: {
      type: String,
      default: null,
    },
    lowStockThreshold: {
      type: Number,
      default: 5,
      min: 1,
    },
    viewCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    clickCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Product", productSchema);

const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "message",
        "inquire",
        "cart_add",
        "order",
        "order_confirmed",
        "order_ready",
        "order_completed",
        "order_cancelled",
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    body: {
      type: String,
      default: "",
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    actorName: {
      type: String,
      default: "",
    },
    actorAvatarUrl: {
      type: String,
      default: null,
    },
    href: {
      type: String,
      default: "",
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);

const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
    lastMessagePreview: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

conversationSchema.index({ participants: 1 });

const attachmentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["image", "file"],
      default: "file",
    },
    url: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      default: "attachment",
    },
    mimeType: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000,
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      default: "sent",
    },
  },
  { timestamps: true }
);

module.exports = {
  Conversation: mongoose.model("Conversation", conversationSchema),
  Message: mongoose.model("Message", messageSchema),
};

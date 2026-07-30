require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const connectDb = require("./config/db");
const { attachWebSocket } = require("./config/ws");

const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const salesRoutes = require("./routes/sales");
const chatRoutes = require("./routes/chat");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/notifications", require("./routes/notifications"));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const server = http.createServer(app);

connectDb()
  .then(() => {
    const realtime = attachWebSocket(server);
    app.set("realtime", realtime);

    server.listen(PORT, () => {
      console.log(`Sari-Sari backend running on http://localhost:${PORT}`);
      console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
    });
  })
  .catch((error) => {
    console.error("Failed to connect to MongoDB", error);
    process.exit(1);
  });

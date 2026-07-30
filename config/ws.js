const { WebSocketServer } = require("ws");
const { verifyIdToken } = require("../config/firebase");
const User = require("../models/User");
const { findUserForAuth } = require("../middleware/auth");

/** @type {Map<string, Set<import('ws').WebSocket>>} */
const rooms = new Map();

function roomAdd(room, ws) {
  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room).add(ws);
}

function roomRemove(room, ws) {
  const set = rooms.get(room);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) rooms.delete(room);
}

function broadcast(room, payload, except = null) {
  const set = rooms.get(room);
  if (!set) return;
  const raw = JSON.stringify(payload);
  for (const client of set) {
    if (client !== except && client.readyState === 1) {
      client.send(raw);
    }
  }
}

function broadcastAll(payload) {
  const raw = JSON.stringify(payload);
  for (const set of rooms.values()) {
    for (const client of set) {
      if (client.readyState === 1) client.send(raw);
    }
  }
}

function attachWebSocket(server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", async (ws, req) => {
    ws.isAlive = true;
    ws.userId = null;
    ws.role = null;
    ws.rooms = new Set();

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    try {
      const url = new URL(req.url, "http://localhost");
      const token = url.searchParams.get("token");
      if (!token) {
        ws.close(4001, "Missing token");
        return;
      }
      const decoded = await verifyIdToken(token);
      const user = await findUserForAuth(decoded);
      if (!user) {
        ws.close(4003, "No profile");
        return;
      }
      ws.userId = user._id.toString();
      ws.role = user.role;
      ws.storeId = user.storeId ? user.storeId.toString() : user._id.toString();

      // Global + role rooms
      roomAdd("products", ws);
      ws.rooms.add("products");
      roomAdd(`user:${ws.userId}`, ws);
      ws.rooms.add(`user:${ws.userId}`);
      if (ws.role === "seller") {
        roomAdd(`orders:store:${ws.storeId}`, ws);
        ws.rooms.add(`orders:store:${ws.storeId}`);
      } else {
        roomAdd(`orders:buyer:${ws.userId}`, ws);
        ws.rooms.add(`orders:buyer:${ws.userId}`);
      }

      ws.send(JSON.stringify({ type: "connected", userId: ws.userId, role: ws.role }));
    } catch (error) {
      console.error("WS auth failed:", error.message);
      ws.close(4001, "Auth failed");
      return;
    }

    ws.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }

      if (msg.type === "join" && msg.room) {
        roomAdd(msg.room, ws);
        ws.rooms.add(msg.room);
        return;
      }

      if (msg.type === "leave" && msg.room) {
        roomRemove(msg.room, ws);
        ws.rooms.delete(msg.room);
        return;
      }

      if (msg.type === "chat:typing" && msg.conversationId) {
        broadcast(
          `chat:${msg.conversationId}`,
          {
            type: "chat:typing",
            conversationId: msg.conversationId,
            userId: ws.userId,
            isTyping: Boolean(msg.isTyping),
          },
          ws
        );
        return;
      }

      if (msg.type === "chat:read" && msg.conversationId) {
        broadcast(`chat:${msg.conversationId}`, {
          type: "chat:read",
          conversationId: msg.conversationId,
          userId: ws.userId,
          messageIds: msg.messageIds || [],
        });
      }
    });

    ws.on("close", () => {
      for (const room of ws.rooms || []) {
        roomRemove(room, ws);
      }
    });
  });

  const interval = setInterval(() => {
    for (const client of wss.clients) {
      if (!client.isAlive) {
        client.terminate();
        continue;
      }
      client.isAlive = false;
      client.ping();
    }
  }, 30000);

  wss.on("close", () => clearInterval(interval));

  return {
    broadcast,
    broadcastAll,
    broadcastProduct(event, product) {
      broadcast("products", { type: `product:${event}`, product });
    },
    broadcastAnalytics(product) {
      const storeId = product.storeId?.toString?.() || product.storeId;
      if (!storeId) return;
      broadcast(`orders:store:${storeId}`, {
        type: "analytics:update",
        product,
      });
    },
    broadcastOrder(event, order) {
      const storeId = order.storeId?.toString?.() || order.storeId;
      const buyerId = order.buyerId?.toString?.() || order.buyerId;
      const payload = { type: `order:${event}`, order };
      if (storeId) broadcast(`orders:store:${storeId}`, payload);
      if (buyerId) broadcast(`orders:buyer:${buyerId}`, payload);
    },
    broadcastChat(conversationId, payload) {
      broadcast(`chat:${conversationId}`, payload);
    },
    joinChatRoom(wsHintIgnored, conversationId) {
      // clients join via message; helper for server-side announce
      broadcast(`chat:${conversationId}`, { type: "chat:room", conversationId });
    },
  };
}

module.exports = { attachWebSocket };

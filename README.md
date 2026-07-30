# Sari-Sari Store — Backend

**Final submission of Nico Guarnes**  
**MITC 702 — Advance Database Systems (2026)**

API and realtime server for **Choice A: The Sari-Sari Store System** (The “Data Integrity” Path).

Companion frontend: Next.js web app (seller POS + buyer shop).

---

## Project choice & platform

| Item | Decision |
|------|----------|
| **App** | **A.** Sari-Sari Store System |
| **Client platform** | **Web** |
| **Auth** | **Firebase Authentication** (verified with Firebase Admin) |
| **Primary database** | **MongoDB** (Mongoose) for products, sales, orders, users, chat, notifications |

### Why Web + Firebase Auth + MongoDB

- **Web** fits counter/tablet POS, shared shop URL, and browser barcode/camera workflows.
- **Firebase Auth** satisfies the course Firebase requirement for secure sign-in (email, Google, phone) without storing passwords in our DB.
- **MongoDB** holds transactional store data (stock, sales history, pickup orders) with flexible documents and easy realtime-driven updates—production-ready alongside Express and WebSockets.

See the frontend README for the full UX feature list and platform justification.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Runtime | **Node.js** |
| HTTP API | **Express 5** |
| Auth | **Firebase Admin SDK** (ID token verification) |
| Database | **MongoDB** + **Mongoose** |
| Realtime | **ws** (WebSocket) at `/ws` |
| Config | **dotenv**, **cors** |

### Main modules

| Path | Responsibility |
|------|----------------|
| `routes/auth.js` | Profile bootstrap, role, store settings |
| `routes/products.js` | CRUD, stock, barcode lookup, view/click analytics |
| `routes/sales.js` | POS checkout, sales history, pickup orders |
| `routes/chat.js` | Conversations, messages, receipts |
| `routes/notifications.js` | In-app notifications |
| `config/ws.js` | Rooms for products, orders, chat, analytics |
| `models/` | User, Product, Sale, Chat, Notification |

---

## Features covered (API side)

### Required (Choice A)

1. **Stock entry & management** — product registration, stock increments/updates, barcode fetch, image URL persistence, low-stock queries  
2. **POS / transactions** — cart checkout with stock validation, atomic stock deduction, `SalesHistory`-style sale records  
3. **History & alerts** — sales listing with totals/timestamps; products under low-stock threshold  

### Value-added (API)

- Pickup order lifecycle (pending → confirmed → ready → completed)  
- Buyer–seller chat + inquire-from-product  
- Notifications service + WebSocket fan-out  
- Product engagement analytics (`viewCount` / `clickCount`) with live `analytics:update` events  

---

## How to run

### Prerequisites

- Node.js 18+
- MongoDB running locally (or a cloud URI)
- Firebase project with Authentication enabled + service account key

### 1. Install

```bash
cd sari-sari-backend
npm install
```

### 2. Environment

Copy `.env.example` → `.env`:

```env
PORT=3001
FRONTEND_URL=http://localhost:3000
MONGODB_URI=mongodb://127.0.0.1:27017/sari-sari-store

FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----\n"
```

Keep `\n` inside the quoted `FIREBASE_PRIVATE_KEY`.

More detail: [`FIREBASE_SETUP.md`](./FIREBASE_SETUP.md)

### 3. Start MongoDB

Ensure MongoDB is listening (example local URI above).

### 4. Start the API

```bash
npm run dev
```

You should see:

```text
Sari-Sari backend running on http://localhost:3001
WebSocket available at ws://localhost:3001/ws
```

### 5. Optional seed

```bash
npm run seed
```

Only when your seed script and Firebase env are configured. Prefer not wiping production-like user data.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` / `npm start` | Start API + WebSocket on port **3001** |
| `npm run seed` | Seed demo data (if configured) |

---

## API & realtime overview

- **REST base:** `http://localhost:3001/api`  
- **Auth:** `Authorization: Bearer <Firebase ID token>`  
- **WebSocket:** `ws://localhost:3001/ws?token=<Firebase ID token>`  

Typical event types: `product:*`, `order:*`, `chat:*`, `notification:*`, `analytics:update`.

---

## Course deliverables (context)

1. **Complete functional system** — this backend + frontend repository  
2. **Video demonstration**  
3. **Description & justification** — documented here and in the frontend README  

**Choice:** Letter **A** — Sari-Sari Store System  

---

## Author

**Nico G. Guarnes**  
MITC 702 — Advance Database Systems (2026)

Repository: [github.com/Nikkolas-Cage/sari-sari-backend](https://github.com/Nikkolas-Cage/sari-sari-backend)

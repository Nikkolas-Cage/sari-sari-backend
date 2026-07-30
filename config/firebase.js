const admin = require("firebase-admin");

let initialized = false;

function initFirebaseAdmin() {
  if (initialized) return admin;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase Admin env vars. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY."
    );
  }

  // Handle quoted keys and escaped newlines from .env
  privateKey = privateKey.trim();
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  }
  privateKey = privateKey.replace(/\\n/g, "\n");

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
    });
  }

  initialized = true;
  return admin;
}

async function verifyIdToken(idToken) {
  const firebaseAdmin = initFirebaseAdmin();
  return firebaseAdmin.auth().verifyIdToken(idToken);
}

module.exports = { initFirebaseAdmin, verifyIdToken, admin };

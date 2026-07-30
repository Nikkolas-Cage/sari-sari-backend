# Firebase Auth setup (Auth only — MongoDB still stores products/sales)

## 1. Create a Firebase project
1. Go to https://console.firebase.google.com/
2. Create a project (or use an existing one)
3. Enable **Authentication → Sign-in method**:
   - Email/Password
   - Google
   - Phone

## 2. Frontend web config
1. Project settings → Your apps → Add Web app
2. Copy the config values into:
   `sari-sari-frontend/sari-sari-frontend/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

## 3. Backend Admin SDK
1. Project settings → Service accounts → Generate new private key
2. Open the downloaded JSON and map fields into `sari-sari-backend/.env`:

```env
FIREBASE_PROJECT_ID=<project_id>
FIREBASE_CLIENT_EMAIL=<client_email>
FIREBASE_PRIVATE_KEY="<private_key>"
```

Keep the `\n` characters inside `FIREBASE_PRIVATE_KEY` (quoted string).

## 4. Run
```bash
# backend
cd sari-sari-backend
npm install
npm run seed
npm run dev

# frontend
cd sari-sari-frontend/sari-sari-frontend
npm install
npm run dev
```

## 5. Enable sign-in methods
In Firebase Console → Authentication → Sign-in method, enable:
- **Email/Password**
- **Google**
- **Phone**

### Google provider (Web)
1. Authentication → Sign-in method → Google → Enable
2. Set a project support email
3. Under **Web SDK configuration**, use your OAuth Web Client ID:

```
610885968723-tddn66aqdsjdgbl2oume9rncrlm40j2r.apps.googleusercontent.com
```

4. Keep the **Web client secret in Google Cloud Console only**
   - Do **not** put the client secret in `.env.local` or frontend code
   - Firebase web `signInWithPopup` does not need the secret in your Next.js app

5. In Google Cloud Console → APIs & Services → Credentials → that OAuth client:
   - Authorized JavaScript origins: `http://localhost:3000`, `http://localhost:3001`
   - Authorized redirect URIs: `https://final-project-mitc-702.firebaseapp.com/__/auth/handler`

For Phone auth local testing, add test numbers under Phone → Phone numbers for testing
(e.g. `+639171234567` / code `123456`).

Authorized domains should include `localhost`.

## Architecture
- **Firebase Auth**: identity (email/password, Google, phone + ID tokens)
- **MongoDB**: app profile (`firebaseUid`, role, storeId, products, sales)
- Every successful Firebase login calls the backend and **upserts/syncs** the MongoDB user record

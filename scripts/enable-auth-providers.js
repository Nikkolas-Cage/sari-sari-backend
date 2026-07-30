require("dotenv").config();
const { GoogleAuth } = require("google-auth-library");

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY.trim();
if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
  privateKey = privateKey.slice(1, -1);
}
privateKey = privateKey.replace(/\\n/g, "\n");

const googleClientId =
  "610885968723-tddn66aqdsjdgbl2oume9rncrlm40j2r.apps.googleusercontent.com";

async function main() {
  const auth = new GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
    scopes: [
      "https://www.googleapis.com/auth/identitytoolkit",
      "https://www.googleapis.com/auth/firebase",
      "https://www.googleapis.com/auth/cloud-platform",
    ],
  });

  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const headers = {
    Authorization: `Bearer ${tokenResponse.token}`,
    "Content-Type": "application/json",
  };

  const configUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config?updateMask=signIn.email,signIn.phoneNumber`;
  const configRes = await fetch(configUrl, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      signIn: {
        email: { enabled: true, passwordRequired: true },
        phoneNumber: { enabled: true },
      },
    }),
  });
  console.log("Enable Email/Phone:", configRes.status);
  console.log(await configRes.text());

  const googleUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/defaultSupportedIdpConfigs/google.com`;
  const getGoogle = await fetch(googleUrl, { headers });
  console.log("Get Google config:", getGoogle.status);
  const googleExisting = await getGoogle.text();
  console.log(googleExisting);

  if (getGoogle.status === 404) {
    const createUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/defaultSupportedIdpConfigs?idpId=google.com`;
    const createRes = await fetch(createUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        enabled: true,
        clientId: googleClientId,
        // Client secret must be set in Firebase Console for Google.
        clientSecret: "REPLACE_IN_FIREBASE_CONSOLE",
      }),
    });
    console.log("Create Google provider:", createRes.status);
    console.log(await createRes.text());
  } else {
    const patchRes = await fetch(`${googleUrl}?updateMask=enabled,clientId`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        enabled: true,
        clientId: googleClientId,
      }),
    });
    console.log("Patch Google provider:", patchRes.status);
    console.log(await patchRes.text());
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

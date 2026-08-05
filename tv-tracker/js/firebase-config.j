/* =====================================================================
   FIREBASE CONFIG
   Replace the values below with your own project's config, which you
   can find in the Firebase Console:
   Project Settings → General → Your apps → SDK setup and configuration
   ===================================================================== */
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// Keep users signed in across sessions (this is Firebase's own persistence
// layer, not browser localStorage used directly by app code).
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});

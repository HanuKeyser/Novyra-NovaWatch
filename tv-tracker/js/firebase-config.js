/* =====================================================================
   FIREBASE CONFIG — NovaWatch
   ===================================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyCzUprsMVHt_-YHvLImvanTlTXsyQ9sqOU",
  authDomain: "novawatch-b3ccd.firebaseapp.com",
  projectId: "novawatch-b3ccd",
  storageBucket: "novawatch-b3ccd.firebasestorage.app",
  messagingSenderId: "836164657360",
  appId: "1:836164657360:web:b3de1169942816d0d27ed5",
  measurementId: "G-H6TMK6C7D0"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// Analytics is optional and can fail silently (ad blockers, unsupported
// environments, or being served from a non-authorized domain) — never let
// it block the rest of the app from working.
let analytics;
try {
  if (firebase.analytics && firebase.analytics.isSupported) {
    firebase.analytics.isSupported().then(supported => {
      if (supported) analytics = firebase.analytics();
    }).catch(() => {});
  } else if (firebase.analytics) {
    analytics = firebase.analytics();
  }
} catch (e) { /* analytics unavailable — app continues normally */ }

// Keep users signed in across sessions (this is Firebase's own persistence
// layer, not browser localStorage used directly by app code).
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});

/* =====================================================================
   FIREBASE CONFIG
   Replace the values below with your own project's config, which you
   can find in the Firebase Console:
   Project Settings → General → Your apps → SDK setup and configuration
   ===================================================================== */
const firebaseConfig = {
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

// Keep users signed in across sessions (this is Firebase's own persistence
// layer, not browser localStorage used directly by app code).
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});

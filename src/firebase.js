import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDDz2me631kdPkdJf7ILJwGBpAmZY9Z8M8",
  authDomain: "test-6f59c.firebaseapp.com",
  projectId: "test-6f59c",
  storageBucket: "test-6f59c.firebasestorage.app",
  messagingSenderId: "49847018688",
  appId: "1:49847018688:web:8335cef397fb1fefaf7925",
  measurementId: "G-EKT9886GGK"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
import { initializeApp } from "@firebase/app";
import type { FirebaseOptions } from "firebase/app";
import { getFirestore } from "@firebase/firestore";

const firebaseConfig: FirebaseOptions = {
  apiKey: "AIzaSyA28HgT58UsGwOz-4UkqBWjxwHVeQdKV-8",
  authDomain: "p2p-drop.firebaseapp.com",
  projectId: "p2p-drop",
  storageBucket: "p2p-drop.appspot.com",
  messagingSenderId: "100478392820",
  appId: "1:100478392820:web:f2b0ade5e3f4b42cafc1a1",
  measurementId: "G-LYPT0VXSLN",
};

const fb = initializeApp(firebaseConfig);
const db = getFirestore(fb);

export { fb, db };

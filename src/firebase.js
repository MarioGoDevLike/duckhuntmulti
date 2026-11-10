import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
// Server-only reads: the default getDoc/getDocs silently fall back to an empty offline cache when
// Firestore can't be reached, which made a broken setup look like an empty leaderboard.
import { getFirestore, doc, getDocFromServer as getDoc, setDoc, collection, query, orderBy, limit, getDocsFromServer as getDocs, serverTimestamp } from 'firebase/firestore';

const e = import.meta.env;
// Without credentials in .env the game still runs; sign-in and the leaderboard are simply hidden.
export const enabled = !!e.VITE_FIREBASE_API_KEY;

let auth, db;
if (enabled) {
  const app = initializeApp({
    apiKey: e.VITE_FIREBASE_API_KEY,
    authDomain: e.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: e.VITE_FIREBASE_PROJECT_ID,
    storageBucket: e.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: e.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: e.VITE_FIREBASE_APP_ID,
  });
  auth = getAuth(app); db = getFirestore(app);
}

export const watchUser = cb => (enabled ? onAuthStateChanged(auth, cb) : () => {});
export const login = () => signInWithPopup(auth, new GoogleAuthProvider());
export const logout = () => signOut(auth);

// One document per player (id = uid), holding only their best game.
export async function submitScore(user, score, ducks) {
  const ref = doc(db, 'scores', user.uid), snap = await getDoc(ref);
  if (snap.exists() && snap.data().score >= score) return;
  await setDoc(ref, { name: user.displayName || 'Hunter', score, ducks, updatedAt: serverTimestamp() });
}

export async function topScores(n = 10) {
  const snap = await getDocs(query(collection(db, 'scores'), orderBy('score', 'desc'), limit(n)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

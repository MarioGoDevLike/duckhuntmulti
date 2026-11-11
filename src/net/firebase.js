import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
// Server-only reads: the default getDoc/getDocs silently fall back to an empty offline cache when
// Firestore can't be reached, which made a broken setup look like an empty leaderboard.
import {
  getFirestore, doc, getDocFromServer as getDoc, setDoc, updateDoc, collection, query, orderBy, limit,
  getDocsFromServer as getDocs, serverTimestamp, runTransaction, onSnapshot, arrayUnion, arrayRemove, Timestamp,
} from 'firebase/firestore';

const e = import.meta.env;
// Without credentials in .env the game still runs; sign-in, rooms and the leaderboard are simply hidden.
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

/* ---------- leaderboards ----------
   leaderboards/{quarry}/scores/{uid}   { name, score, ducks (birds bagged), updatedAt }
   One board per quarry (duck | finch | thrush), one document per player on each, holding only their best hunt there.
   (The single board from before quarry choice, scores/{uid}, is no longer read.) */
const boardScores = quarry => collection(db, 'leaderboards', quarry, 'scores');

export async function submitScore(user, quarry, score, ducks) {
  const ref = doc(boardScores(quarry), user.uid), snap = await getDoc(ref);
  if (snap.exists() && snap.data().score >= score) return;
  await setDoc(ref, { name: user.displayName || 'Hunter', score, ducks, updatedAt: serverTimestamp() });
}

export async function topScores(quarry, n = 10) {
  const snap = await getDocs(query(boardScores(quarry), orderBy('score', 'desc'), limit(n)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* ---------- rooms ----------
   rooms/{code}                         { members: [uid] (max 4), status: 'lobby'|'play', round, seed, slots: [uid], startAt, endAt }
   rooms/{code}/players/{uid}           { name, weapon, score, ducks, round, yaw, pitch, shots, joinedAt }
   rooms/{code}/rounds/{n}/kills/{duck} { by }  create-only, so the first hunter to claim a bird gets it */
export const MAX_PLAYERS = 4;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const roomRef = code => doc(db, 'rooms', code);
const playerRef = (code, uid) => doc(db, 'rooms', code, 'players', uid);
const nameOf = user => (user.displayName || 'Hunter').split(' ')[0];
export const roundOver = (room, now) => room.status !== 'play' || room.endAt.toMillis() <= now;

// Writes our player card and returns serverTime − localTime, so all clocks agree on when a round starts.
async function enter(code, user, weapon) {
  const ref = playerRef(code, user.uid), t0 = Date.now();
  await setDoc(ref, { name: nameOf(user), weapon, score: 0, ducks: 0, round: 0, yaw: 0, pitch: 0, shots: 0, joinedAt: serverTimestamp() });
  const t1 = Date.now(), snap = await getDoc(ref);
  return snap.data().joinedAt.toMillis() - (t0 + t1) / 2;
}

export async function createRoom(user, weapon) {
  for (let i = 0; i < 5; i++) {
    const code = Array.from({ length: 5 }, () => CODE_CHARS[Math.random() * CODE_CHARS.length | 0]).join('');
    const made = await runTransaction(db, async tx => {
      if ((await tx.get(roomRef(code))).exists()) return false;
      tx.set(roomRef(code), { members: [user.uid], status: 'lobby', round: 0, createdAt: serverTimestamp() });
      return true;
    });
    if (made) return { code, offset: await enter(code, user, weapon) };
  }
  throw new Error('Could not create a room — try again.');
}

export async function joinRoom(rawCode, user, weapon) {
  const code = rawCode.trim().toUpperCase();
  await runTransaction(db, async tx => {
    const s = await tx.get(roomRef(code));
    if (!s.exists()) throw new Error('No room with that code.');
    const r = s.data();
    if (r.members.includes(user.uid)) return;
    if (r.members.length >= MAX_PLAYERS) throw new Error('That room is full.');
    if (!roundOver(r, Date.now())) throw new Error('That room is mid-hunt — try again when the round ends.');
    tx.update(roomRef(code), { members: arrayUnion(user.uid) });
  });
  return { code, offset: await enter(code, user, weapon) };
}

export const leaveRoom = (code, uid) => updateDoc(roomRef(code), { members: arrayRemove(uid) });

// Starts a round 5 s from now (server time) for everyone in the room. Safe to call from several
// clients at once: the transaction lets only one of them start it. firstOnly: the auto-start when the room fills.
// quarry: what everyone hunts this round, chosen by whoever starts it.
export const startRound = (code, offset, seconds, quarry, firstOnly = false) => runTransaction(db, async tx => {
  const s = await tx.get(roomRef(code)), r = s.data(), now = Date.now() + offset;
  if (r.members.length < 2 || !roundOver(r, now) || (firstOnly && r.round > 0)) return;
  const startAt = now + 5000;
  tx.update(roomRef(code), {
    status: 'play', round: r.round + 1, seed: Math.random() * 2 ** 31 | 0, slots: r.members, quarry,
    startAt: Timestamp.fromMillis(startAt), endAt: Timestamp.fromMillis(startAt + seconds * 1000),
  });
});

export const watchRoom = (code, cb, onErr) => onSnapshot(roomRef(code), s => cb(s.data()), onErr);
export const watchPlayers = (code, cb) =>
  onSnapshot(collection(db, 'rooms', code, 'players'), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));
// cb(duckId, uid) once for every bird claimed this round, by anyone.
export const watchKills = (code, round, cb) => onSnapshot(collection(db, 'rooms', code, 'rounds', String(round), 'kills'),
  s => s.docChanges().forEach(c => { if (c.type === 'added') cb(+c.doc.id, c.doc.data().by); }));
// Resolves true if we claimed the bird first; the rules refuse a second claim, which rejects here.
export const claimKill = (code, round, duckId, uid) =>
  setDoc(doc(db, 'rooms', code, 'rounds', String(round), 'kills', String(duckId)), { by: uid }).then(() => true, () => false);
export const updatePlayer = (code, uid, data) => updateDoc(playerRef(code, uid), data).catch(err => console.warn(err));

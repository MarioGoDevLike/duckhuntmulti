import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
// Server-only reads: the default getDoc/getDocs silently fall back to an empty offline cache when
// Firestore can't be reached, which made a broken setup look like an empty leaderboard.
import {
  getFirestore, doc, getDocFromServer as getDoc, setDoc, updateDoc, collection, query, orderBy, limit,
  getDocsFromServer as getDocs, serverTimestamp, runTransaction, onSnapshot, arrayUnion, arrayRemove, Timestamp,
  where, writeBatch, deleteDoc,
} from 'firebase/firestore';
// The Realtime Database carries only the live channel (every hunter's aim and the lamp, 2–10 a second): it charges by data,
// where Firestore charges by write, and three hunters writing their aim into Firestore spent its daily quota in no time.
import { getDatabase, ref, set, onValue, onDisconnect, remove } from 'firebase/database';

const e = import.meta.env;
// Without credentials in .env the game still runs; sign-in, rooms and the leaderboard are simply hidden.
export const enabled = !!e.VITE_FIREBASE_API_KEY;

// The live channel needs the Realtime Database's URL too; without it, poses go through Firestore (slower, and quota-hungry).
export const liveEnabled = enabled && !!e.VITE_FIREBASE_DATABASE_URL;

let auth, db, rtdb;
if (enabled) {
  const app = initializeApp({
    apiKey: e.VITE_FIREBASE_API_KEY,
    authDomain: e.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: e.VITE_FIREBASE_PROJECT_ID,
    storageBucket: e.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: e.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: e.VITE_FIREBASE_APP_ID,
    ...(liveEnabled ? { databaseURL: e.VITE_FIREBASE_DATABASE_URL } : {}),
  });
  auth = getAuth(app); db = getFirestore(app);
  if (liveEnabled) rtdb = getDatabase(app);
}

export const watchUser = cb => (enabled ? onAuthStateChanged(auth, cb) : () => {});
export const login = () => signInWithPopup(auth, new GoogleAuthProvider());
export const logout = () => signOut(auth);

/* ---------- leaderboards ----------
   leaderboards/{quarry}/scores/{uid}   { name, score, ducks (birds bagged), updatedAt }
   One board per quarry (duck | finch | thrush | dove | woodcock | night), one document per player on each, holding only their best hunt there.
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
   rooms/{code}                         { members: [uid] (max 4), status: 'lobby'|'play', round, seed, slots: [uid], startAt, endAt,
                                          quarry, map, lamp (night: the lamper's uid), createdAt, touchedAt (last create/join/
                                          round start), closing (the last member is deleting it) }
   The host is members[0]: the creator, then the longest-standing member once they leave. Only the host picks the quarry and
   map (written here between rounds too, so everyone sees what comes next) and starts a round.
   Only rooms in use are kept: the last member to leave deletes the room and everything under it (wipeRoom), and rooms
   left by closed tabs are swept once untouched for STALE_MS. The leaderboards are never touched.
   rooms/{code}/players/{uid}           { name, weapon, role ('gun'|'lamp', night), score, ducks, round, yaw, pitch, shots, lamp?, joinedAt }
   rooms/{code}/rounds/{n}/kills/{duck} { by }  create-only, so the first hunter to claim a bird gets it
   rooms/{code}/rounds/{n}/events/{id}  { t, by, … }  night: what the lamper's screen decided (game/night.js), and callouts
   Realtime Database: live/{code}/{uid}  { yaw, pitch, shots, lamp?, round }  poses, 2 a second (10 at night) */
export const MAX_PLAYERS = 4;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const roomRef = code => doc(db, 'rooms', code);
const playerRef = (code, uid) => doc(db, 'rooms', code, 'players', uid);
const nameOf = user => (user.displayName || 'Hunter').split(' ')[0];
export const roundOver = (room, now) => room.status !== 'play' || room.endAt.toMillis() <= now;

// Writes our player card and returns serverTime − localTime, so all clocks agree on when a round starts.
async function enter(code, user, weapon) {
  const ref = playerRef(code, user.uid), t0 = Date.now();
  await setDoc(ref, { name: nameOf(user), weapon, role: 'gun', score: 0, ducks: 0, round: 0, yaw: 0, pitch: 0, shots: 0, joinedAt: serverTimestamp() });
  const t1 = Date.now(), snap = await getDoc(ref);
  return snap.data().joinedAt.toMillis() - (t0 + t1) / 2;
}

export const hostOf = room => room?.members?.[0];

// quarry, map: what the room hunts first, the creator's current pick.
export async function createRoom(user, weapon, quarry, map) {
  for (let i = 0; i < 5; i++) {
    const code = Array.from({ length: 5 }, () => CODE_CHARS[Math.random() * CODE_CHARS.length | 0]).join('');
    const made = await runTransaction(db, async tx => {
      if ((await tx.get(roomRef(code))).exists()) return false;
      tx.set(roomRef(code), { members: [user.uid], status: 'lobby', round: 0, quarry, map, createdAt: serverTimestamp(), touchedAt: serverTimestamp() });
      return true;
    });
    if (made) { sweepRooms().catch(err => console.warn(err)); return { code, offset: await enter(code, user, weapon) }; }
  }
  throw new Error('Could not create a room — try again.');
}

export async function joinRoom(rawCode, user, weapon) {
  const code = rawCode.trim().toUpperCase();
  await runTransaction(db, async tx => {
    const s = await tx.get(roomRef(code));
    if (!s.exists() || s.data().closing) throw new Error('No room with that code.');
    const r = s.data();
    if (r.members.includes(user.uid)) return;
    if (r.members.length >= MAX_PLAYERS) throw new Error('That room is full.');
    if (!roundOver(r, Date.now())) throw new Error('That room is mid-hunt — try again when the round ends.');
    tx.update(roomRef(code), { members: arrayUnion(user.uid), touchedAt: serverTimestamp() });
  });
  return { code, offset: await enter(code, user, weapon) };
}

// The last one out deletes the room. It is marked closing first, so nobody joins while it is being emptied.
export async function leaveRoom(code, uid) {
  const last = await runTransaction(db, async tx => {
    const s = await tx.get(roomRef(code));
    if (!s.exists()) return null;
    const r = s.data();
    if (r.members.length === 1 && r.members[0] === uid) { tx.update(roomRef(code), { closing: true }); return r; }
    tx.update(roomRef(code), { members: arrayRemove(uid) });
    return null;
  });
  if (last) await wipeRoom(code, last.round || 0);
}

// Deletes a room and everything under it. Firestore leaves subcollections behind when their parent goes, so each is
// listed and emptied first; the room document goes last, since the rules look it up to allow the rest.
async function wipeRoom(code, rounds) {
  const cols = [collection(db, 'rooms', code, 'players')];
  for (let n = 1; n <= rounds; n++) {
    cols.push(collection(db, 'rooms', code, 'rounds', String(n), 'kills'), collection(db, 'rooms', code, 'rounds', String(n), 'events'));
  }
  const refs = (await Promise.all(cols.map(c => getDocs(c)))).flatMap(s => s.docs.map(d => d.ref));
  for (let i = 0; i < refs.length; i += 450) { // a batch holds at most 500 writes
    const b = writeBatch(db); refs.slice(i, i + 450).forEach(r => b.delete(r)); await b.commit();
  }
  await deleteDoc(roomRef(code));
}

// Rooms whose players closed the tab instead of leaving never empty, so whenever a room is opened, up to 10 rooms
// untouched for STALE_MS are cleared. (The rules allow anyone to delete a stale room; the client waits 10 minutes
// longer than they do, so a clock running fast here is still refused nothing.)
const STALE_MS = 3 * 3600e3;
async function sweepRooms() {
  const cutoff = Date.now() - STALE_MS - 600e3;
  const snap = await getDocs(query(collection(db, 'rooms'), where('createdAt', '<', Timestamp.fromMillis(cutoff)), orderBy('createdAt'), limit(10)));
  for (const d of snap.docs) {
    const r = d.data();
    if ((r.touchedAt || r.createdAt).toMillis() < cutoff) await wipeRoom(d.id, r.round || 0).catch(err => console.warn(err));
  }
}

// Starts a round 5 s from now (server time) for everyone in the room. Safe to call from several
// clients at once: the transaction lets only one of them start it. firstOnly: the auto-start when the room fills.
// quarry, map: what everyone hunts this round and where, chosen by whoever starts it. lamp: at night, who holds it.
export const startRound = (code, offset, seconds, quarry, map, firstOnly = false, lamp = null) => runTransaction(db, async tx => {
  const s = await tx.get(roomRef(code)), r = s.data(), now = Date.now() + offset;
  if (r.members.length < 2 || !roundOver(r, now) || (firstOnly && r.round > 0)) return;
  const startAt = now + 5000;
  tx.update(roomRef(code), {
    status: 'play', round: r.round + 1, seed: Math.random() * 2 ** 31 | 0, slots: r.members, quarry, map, lamp, touchedAt: serverTimestamp(),
    startAt: Timestamp.fromMillis(startAt), endAt: Timestamp.fromMillis(startAt + seconds * 1000),
  });
});

// The host's pick for the next round, shown to everyone in the lobby.
export const setRoomHunt = (code, quarry, map) => updateDoc(roomRef(code), { quarry, map }).catch(err => console.warn(err));
export const watchRoom = (code, cb, onErr) => onSnapshot(roomRef(code), s => cb(s.data()), onErr);
export const watchPlayers = (code, cb) =>
  onSnapshot(collection(db, 'rooms', code, 'players'), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));
// cb(duckId, uid) once for every bird claimed this round, by anyone.
export const watchKills = (code, round, cb) => onSnapshot(collection(db, 'rooms', code, 'rounds', String(round), 'kills'),
  s => s.docChanges().forEach(c => { if (c.type === 'added') cb(+c.doc.id, c.doc.data().by); }));
// Resolves true if we claimed the bird first; the rules refuse a second claim, which rejects here.
export const claimKill = (code, round, duckId, uid) =>
  setDoc(doc(db, 'rooms', code, 'rounds', String(round), 'kills', String(duckId)), { by: uid }).then(() => true, () => false);
// Night: what the lamper's screen decided, and the callouts. cb(ev) once for every event of the round, in order.
let evSeq = 0;
export const sendNightEvent = (code, round, uid, ev) => setDoc(
  doc(db, 'rooms', code, 'rounds', String(round), 'events', `${String(Date.now()).slice(-9)}-${String(evSeq++ % 1000).padStart(3, '0')}-${uid.slice(0, 6)}`),
  { ...ev, by: uid }).catch(err => console.warn(err));
export const watchNightEvents = (code, round, cb) => onSnapshot(collection(db, 'rooms', code, 'rounds', String(round), 'events'),
  s => s.docChanges().forEach(c => { if (c.type === 'added') cb(c.doc.data()); }));

// The live channel (Realtime Database): our pose, cleared when we disconnect; cb({ [uid]: pose }) on every change.
let armed = '';
export function publishLive(code, uid, data) {
  const path = `live/${code}/${uid}`, r = ref(rtdb, path);
  if (armed !== path) { armed = path; onDisconnect(r).remove().catch(err => console.warn(err)); } // gone when we drop off
  return set(r, data).catch(err => console.warn(err));
}
export const clearLive = (code, uid) => liveEnabled && remove(ref(rtdb, `live/${code}/${uid}`)).catch(() => {});
export const watchLive = (code, cb) => (liveEnabled ? onValue(ref(rtdb, `live/${code}`), s => cb(s.val() || {}), err => console.warn(err)) : () => {});

export const updatePlayer = (code, uid, data) => updateDoc(playerRef(code, uid), data).catch(err => console.warn(err));

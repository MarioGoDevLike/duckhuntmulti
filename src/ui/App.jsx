// The composition root: creates the game on the canvas, owns the screen flow (phase) and the room session,
// and bridges the engine's callbacks to React state and Firestore. Screens themselves are in components/.
import { useEffect, useRef, useState } from 'react';
import { GAME_TIME, WEAPONS, QUARRY } from '../config/gameplay.js';
import { createGame } from '../game/createGame.js';
import { birdPortraits } from '../entities/birds/portraits.js';
import { birdModelsReady } from '../entities/birds/models.js';
import { gunPortraits, gunModelsReady } from '../entities/weapons/portraits.js';
import {
  watchUser, login, MAX_PLAYERS, roundOver,
  createRoom, joinRoom, leaveRoom, startRound, watchRoom, watchPlayers, watchKills, claimKill, updatePlayer,
} from '../net/firebase.js';
import { KEYS, bestKey, store, read } from './lib/storage.js';
import { roomErrorText, signInErrorText } from './lib/messages.js';
import { useLeaderboard } from './hooks/useLeaderboard.js';
import { usePortrait } from './hooks/useDevice.js';
import { QuarryPicker, GunPicker } from './components/Pickers.jsx';
import Hud from './components/Hud.jsx';
import PauseMenu from './components/PauseMenu.jsx';
import HomeMenu from './components/HomeMenu.jsx';
import Lobby from './components/Lobby.jsx';
import HuntOver from './components/HuntOver.jsx';
import { RotatePrompt, FullscreenButton } from './components/MobileChrome.jsx';

const saved = (key, table, fallback) => (table[read(key)] ? read(key) : fallback);

export default function App() {
  const canvas = useRef(), game = useRef();
  const [phase, setPhase] = useState('home'); // home | lobby | play | paused | over
  const [tab, setTab] = useState('hunt');     // home menu: hunt | friends | board | controls
  const [weapon, setWeapon] = useState(() => saved(KEYS.weapon, WEAPONS, 'semi'));
  const [quarry, setQuarry] = useState(() => saved(KEYS.quarry, QUARRY, 'duck'));
  const [hud, setHud] = useState({ score: 0, ducks: 0, shells: 5, mag: 5, reloading: false, time: GAME_TIME });
  const [msg, setMsg] = useState({ id: 0, text: '' });
  const [result, setResult] = useState(null);
  // Personal best on each quarry, kept in this browser.
  const [bests, setBests] = useState(() => Object.fromEntries(Object.keys(QUARRY).map(k => [k, +read(bestKey(k)) || 0])));
  const say = text => setMsg(m => ({ id: m.id + 1, text }));
  const portrait = usePortrait();

  // Rendered from the 3D models; again once the loaded bird models have arrived.
  const [portraits, setPortraits] = useState(() => birdPortraits());
  useEffect(() => { let live = true; birdModelsReady.then(() => live && setPortraits(birdPortraits())); return () => { live = false; }; }, []);
  // The shotguns likewise: the procedural guns at first, the loaded models once they arrive.
  const [gunPics, setGunPics] = useState(() => gunPortraits());
  useEffect(() => { let live = true; gunModelsReady.then(m => live && setGunPics(gunPortraits(m))); return () => { live = false; }; }, []);

  // Account and leaderboard.
  const [user, setUser] = useState(null);
  const [signInErr, setSignInErr] = useState('');
  const [boardQuarry, setBoardQuarry] = useState(quarry); // which quarry's leaderboard the menu shows
  const board = useLeaderboard(user, result, boardQuarry);
  const netErr = signInErr || board.error;
  useEffect(() => watchUser(setUser), []);
  const signIn = () => login().then(() => setSignInErr(''), err => { console.error(err); setSignInErr(signInErrorText(err)); });

  // Room session. net mirrors what the engine callbacks (created once) need to read.
  const [room, setRoom] = useState(null);          // { code, offset } while in a room
  const [roomData, setRoomData] = useState(null);  // rooms/{code}
  const [players, setPlayers] = useState([]);      // rooms/{code}/players
  const [liveRound, setLiveRound] = useState(0);   // round this client is hunting in, 0 = none
  const [roomErr, setRoomErr] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const net = useRef({ round: 0 });

  /* ---------- the engine ---------- */
  useEffect(() => {
    game.current = createGame(canvas.current, {
      onHud: h => { setHud(h); net.current.hud = h; },
      onMsg: say,
      onPause: () => setPhase('paused'),
      // r.quarry is what was actually hunted (a room's pick in a room round), so the score goes on that board.
      onEnd: r => {
        const key = bestKey(r.quarry), prev = +read(key) || 0, record = r.score > prev, n = net.current;
        if (record) store(key, r.score);
        if (n.playing) { n.playing = false; updatePlayer(n.code, n.uid, { score: r.score, ducks: r.ducks }); }
        setBests(b => ({ ...b, [r.quarry]: Math.max(prev, r.score) })); setBoardQuarry(r.quarry);
        setResult({ ...r, record, round: n.code ? n.round : 0 }); setLiveRound(0); setPhase('over');
      },
      // Room only: claim the bird. If another hunter's claim landed first, the points come back off.
      onKill: (id, pts) => {
        const n = net.current; if (!n.playing) return;
        claimKill(n.code, n.round, id, n.uid).then(ok => {
          if (!n.playing) return;
          if (!ok) { game.current.revokeKill(pts); say('Another hunter got that one first'); }
          else updatePlayer(n.code, n.uid, { score: n.hud.score, ducks: n.hud.ducks });
        });
      },
      // Room only: share where we're looking (twice a second at most, and only when it changed) and our shots.
      onPose: ({ yaw, pitch, shots }) => {
        const n = net.current, l = n.pose; if (!n.playing) return;
        if (l && l.shots === shots && Math.abs(l.yaw - yaw) < 0.03 && Math.abs(l.pitch - pitch) < 0.03) return;
        n.pose = { yaw, pitch, shots };
        updatePlayer(n.code, n.uid, { yaw: +yaw.toFixed(3), pitch: +pitch.toFixed(3), shots });
      },
    });
    return () => game.current.dispose();
  }, []);

  /* ---------- rooms ---------- */
  useEffect(() => {
    if (!room) return;
    const offRoom = watchRoom(room.code, setRoomData, err => setRoomErr(roomErrorText(err)));
    const offPlayers = watchPlayers(room.code, setPlayers);
    return () => { offRoom(); offPlayers(); };
  }, [room]);

  // React to the room: auto-start the first hunt once it is full, and start our engine when a round begins.
  useEffect(() => {
    if (!room || !roomData || !user) return;
    const n = net.current;
    if (roomData.members.length >= MAX_PLAYERS && roomData.round === 0) startRound(room.code, room.offset, GAME_TIME, quarry, true).catch(console.error);
    if (roomData.status !== 'play' || roomData.round <= n.round || !roomData.slots.includes(user.uid)) return;
    const startAt = roomData.startAt.toMillis() - room.offset; // server time → this machine's clock
    if (startAt + GAME_TIME * 1000 <= Date.now()) return;     // that round already finished
    Object.assign(n, { round: roomData.round, playing: true, pose: null, code: room.code, uid: user.uid });
    updatePlayer(room.code, user.uid, { score: 0, ducks: 0, shots: 0, round: n.round, weapon });
    setMsg({ id: 0, text: '' });
    game.current.start(weapon, { seed: roomData.seed, startAt, slot: roomData.slots.indexOf(user.uid), count: roomData.slots.length, quarry: roomData.quarry || 'duck' });
    setLiveRound(n.round); setPhase('play');
  }, [roomData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Birds claimed by the others fall on our screen too.
  const names = useRef({});
  names.current = Object.fromEntries(players.map(p => [p.id, p.name]));
  useEffect(() => {
    if (!liveRound || !room || !user) return;
    return watchKills(room.code, liveRound, (id, by) => {
      if (by === user.uid) return;
      game.current.remoteKill(id, by); say(`${names.current[by] || 'A hunter'} dropped one`);
    });
  }, [liveRound]); // eslint-disable-line react-hooks/exhaustive-deps

  // The other hunters in this round, standing in the line with us.
  useEffect(() => {
    if (!liveRound || !roomData?.slots) return;
    game.current.setPeers(players
      .filter(p => p.id !== user?.uid && p.round === liveRound && roomData.slots.includes(p.id))
      .map(p => ({ ...p, slot: roomData.slots.indexOf(p.id) })));
  }, [players, liveRound]); // eslint-disable-line react-hooks/exhaustive-deps

  const enterRoom = promise => {
    game.current.unlockAudio(); setBusy(true); setRoomErr('');
    promise.then(r => { net.current = { round: 0 }; setRoomData(null); setPlayers([]); setRoom(r); setPhase('lobby'); },
      err => { console.error(err); setRoomErr(roomErrorText(err)); }).finally(() => setBusy(false));
  };
  const create = () => enterRoom(createRoom(user, weapon));
  const join = () => joinCode.trim() && enterRoom(joinRoom(joinCode, user, weapon));
  const startHunt = () => { game.current.unlockAudio(); startRound(room.code, room.offset, GAME_TIME, quarry).catch(err => setRoomErr(roomErrorText(err))); };
  const leave = () => {
    if (room && user) leaveRoom(room.code, user.uid).catch(console.error);
    game.current.quit();
    net.current = { round: 0 }; setRoom(null); setRoomData(null); setPlayers([]); setLiveRound(0); setRoomErr(''); setPhase('home');
  };

  /* ---------- solo ---------- */
  const pickWeapon = k => { setWeapon(k); store(KEYS.weapon, k); if (room && user) updatePlayer(room.code, user.uid, { weapon: k }); };
  const pickQuarry = k => { setQuarry(k); store(KEYS.quarry, k); setBoardQuarry(k); };
  const play = () => { setMsg({ id: 0, text: '' }); game.current.start(weapon, undefined, quarry); setPhase('play'); };
  const resume = () => { game.current.resume(); setPhase('play'); };
  const home = () => { game.current.quit(); setPhase('home'); };
  const inRoom = !!room;

  // What this hunt is after: our pick solo, the room's pick in a room round.
  const Q = QUARRY[inRoom && (phase === 'play' || phase === 'paused' || phase === 'over') ? roomData?.quarry || 'duck' : quarry];
  const quarryPicker = <QuarryPicker value={quarry} onPick={pickQuarry} portraits={portraits} />;
  const gunPicker = <GunPicker value={weapon} onPick={pickWeapon} pictures={gunPics} />;

  // Players of a round, best first. Our own live score comes from the HUD, the others' from Firestore.
  const standings = round => players
    .filter(p => p.round === round && (!roomData?.slots || roomData.slots.includes(p.id)))
    .map(p => (p.id === user?.uid && phase === 'play' ? { ...p, score: hud.score, ducks: hud.ducks } : p))
    .sort((a, b) => b.score - a.score);

  const lobbyMembers = roomData ? roomData.members.map(id => players.find(p => p.id === id) || { id, name: '…', weapon: 'semi' }) : [];
  const canStart = roomData && roomData.members.length >= 2 && roundOver(roomData, Date.now() + (room?.offset || 0));

  // End of a room round: final standings, the winner (none on a tie), and the bags laid out on the grass.
  const endRows = phase === 'over' && result && inRoom && result.round > 0 ? standings(result.round) : null;
  const top = endRows?.[0]?.score ?? 0, leaders = endRows ? endRows.filter(p => p.score === top) : [];
  const winnerId = endRows && endRows.length > 1 && leaders.length === 1 ? leaders[0].id : null;
  const verdict = !endRows ? '' : endRows.length < 2 ? 'Waiting for results…'
    : winnerId ? `${leaders[0].name.toUpperCase()} WINS` : `TIE · ${leaders.map(p => p.name).join(' & ')}`;
  const bagKey = endRows ? endRows.map(p => `${p.id}:${p.score}:${p.ducks}`).join('|') : '';
  useEffect(() => {
    if (phase !== 'over' || !result) return;
    if (!endRows) { game.current.showBag([{ by: 'me', slot: 0, count: 1 }]); return; }
    const slots = roomData?.slots?.length ? roomData.slots : endRows.map(p => p.id);
    game.current.showBag(endRows.map(p => ({
      by: p.id === user?.uid ? 'me' : p.id, name: p.name, slot: Math.max(0, slots.indexOf(p.id)), count: slots.length,
      winner: p.id === winnerId, sub: `${p.ducks} ${p.ducks === 1 ? Q.one : Q.many} · ${p.score} pts${p.id === winnerId ? ' · WINNER' : ''}`,
    })));
  }, [phase, result, bagKey, winnerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Phones hunt in landscape only: turning upright mid-hunt pauses it, and it can resume once turned back.
  useEffect(() => { if (portrait && phase === 'play') game.current.pause(); }, [portrait, phase]);
  const mustTurn = portrait && (phase === 'play' || phase === 'paused');

  return (
    <>
      <canvas ref={canvas} />
      {phase === 'play' && (
        <Hud hud={hud} Q={Q} best={bests[Q.kind]} msg={msg} standings={inRoom ? standings(liveRound) : null} me={user?.uid} game={game.current} />
      )}
      {phase === 'paused' && <PauseMenu inRoom={inRoom} hud={hud} onResume={resume} onRestart={play} onHome={home} onLeave={leave} />}
      {phase === 'home' && (
        <HomeMenu
          tab={tab} onTab={setTab}
          account={{ user, signIn, netErr, board: { ...board, quarry: boardQuarry, onQuarry: setBoardQuarry } }}
          loadout={{ quarryName: QUARRY[quarry].name, weaponName: WEAPONS[weapon].name, best: bests[quarry], onPlay: play }}
          rooms={{ busy, joinCode, setJoinCode, create, join, error: roomErr }}
          quarryPicker={quarryPicker} gunPicker={gunPicker}
        />
      )}
      {phase === 'lobby' && (
        <Lobby room={room} roomData={roomData} members={lobbyMembers} me={user?.uid} canStart={canStart} onStart={startHunt} onLeave={leave}
          error={roomErr} quarryPicker={quarryPicker} gunPicker={gunPicker} />
      )}
      {phase === 'over' && result && (
        <HuntOver result={result} verdict={verdict} Q={Q} best={bests[Q.kind]} netErr={netErr} inRoom={inRoom}
          onBackToRoom={() => { game.current.quit(); setPhase('lobby'); }} onLeave={leave} onPlayAgain={play} onHome={home} />
      )}
      {mustTurn && <RotatePrompt />}
      <FullscreenButton inPlay={phase === 'play'} />
    </>
  );
}

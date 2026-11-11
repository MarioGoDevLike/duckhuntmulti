import { useEffect, useRef, useState } from 'react';
import { createGame, birdPortraits, birdModelsReady, WEAPONS, QUARRY, GAME_TIME, TOUCH } from './engine.js';
import semiPic from './assets/a800x_pic2.png';
import ouPic from './assets/over_under.png';
import {
  enabled, watchUser, login, logout, submitScore, topScores, MAX_PLAYERS, roundOver,
  createRoom, joinRoom, leaveRoom, startRound, watchRoom, watchPlayers, watchKills, claimKill, updatePlayer,
} from './firebase.js';

// Storage keys keep the game's original name so existing high scores and choices carry over.
const KEY = 'marshDawnHighscore', GUN_KEY = 'marshDawnWeapon', QUARRY_KEY = 'marshDawnQuarry';
const fmt = s => `${s / 60 | 0}:${String(s % 60).padStart(2, '0')}`;
const store = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const read = k => { try { return localStorage.getItem(k); } catch { return null; } };
const errText = err => (err?.code === 'permission-denied' ? 'Access denied — check the Firestore rules.' : err?.message || 'Something went wrong.');

// Fullscreen through the standard API or Safari's prefixed one. iPhone Safari has neither, so the toggle hides there.
const FS_OK = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
function toggleFullscreen() {
  const d = document, el = d.documentElement;
  if (fsElement()) return (d.exitFullscreen || d.webkitExitFullscreen).call(d);
  // Once fullscreen, also try to hold landscape (only Android allows locking the orientation).
  Promise.resolve((el.requestFullscreen || el.webkitRequestFullscreen).call(el))
    .then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
}
const portraitQuery = matchMedia('(orientation: portrait)');

const Rating = ({ label, v }) => (
  <div className="rating"><span>{label}</span><i>{[1, 2, 3, 4, 5].map(n => <b key={n} className={n <= v ? 'on' : ''} />)}</i></div>
);
// Shotgun handling on the same 1–5 scale: shells carried, how quickly the second shot comes, time to full again.
const gunRatings = w => ({
  capacity: w.mag,
  followUp: Math.round(Math.min(5, Math.max(1, 5 - (w.interval - 0.1) * 15))),
  reload: Math.round(Math.min(5, Math.max(1, 5 - (w.single ? w.mag * w.reload : w.reload) * 1.2))),
});

export default function App() {
  const canvas = useRef(), game = useRef();
  const [phase, setPhase] = useState('home'); // home | lobby | play | paused | over
  const [weapon, setWeapon] = useState(() => (WEAPONS[read(GUN_KEY)] ? read(GUN_KEY) : 'semi'));
  const [quarry, setQuarry] = useState(() => (QUARRY[read(QUARRY_KEY)] ? read(QUARRY_KEY) : 'duck'));
  const [hud, setHud] = useState({ score: 0, ducks: 0, shells: 5, mag: 5, reloading: false, time: GAME_TIME });
  const [msg, setMsg] = useState({ id: 0, text: '' });
  const [result, setResult] = useState(null);
  const [best, setBest] = useState(() => +read(KEY) || 0);
  const say = text => setMsg(m => ({ id: m.id + 1, text }));

  // Room session. net mirrors what the engine callbacks (created once) need to read.
  const [room, setRoom] = useState(null);          // { code, offset } while in a room
  const [roomData, setRoomData] = useState(null);  // rooms/{code}
  const [players, setPlayers] = useState([]);      // rooms/{code}/players
  const [liveRound, setLiveRound] = useState(0);   // round this client is hunting in, 0 = none
  const [roomErr, setRoomErr] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [isFs, setIsFs] = useState(() => !!fsElement());
  const [portrait, setPortrait] = useState(() => TOUCH && portraitQuery.matches);
  useEffect(() => {
    const onFs = () => setIsFs(!!fsElement()), onTurn = () => setPortrait(TOUCH && portraitQuery.matches);
    document.addEventListener('fullscreenchange', onFs); document.addEventListener('webkitfullscreenchange', onFs);
    portraitQuery.addEventListener('change', onTurn);
    return () => {
      document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('webkitfullscreenchange', onFs);
      portraitQuery.removeEventListener('change', onTurn);
    };
  }, []);
  const [tab, setTab] = useState('hunt');
  // Rendered from the 3D models; again once the loaded bird models have arrived. (tab: hunt | friends | board | controls)
  const [portraits, setPortraits] = useState(() => birdPortraits());
  useEffect(() => { let live = true; birdModelsReady.then(() => live && setPortraits(birdPortraits())); return () => { live = false; }; }, []);
  const net = useRef({ round: 0 });

  useEffect(() => {
    game.current = createGame(canvas.current, {
      onHud: h => { setHud(h); net.current.hud = h; },
      onMsg: say,
      onPause: () => setPhase('paused'),
      onEnd: r => {
        const prev = +read(KEY) || 0, record = r.score > prev, n = net.current;
        if (record) store(KEY, r.score);
        if (n.playing) { n.playing = false; updatePlayer(n.code, n.uid, { score: r.score, ducks: r.ducks }); }
        setBest(Math.max(prev, r.score)); setResult({ ...r, record, round: n.code ? n.round : 0 }); setLiveRound(0); setPhase('over');
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

  const [user, setUser] = useState(null);
  const [board, setBoard] = useState(null);
  const [netErr, setNetErr] = useState('');

  useEffect(() => watchUser(setUser), []);
  // Signed in: save the last game if it beats the player's best, then load the top 10.
  useEffect(() => {
    if (!user) { setBoard(null); return; }
    let stale = false;
    (async () => {
      try {
        if (result) await submitScore(user, result.score, result.ducks);
        const rows = await topScores();
        if (!stale) { setBoard(rows); setNetErr(''); }
      } catch (err) {
        console.error(err);
        if (!stale) setNetErr(err.code === 'permission-denied'
          ? 'Leaderboard access denied — check the Firestore rules.'
          : `Could not reach the leaderboard (${err.code || err.message}).`);
      }
    })();
    return () => { stale = true; };
  }, [user, result]);
  // Say why sign-in failed: a generic message hid a missing Firebase authorized domain on the deployed site.
  const signIn = () => login().then(() => setNetErr(''), err => {
    console.error(err);
    const why = {
      'auth/unauthorized-domain': `Sign-in isn't enabled for ${location.hostname} yet: add it under Firebase › Authentication › Settings › Authorized domains.`,
      'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.',
      'auth/popup-closed-by-user': 'The sign-in window was closed before finishing.',
      'auth/cancelled-popup-request': '',
      'auth/network-request-failed': 'No connection to Google. Check your internet and try again.',
      'auth/operation-not-allowed': 'Google sign-in is turned off in Firebase › Authentication › Sign-in method.',
    }[err.code];
    setNetErr(why ?? `Sign-in did not complete (${err.code || err.message}).`);
  });

  /* ---------- rooms ---------- */
  useEffect(() => {
    if (!room) return;
    const offRoom = watchRoom(room.code, setRoomData, err => setRoomErr(errText(err)));
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
      err => { console.error(err); setRoomErr(errText(err)); }).finally(() => setBusy(false));
  };
  const create = () => enterRoom(createRoom(user, weapon));
  const join = () => joinCode.trim() && enterRoom(joinRoom(joinCode, user, weapon));
  const startHunt = () => { game.current.unlockAudio(); startRound(room.code, room.offset, GAME_TIME, quarry).catch(err => setRoomErr(errText(err))); };
  const leave = () => {
    if (room && user) leaveRoom(room.code, user.uid).catch(console.error);
    game.current.quit();
    net.current = { round: 0 }; setRoom(null); setRoomData(null); setPlayers([]); setLiveRound(0); setRoomErr(''); setPhase('home');
  };

  /* ---------- solo ---------- */
  const pick = k => { setWeapon(k); store(GUN_KEY, k); if (room && user) updatePlayer(room.code, user.uid, { weapon: k }); };
  const choose = k => { setQuarry(k); store(QUARRY_KEY, k); };
  const play = () => { setMsg({ id: 0, text: '' }); game.current.start(weapon, undefined, quarry); setPhase('play'); };
  const resume = () => { game.current.resume(); setPhase('play'); };
  const home = () => { game.current.quit(); setPhase('home'); };
  const W = WEAPONS[weapon];
  const inRoom = !!room;

  // Who is signed in (or a sign-in button), shown under the menu tabs.
  const accountLine = enabled && (
    <div className="acct">
      {user ? <>Signed in as <b>{user.displayName || user.email}</b> {!inRoom && <button className="link" onClick={logout}>Sign out</button>}</>
        : <button className="ghost" onClick={signIn}>Sign in with Google</button>}
      {netErr && <div className="err">{netErr}</div>}
    </div>
  );
  const signInFirst = what => <div className="empty">Sign in with Google below to {what}.</div>;
  const leaderboard = !user ? signInFirst('save your scores and see the leaderboard')
    : board ? (board.length ? (
      <ol className="board">
        {board.map((r, i) => (
          <li key={r.id} className={r.id === user.uid ? 'me' : ''}>
            <span>{i + 1}</span><span>{r.name}</span><span>{r.ducks} birds</span><b>{r.score}</b>
          </li>
        ))}
      </ol>
    ) : <div className="empty">No scores yet. Finish a hunt to post the first one.</div>) : !netErr && <div className="empty">Loading…</div>;

  // What this hunt is after: our pick solo, the room's pick in a room round.
  const Q = QUARRY[inRoom && (phase === 'play' || phase === 'paused' || phase === 'over') ? roomData?.quarry || 'duck' : quarry];
  const quarries = (
    <div className="cards three" role="radiogroup" aria-label="Quarry">
      {Object.entries(QUARRY).map(([k, q]) => (
        <button key={k} role="radio" aria-checked={k === quarry} className={k === quarry ? 'pick on' : 'pick'} onClick={() => choose(k)}>
          <span className="pic bird">{portraits[k] && <img src={portraits[k]} alt="" />}<em>×{q.pts}</em></span>
          <b>{q.name}</b><small>{q.line}</small>
          <Rating label="Speed" v={q.speed} /><Rating label="Challenge" v={q.skill} />
        </button>
      ))}
    </div>
  );

  const guns = (
    <div className="cards" role="radiogroup" aria-label="Shotgun">
      {Object.entries(WEAPONS).map(([k, w]) => {
        const r = gunRatings(w);
        return (
          <button key={k} role="radio" aria-checked={k === weapon} className={k === weapon ? 'pick on' : 'pick'} onClick={() => pick(k)}>
            <span className="pic gunshot"><img src={k === 'semi' ? semiPic : ouPic} alt="" /></span>
            <b>{w.name}</b><small>{w.type}</small>
            <Rating label="Capacity" v={r.capacity} /><Rating label="Follow-up" v={r.followUp} /><Rating label="Reload" v={r.reload} />
          </button>
        );
      })}
    </div>
  );

  // Players of a round, best first. Our own live score comes from the HUD, the others' from Firestore.
  const standings = round => players
    .filter(p => p.round === round && (!roomData?.slots || roomData.slots.includes(p.id)))
    .map(p => (p.id === user?.uid && phase === 'play' ? { ...p, score: hud.score, ducks: hud.ducks } : p))
    .sort((a, b) => b.score - a.score);

  const lobbyMembers = roomData ? roomData.members.map(id => players.find(p => p.id === id) || { id, name: '…', weapon: 'semi' }) : [];
  const canStart = roomData && roomData.members.length >= 2 && roundOver(roomData, Date.now() + (room?.offset || 0));
  const countdown = hud.time > GAME_TIME ? hud.time - GAME_TIME : 0;

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
        <div className="hud">
          <div className="top">
            <span>Score {hud.score} · {Q.many[0].toUpperCase() + Q.many.slice(1)} {hud.ducks}</span>
            <b className={hud.time <= 20 ? 'low' : ''}>{fmt(Math.min(hud.time, GAME_TIME))}</b>
            <span>Best {Math.max(best, hud.score)}</span>
          </div>
          {inRoom && <div className="live">{standings(liveRound).map(p => (
            <div key={p.id} className={p.id === user?.uid ? 'me' : ''}>{p.name} <b>{p.score}</b></div>
          ))}</div>}
          {countdown > 0 && <div className="count">{countdown}<small>{TOUCH ? 'Get ready' : 'Click the field to take aim'}</small></div>}
          {!hud.aiming && <div className="reticle" />}
          <div key={msg.id} className="msg">{msg.text}</div>
          {(hud.canGrab || hud.holding) && <div className="grab">{hud.holding ? (TOUCH ? 'Tap PUT DOWN to lay it back' : 'E — put it back') : (TOUCH ? 'Tap PICK UP to hold the bird' : 'E — pick up the bird')}</div>}
          <div className="ammo">
            {hud.reloading ? <em>RELOADING…</em> : hud.shells === 0 && <em>EMPTY — {TOUCH ? 'tap RELOAD' : 'press R'}</em>}
            {Array.from({ length: hud.mag }, (_, i) => <i key={i} className={i < hud.shells ? 'on' : ''} />)}
          </div>
          {TOUCH && (
            <div className="tc">
              <button className="pause" onPointerDown={() => game.current.pause()}>II</button>
              <button className="reload" onPointerDown={() => game.current.reload()}>RELOAD</button>
              <button className={hud.aiming ? 'aim active' : 'aim'} onPointerDown={() => game.current.toggleAim()}>AIM</button>
              <button className="fire" onPointerDown={() => game.current.fire()}>FIRE</button>
              {(hud.canGrab || hud.holding) && <button className="grabbtn" onPointerDown={() => game.current.hold()}>{hud.holding ? 'PUT DOWN' : 'PICK UP'}</button>}
            </div>
          )}
        </div>
      )}
      {phase === 'paused' && (
        <div className="overlay">
          <div className="card">
            <h1>PAUSED</h1>
            <div className="sub">{inRoom ? 'The hunt carries on for the others' : `${fmt(hud.time)} left · Score ${hud.score}`}</div>
            <div className="menu">
              <button onClick={resume}>RESUME</button>
              {inRoom ? <button className="ghost" onClick={leave}>Leave room</button> : <>
                <button className="ghost" onClick={play}>Restart hunt</button>
                <button className="ghost" onClick={home}>Main menu</button>
              </>}
            </div>
          </div>
        </div>
      )}
      {phase === 'home' && (
        <div className="menu-screen">
          <aside className="menu-panel">
            <header className="brand">
              <div className="kicker">Wetland &amp; upland bird hunting</div>
              <h1>Open Season</h1>
              <div className="tagline">{Object.values(QUARRY).map(q => q.name).join('  ·  ')}</div>
            </header>
            <nav className="tabs" role="tablist">
              {[['hunt', 'Hunt'], ...(enabled ? [['friends', 'Multiplayer'], ['board', 'Leaderboard']] : []), ['controls', 'Controls']].map(([k, label]) => (
                <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'tab on' : 'tab'} onClick={() => setTab(k)}>{label}</button>
              ))}
            </nav>
            <div className="tabpanel" role="tabpanel">
              {tab === 'hunt' && <>
                <div className="sect">Quarry</div>
                {quarries}
                <div className="sect">Shotgun</div>
                {guns}
              </>}
              {tab === 'friends' && (user ? <div className="rooms">
                <div className="sect">Hunt with friends · 2–{MAX_PLAYERS} players</div>
                <p className="hint">Create a room and share its code, or enter a friend's code. Your quarry and <b>{W.name}</b> come from the Hunt tab.</p>
                <button className="cta" disabled={busy} onClick={create}>Create room</button>
                <div className="or">or join one</div>
                <div className="row">
                  <input value={joinCode} maxLength={5} placeholder="CODE" aria-label="Room code" onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === 'Enter' && join()} />
                  <button className="ghost" disabled={busy || !joinCode.trim()} onClick={join}>Join</button>
                </div>
                {roomErr && <div className="err">{roomErr}</div>}
              </div> : signInFirst('create or join a room'))}
              {tab === 'board' && <>
                <div className="sect">Top hunters</div>
                {leaderboard}
              </>}
              {tab === 'controls' && <dl className="keys">
                {(TOUCH ? [['Drag', 'Look around'], ['AIM', 'Look down the rib'], ['FIRE / RELOAD', 'On-screen buttons'], ['PICK UP', 'Hold a retrieved bird']]
                  : [['Mouse', 'Look around'], ['Hold right click', 'Aim down the rib'], ['Left click', 'Fire'], ['R', 'Reload'], ['E', 'Pick up a retrieved bird'], ['Esc', 'Pause']])
                  .map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
                <p className="hint">The shot takes time to reach the birds: swing through and fire in front of fast ones. Doubles score ×2.{TOUCH && ' Played in landscape.'}</p>
              </dl>}
            </div>
            {tab === 'hunt' && (
              <div className="launch">
                <div className="loadout">
                  <small>Loadout</small>
                  <b>{QUARRY[quarry].name} · {W.name}</b>
                  <small>{fmt(GAME_TIME)} hunt · Best <span>{best}</span></small>
                </div>
                <button className="cta" onClick={play}>Start hunt</button>
              </div>
            )}
            <footer className="menu-foot">
              {accountLine}
              <div className="credits">
                3D models (CC BY 4.0, Sketchfab):{' '}
                <a href="https://sketchfab.com/3d-models/dead-chaffinch-dfeff4e123e54952b3acbd3de864fd7f" target="_blank" rel="noreferrer">“Dead Chaffinch”</a> by b-unicycling (cut out of its ground) ·{' '}
                <a href="https://sketchfab.com/3d-models/swainsons-thrush-in-flight-8784ede7ab0a46ad9967a772676e5c47" target="_blank" rel="noreferrer">“Swainson's Thrush - in Flight”</a> by osuecampus (wingbeat re-posed) ·{' '}
                <a href="https://sketchfab.com/3d-models/realistic-mallard-duck-game-ready-asset-dd33cd2e30944a4aae2de1a06a828f4f" target="_blank" rel="noreferrer">“Realistic Mallard Duck”</a> by 3Dima ·{' '}
                <a href="https://sketchfab.com/3d-models/labrador-dog-1f56cfbab07e4fe49b5d9e521c82073a" target="_blank" rel="noreferrer">“Labrador Dog”</a> by kenchoo (gallop added)
              </div>
            </footer>
          </aside>
        </div>
      )}
      {phase === 'lobby' && (
        <div className="overlay">
          <div className="card">
            <h1>ROOM {room.code}</h1>
            <div className="sub">Share the code · {lobbyMembers.length}/{MAX_PLAYERS} hunters</div>
            <ol className="board lobby">
              {lobbyMembers.map((p, i) => (
                <li key={p.id} className={p.id === user?.uid ? 'me' : ''}>
                  <span>{i + 1}</span><span>{p.name}</span><span>{WEAPONS[p.weapon]?.name}</span>
                </li>
              ))}
            </ol>
            <div className="who">
              {!roomData ? 'Connecting…'
                : !roundOver(roomData, Date.now() + room.offset) ? 'A round is under way — you join the next one.'
                : roomData.members.length < 2 ? 'Waiting for at least one more hunter…'
                : roomData.round === 0 ? `Starts by itself when ${MAX_PLAYERS} have joined, or start now.` : 'Ready for another round.'}
            </div>
            <div className="label" style={{ marginTop: 16 }}>Quarry for the next round</div>
            {quarries}
            <div className="label">Your shotgun</div>
            {guns}
            <div className="menu">
              <button disabled={!canStart} onClick={startHunt}>START HUNT</button>
              <button className="ghost" onClick={leave}>Leave room</button>
            </div>
            {roomErr && <div className="err">{roomErr}</div>}
          </div>
        </div>
      )}
      {phase === 'over' && result && <>
        {verdict && <div className="banner">{verdict}</div>}
        <div className="endbar">
          <div className="endstats">
            <b>HUNT OVER</b>{result.record && <span className="rec">NEW HIGH SCORE</span>}
            <span>Score <b>{result.score}</b> · {Q.many[0].toUpperCase() + Q.many.slice(1)} <b>{result.ducks}</b> · Accuracy {result.shots ? Math.round(result.ducks / result.shots * 100) : 0}% · Best <b>{best}</b></span>
            {netErr && <span className="err">{netErr}</span>}
          </div>
          <div className="endbtns">
            {inRoom ? <>
              <button onClick={() => { game.current.quit(); setPhase('lobby'); }}>BACK TO ROOM</button>
              <button className="ghost" onClick={leave}>Leave room</button>
            </> : <>
              <button onClick={play}>PLAY AGAIN</button>
              <button className="ghost" onClick={home}>Main menu</button>
            </>}
          </div>
        </div>
      </>}
      {mustTurn && (
        <div className="rotate" role="alert">
          <svg viewBox="0 0 64 64" aria-hidden="true"><rect x="22" y="8" width="20" height="36" rx="3" /><path d="M14 52a22 22 0 0 0 36 0M50 52l-1-7M50 52l-7 0" /></svg>
          <b>Turn your phone sideways</b>
          <small>The hunt is played in landscape. It's paused until you rotate.</small>
        </div>
      )}
      {TOUCH && FS_OK && (
        <button className={'fs' + (phase === 'play' ? ' inplay' : '')} onClick={toggleFullscreen} aria-label={isFs ? 'Exit full screen' : 'Full screen'} title={isFs ? 'Exit full screen' : 'Full screen'}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {isFs ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
          </svg>
        </button>
      )}
    </>
  );
}

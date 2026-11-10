import { useEffect, useRef, useState } from 'react';
import { createGame, WEAPONS, GAME_TIME, TOUCH } from './engine.js';
import { enabled, watchUser, login, logout, submitScore, topScores } from './firebase.js';

const KEY = 'marshDawnHighscore', GUN_KEY = 'marshDawnWeapon';
const fmt = s => `${s / 60 | 0}:${String(s % 60).padStart(2, '0')}`;
const store = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const read = k => { try { return localStorage.getItem(k); } catch { return null; } };

export default function App() {
  const canvas = useRef(), game = useRef();
  const [phase, setPhase] = useState('home'); // home | play | paused | over
  const [weapon, setWeapon] = useState(() => (WEAPONS[read(GUN_KEY)] ? read(GUN_KEY) : 'semi'));
  const [hud, setHud] = useState({ score: 0, ducks: 0, shells: 5, mag: 5, reloading: false, time: GAME_TIME });
  const [msg, setMsg] = useState({ id: 0, text: '' });
  const [result, setResult] = useState(null);
  const [best, setBest] = useState(() => +read(KEY) || 0);

  useEffect(() => {
    game.current = createGame(canvas.current, {
      onHud: setHud,
      onMsg: text => setMsg(m => ({ id: m.id + 1, text })),
      onPause: () => setPhase('paused'),
      onEnd: r => {
        const prev = +read(KEY) || 0, record = r.score > prev;
        if (record) store(KEY, r.score);
        setBest(Math.max(prev, r.score)); setResult({ ...r, record }); setPhase('over');
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
  const signIn = () => login().then(() => setNetErr(''), err => { console.error(err); setNetErr('Sign-in did not complete.'); });

  const pick = k => { setWeapon(k); store(GUN_KEY, k); };
  const play = () => { setMsg({ id: 0, text: '' }); game.current.start(weapon); setPhase('play'); };
  const resume = () => { game.current.resume(); setPhase('play'); };
  const home = () => { game.current.quit(); setPhase('home'); };
  const W = WEAPONS[weapon];

  const account = enabled && (
    <div className="account">
      {user ? <>
        <div className="who">Signed in as {user.displayName || user.email} <button className="ghost" onClick={logout}>Sign out</button></div>
        <h2>Leaderboard</h2>
        {board ? (board.length ? (
          <ol className="board">
            {board.map((r, i) => (
              <li key={r.id} className={r.id === user.uid ? 'me' : ''}>
                <span>{i + 1}</span><span>{r.name}</span><span>{r.ducks} ducks</span><b>{r.score}</b>
              </li>
            ))}
          </ol>
        ) : <div className="who">No scores yet — finish a hunt to post the first one.</div>) : !netErr && <div className="who">Loading…</div>}
      </> : <>
        <button className="ghost" onClick={signIn}>Sign in with Google</button>
        <div className="who">Sign in to save your score and see the leaderboard.</div>
      </>}
      {netErr && <div className="err">{netErr}</div>}
    </div>
  );

  return (
    <>
      <canvas ref={canvas} />
      {phase === 'play' && (
        <div className="hud">
          <div className="top">
            <span>Score {hud.score} · Ducks {hud.ducks}</span>
            <b className={hud.time <= 20 ? 'low' : ''}>{fmt(hud.time)}</b>
            <span>Best {Math.max(best, hud.score)}</span>
          </div>
          {!hud.aiming && <div className="reticle" />}
          <div key={msg.id} className="msg">{msg.text}</div>
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
            </div>
          )}
        </div>
      )}
      {phase === 'paused' && (
        <div className="overlay">
          <div className="card">
            <h1>PAUSED</h1>
            <div className="sub">{fmt(hud.time)} left · Score {hud.score}</div>
            <div className="menu">
              <button onClick={resume}>RESUME</button>
              <button className="ghost" onClick={play}>Restart hunt</button>
              <button className="ghost" onClick={home}>Main menu</button>
            </div>
          </div>
        </div>
      )}
      {phase === 'home' && (
        <div className="overlay">
          <div className="card">
            <h1>MARSH DAWN</h1>
            <div className="sub">Duck season · {fmt(GAME_TIME)} hunt</div>
            <div className="label">Choose your shotgun</div>
            <div className="guns">
              {Object.entries(WEAPONS).map(([k, w]) => (
                <button key={k} className={k === weapon ? 'gun on' : 'gun'} onClick={() => pick(k)}>
                  <b>{w.name}</b><small>{w.type}</small><span>{w.desc}</span>
                </button>
              ))}
            </div>
            <div className="stats">High score <b>{best}</b></div>
            <button onClick={play}>PLAY</button>
            <div className="keys">
              {TOUCH ? <>
                DRAG — look all around · AIM — look down the rib<br />
                FIRE and RELOAD buttons · best held sideways<br />
              </> : <>
                MOUSE — look all around · HOLD RIGHT CLICK — aim down the rib<br />
                LEFT CLICK — fire · R — reload · ESC — pause<br />
              </>}
              The shot takes time to get there: swing through and<br />fire in front of fast birds. Doubles pay x2.
            </div>
            {account}
          </div>
        </div>
      )}
      {phase === 'over' && result && (
        <div className="overlay">
          <div className="card">
            <h1>HUNT OVER</h1>
            <div className="sub">{W.name} · {W.type}</div>
            <div className="stats">
              {result.record && <><b>NEW HIGH SCORE!</b><br /></>}
              Score <b>{result.score}</b><br />
              Ducks <b>{result.ducks}</b> · Shots {result.shots} · Accuracy {result.shots ? Math.round(result.ducks / result.shots * 100) : 0}%<br />
              High score <b>{best}</b>
            </div>
            <div className="menu">
              <button onClick={play}>PLAY AGAIN</button>
              <button className="ghost" onClick={home}>Main menu</button>
            </div>
            {account}
          </div>
        </div>
      )}
    </>
  );
}

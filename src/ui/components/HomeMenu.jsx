// The main menu: a centered window over the live scene listing Hunt / Multiplayer / Leaderboard / Controls / Settings;
// each opens in the same window.
import { useState } from 'react';
import { GAME_TIME, QUARRY } from '../../config/gameplay.js';
import { TOUCH } from '../../config/platform.js';
import { enabled, logout, MAX_PLAYERS } from '../../net/firebase.js';
import { clock } from '../lib/format.js';

const CONTROLS = TOUCH
  ? [['Drag', 'Look around'], ['AIM', 'Look down the rib'], ['FIRE / RELOAD', 'On-screen buttons'], ['PICK UP', 'Hold a retrieved bird']]
  : [['Mouse', 'Look around'], ['Hold right click', 'Aim down the rib'], ['Left click', 'Fire'], ['R', 'Reload'], ['E', 'Pick up a retrieved bird'], ['Esc', 'Pause']];

const SignInFirst = ({ what }) => <div className="empty">Sign in with Google below to {what}.</div>;

// One board per quarry. board: { rows, quarry, onQuarry } — rows are the top 10 for board.quarry.
function Leaderboard({ user, board, error }) {
  if (!user) return <SignInFirst what="save your scores and see the leaderboards" />;
  const Q = QUARRY[board.quarry];
  const list = !board.rows ? !error && <div className="empty">Loading…</div>
    : !board.rows.length ? <div className="empty">No {Q.name} scores yet. Finish a {Q.name.toLowerCase()} hunt to post the first one.</div>
    : (
      <ol className="board">
        {board.rows.map((r, i) => (
          <li key={r.id} className={r.id === user.uid ? 'me' : ''}>
            <span>{i + 1}</span><span>{r.name}</span><span>{r.ducks} {r.ducks === 1 ? Q.one : Q.many}</span><b>{r.score}</b>
          </li>
        ))}
      </ol>
    );
  return <>
    <div className="boardtabs" role="radiogroup" aria-label="Leaderboard">
      {Object.entries(QUARRY).map(([k, q]) => (
        <button key={k} role="radio" aria-checked={k === board.quarry} className={k === board.quarry ? 'on' : ''} onClick={() => board.onQuarry(k)}>{q.name}</button>
      ))}
    </div>
    {list}
  </>;
}

function Rooms({ user, weaponName, rooms }) {
  if (!user) return <SignInFirst what="create or join a room" />;
  const { busy, joinCode, setJoinCode, create, join, error } = rooms;
  return (
    <div className="rooms">
      <div className="sect">Hunt with friends · 2–{MAX_PLAYERS} players</div>
      <p className="hint">Create a room and share its code, or enter a friend's code. Your quarry and <b>{weaponName}</b> come from the Hunt tab.</p>
      <button className="cta" disabled={busy} onClick={create}>Create room</button>
      <div className="or">or join one</div>
      <div className="row">
        <input value={joinCode} maxLength={5} placeholder="CODE" aria-label="Room code" onChange={e => setJoinCode(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && join()} />
        <button className="ghost" disabled={busy || !joinCode.trim()} onClick={join}>Join</button>
      </div>
      {error && <div className="err">{error}</div>}
    </div>
  );
}

const Credits = () => (
  <div className="credits">
    3D models (CC BY 4.0, Sketchfab):{' '}
    <a href="https://sketchfab.com/3d-models/dead-chaffinch-dfeff4e123e54952b3acbd3de864fd7f" target="_blank" rel="noreferrer">“Dead Chaffinch”</a> by b-unicycling (cut out of its ground) ·{' '}
    <a href="https://sketchfab.com/3d-models/pinson-des-arbres-acca221178bc432392c681155a56b5b6" target="_blank" rel="noreferrer">“Pinson des arbres”</a> by pattarrian (chaffinch card) ·{' '}
    <a href="https://sketchfab.com/3d-models/swainsons-thrush-in-flight-8784ede7ab0a46ad9967a772676e5c47" target="_blank" rel="noreferrer">“Swainson's Thrush - in Flight”</a> by osuecampus (wingbeat re-posed) ·{' '}
    <a href="https://sketchfab.com/3d-models/realistic-mallard-duck-game-ready-asset-dd33cd2e30944a4aae2de1a06a828f4f" target="_blank" rel="noreferrer">“Realistic Mallard Duck”</a> by 3Dima ·{' '}
    <a href="https://sketchfab.com/3d-models/labrador-dog-1f56cfbab07e4fe49b5d9e521c82073a" target="_blank" rel="noreferrer">“Labrador Dog”</a> by kenchoo (gallop added) ·{' '}
    <a href="https://sketchfab.com/3d-models/low-poly-shotgun-bff766c9561e4bccb27f2036b9d3090a" target="_blank" rel="noreferrer">“low poly shotgun”</a> by leoxx300 ·{' '}
    <a href="https://sketchfab.com/3d-models/low-poly-cz-drake-cdd637b874fa41809d528862d0ef279c" target="_blank" rel="noreferrer">“Low-Poly CZ Drake”</a> by TastyTony
  </div>
);

// Volume, look sensitivity and field of view. settings: see SETTINGS in config/gameplay.js.
function Settings({ settings, onSetting }) {
  const row = (id, label, value, shown, props) => (
    <div className="setting">
      <label htmlFor={id}><span>{label}</span><b>{shown}</b></label>
      <input id={id} type="range" value={value} {...props} onChange={e => onSetting(id, +e.target.value)} />
    </div>
  );
  return <>
    {row('volume', 'Sound volume', settings.volume, settings.volume ? `${Math.round(settings.volume * 100)}%` : 'Muted', { min: 0, max: 1, step: 0.05 })}
    {row('sensitivity', TOUCH ? 'Look sensitivity' : 'Mouse sensitivity', settings.sensitivity, `${settings.sensitivity.toFixed(2)}×`, { min: 0.3, max: 2.5, step: 0.05 })}
    {row('fov', 'Field of view', settings.fov, `${settings.fov}°`, { min: 45, max: 80, step: 1 })}
    <p className="hint">Saved in this browser. Changes apply straight away, even mid-hunt.</p>
  </>;
}

// The Hunt tab, one choice at a time: the bird, then where to hunt it, then the shotgun, then Start hunt.
const STEPS = [['Quarry', 'Choose your bird'], ['Hunting ground', 'Choose where to hunt'], ['Shotgun', 'Choose your gun']];
function HuntSteps({ pickers, loadout }) {
  const [step, setStep] = useState(0), last = step === STEPS.length - 1;
  const chosen = [loadout.quarryName, step > 0 && loadout.mapName, last && loadout.weaponName].filter(Boolean).join(' · ');
  return <>
    <ol className="steps">
      {STEPS.map(([name], i) => (
        <li key={name} className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}><span>{i + 1}</span>{name}</li>
      ))}
    </ol>
    <div className="tabpanel">
      <div className="sect">{STEPS[step][1]}</div>
      {pickers[step]}
    </div>
    <div className="launch">
      {step > 0 && <button className="ghost prev" onClick={() => setStep(step - 1)}>‹ Previous</button>}
      <div className="loadout">
        <small>{last ? 'Loadout' : `Step ${step + 1} of ${STEPS.length}`}</small>
        <b>{chosen}</b>
        {last && <small>{clock(GAME_TIME)} hunt · Best <span>{loadout.best}</span></small>}
      </div>
      {last ? <button className="cta" onClick={loadout.onPlay}>Start hunt</button>
        : <button className="cta" onClick={() => setStep(step + 1)}>Next ›</button>}
    </div>
  </>;
}

// account: { user, signIn, netErr, board: { rows, quarry, onQuarry } } · loadout: { quarryName, mapName, weaponName, best, onPlay }
// rooms: see Rooms · quarryPicker / mapPicker / gunPicker: the choice cards · settings, onSetting: see Settings.
// tab: null shows the list of sections; picking one opens it in the same window with a Back button.
export default function HomeMenu({ tab, onTab, account, loadout, rooms, quarryPicker, mapPicker, gunPicker, settings, onSetting }) {
  const { user, signIn, netErr, board } = account;
  const tabs = [
    ['hunt', 'Hunt', 'Choose your bird, ground and gun'],
    ...(enabled ? [['friends', 'Multiplayer', 'Hunt with friends in a room'], ['board', 'Leaderboard', 'Top hunters for each quarry']] : []),
    ['controls', 'Controls', 'Keys, buttons and tips'],
    ['settings', 'Settings', 'Sound, aim and view'],
  ];
  const open = tabs.find(([k]) => k === tab);
  return (
    <div className="menu-screen">
      <section className="menu-panel" aria-label="Main menu">
        {!open ? <>
          <header className="brand">
            <div className="kicker">Wetland &amp; upland bird hunting</div>
            <h1>Open Season</h1>
          </header>
          <nav className="menu-list">
            {tabs.map(([k, label, line]) => (
              <button key={k} className="menu-item" onClick={() => onTab(k)}>
                <span><b>{label}</b><small>{line}</small></span><i aria-hidden="true">›</i>
              </button>
            ))}
          </nav>
          <footer className="menu-foot">
            {enabled && (
              <div className="acct">
                {user ? <>Signed in as <b>{user.displayName || user.email}</b> <button className="link" onClick={logout}>Sign out</button></>
                  : <button className="ghost" onClick={signIn}>Sign in with Google</button>}
                {netErr && <div className="err">{netErr}</div>}
              </div>
            )}
            <Credits />
          </footer>
        </> : <>
          <header className="menu-head">
            <button className="back" onClick={() => onTab(null)} aria-label="Back to the menu">‹ Back</button>
            <h2>{open[1]}</h2>
          </header>
          {tab === 'hunt' && <HuntSteps pickers={[quarryPicker, mapPicker, gunPicker]} loadout={loadout} />}
          {tab !== 'hunt' && <div className="tabpanel">
            {tab === 'friends' && <Rooms user={user} weaponName={loadout.weaponName} rooms={rooms} />}
            {tab === 'board' && <>
              <div className="sect">Top hunters</div>
              <Leaderboard user={user} board={board} error={netErr} />
            </>}
            {tab === 'controls' && <dl className="keys">
              {CONTROLS.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
              <p className="hint">The shot takes time to reach the birds: swing through and fire in front of fast ones. Doubles score ×2.{TOUCH && ' Played in landscape.'}</p>
            </dl>}
            {tab === 'settings' && <Settings settings={settings} onSetting={onSetting} />}
          </div>}
        </>}
      </section>
    </div>
  );
}

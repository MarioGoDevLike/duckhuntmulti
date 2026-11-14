// The main menu: a full-height sidebar on the left of the live scene listing Hunt / Multiplayer / Controls / Settings,
// each opening in the same sidebar, with the leaderboard docked on the right (menu only, never in a hunt).
import { useEffect, useState } from 'react';
import { QUARRY, HUNT_KEYS } from '../../config/gameplay.js';
import { TOUCH } from '../../config/platform.js';
import { enabled, logout, MAX_PLAYERS } from '../../net/firebase.js';
import { clock } from '../lib/format.js';

const CONTROLS = TOUCH
  ? [['Drag', 'Look around'], ['AIM', 'Look down the rib'], ['FIRE / RELOAD', 'On-screen buttons'], ['PICK UP', 'Hold a retrieved bird']]
  : [['Mouse', 'Look around'], ['Hold right click', 'Aim down the rib'], ['Left click', 'Fire'], ['R', 'Reload'], ['E', 'Pick up a retrieved bird'], ['Esc', 'Pause']];

// A key's name as printed on it, from its KeyboardEvent code: KeyS → S, Digit5 → 5, Numpad5 → Num 5, Space → Space.
const keyName = code => code.replace(/^Key|^Digit/, '').replace(/^Numpad/, 'Num ').replace(/^Arrow/, '') || code;

const SignInFirst = ({ what }) => <div className="empty">Sign in with Google from the menu to {what}.</div>;

// One board per quarry. board: { rows, quarry, onQuarry } — rows are the top 10 for board.quarry.
function Leaderboard({ user, board, error }) {
  if (!user) return <SignInFirst what="save your scores and see the leaderboards" />;
  const Q = QUARRY[board.quarry];
  const list = !board.rows ? !error && <div className="empty">Loading…</div>
    : !board.rows.length ? <div className="empty">No {Q.name} scores yet. Finish a {Q.name.toLowerCase()} hunt to post the first one.</div>
    : (
      <ol className="board ranked">
        {board.rows.map((r, i) => (
          <li key={r.id} className={r.id === user.uid ? 'me' : ''}>
            <span>{i + 1}</span><span>{r.name}</span><span>{r.ducks} {r.ducks === 1 ? Q.one : Q.many}</span><b>{r.score}</b>
          </li>
        ))}
      </ol>
    );
  return <>
    <label className="boardpick">
      <span>Bird</span>
      <select value={board.quarry} onChange={e => board.onQuarry(e.target.value)}>
        {Object.entries(QUARRY).map(([k, q]) => <option key={k} value={k}>{q.name}</option>)}
      </select>
    </label>
    {list}
  </>;
}

function Rooms({ user, weaponName, rooms }) {
  if (!user) return <SignInFirst what="create or join a room" />;
  const { busy, joinCode, setJoinCode, create, join, error } = rooms;
  return (
    <div className="rooms">
      <div className="sect">Hunt with friends · 2–{MAX_PLAYERS} players</div>
      <p className="hint">Create a room and share its code, or enter a friend's code. The room's creator picks the bird and starts the hunt; the others pick their gun and choke in the room. You bring your <b>{weaponName}</b> from the Hunt tab.</p>
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
    <a href="https://sketchfab.com/3d-models/mourning-dove-in-flight-37f9b2cc8b174fc3a2d8ba9f5b467b1a" target="_blank" rel="noreferrer">“Mourning Dove - in Flight”</a> and{' '}
    <a href="https://sketchfab.com/3d-models/mourning-dove-8ef704c7846d4782b76efd2a955d5b4e" target="_blank" rel="noreferrer">“Mourning Dove”</a> by osuecampus ·{' '}
    <a href="https://sketchfab.com/3d-models/american-woodcock-aa5995bf8ee54ceebd2adf9148d3f9fd" target="_blank" rel="noreferrer">“American Woodcock”</a> by RISD Nature Lab (decimated) ·{' '}
    <a href="https://sketchfab.com/3d-models/realistic-mallard-duck-game-ready-asset-dd33cd2e30944a4aae2de1a06a828f4f" target="_blank" rel="noreferrer">“Realistic Mallard Duck”</a> by 3Dima ·{' '}
    <a href="https://sketchfab.com/3d-models/labrador-dog-1f56cfbab07e4fe49b5d9e521c82073a" target="_blank" rel="noreferrer">“Labrador Dog”</a> by kenchoo (gallop added) ·{' '}
    <a href="https://sketchfab.com/3d-models/low-poly-shotgun-bff766c9561e4bccb27f2036b9d3090a" target="_blank" rel="noreferrer">“low poly shotgun”</a> by leoxx300 ·{' '}
    <a href="https://sketchfab.com/3d-models/low-poly-cz-drake-cdd637b874fa41809d528862d0ef279c" target="_blank" rel="noreferrer">“Low-Poly CZ Drake”</a> by TastyTony
  </div>
);

// The shotcam: off or on, and (while on) the key that saves the last kill's clip. Picking the key waits for the next
// key press; Esc cancels, and keys the hunt already uses are refused. Keyboard only, so not shown on touch screens.
function ShotcamSetting({ settings, onSetting }) {
  const [listening, setListening] = useState(false), [err, setErr] = useState('');
  useEffect(() => {
    if (!listening) return;
    const onKey = e => {
      e.preventDefault(); e.stopPropagation(); // the press is for this, not for the menu behind it
      if (e.code === 'Escape') { setListening(false); return; }
      if (HUNT_KEYS.includes(e.code)) { setErr(`${keyName(e.code)} is already used in the hunt: pick another key`); return; }
      setErr(''); onSetting('shotcamKey', e.code); setListening(false);
    };
    addEventListener('keydown', onKey, true);
    return () => removeEventListener('keydown', onKey, true);
  }, [listening, onSetting]);
  const on = settings.shotcam;
  return <>
    <div className="setting">
      <label id="shotcam"><span>Shotcam</span><b>{on ? 'On' : 'Off'}</b></label>
      <div className="chokerow" role="radiogroup" aria-labelledby="shotcam">
        {[[false, 'Off', 'No barrel camera, no recording'], [true, 'On', 'A camera on the barrel films your hunt']].map(([v, name, line]) => (
          <button key={name} role="radio" aria-checked={on === v} className={on === v ? 'choke on' : 'choke'} onClick={() => onSetting('shotcam', v)} title={line}>{name}</button>
        ))}
      </div>
    </div>
    {on && <div className="setting">
      <label id="shotcamKey"><span>Save clip key</span><b>{listening ? 'Press a key…' : keyName(settings.shotcamKey)}</b></label>
      <div className="chokerow">
        <button className={listening ? 'choke on' : 'choke'} aria-labelledby="shotcamKey" onClick={() => { setErr(''); setListening(!listening); }}>
          {listening ? 'Press a key (Esc to cancel)' : 'Change key'}
        </button>
      </div>
      {err && <div className="err">{err}</div>}
      <p className="hint">After a kill, press <b>{keyName(settings.shotcamKey)}</b> to save the last 5 seconds from the barrel camera as a video. The first time, pick the folder to keep them in (your Videos folder is offered).</p>
    </div>}
  </>;
}

// Volume, look sensitivity, field of view, graphics quality and the shotcam. settings: see SETTINGS in config/gameplay.js.
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
    <div className="setting">
      <label id="graphics"><span>Graphics</span><b>{settings.graphics === 'low' ? 'Low' : 'High'}</b></label>
      <div className="chokerow" role="radiogroup" aria-labelledby="graphics">
        {[['high', 'High', 'Full resolution and thick grass'], ['low', 'Low', 'Smoother on slower PCs']].map(([k, name, line]) => (
          <button key={k} role="radio" aria-checked={settings.graphics === k} className={settings.graphics === k ? 'choke on' : 'choke'} onClick={() => onSetting('graphics', k)} title={line}>{name}</button>
        ))}
      </div>
    </div>
    {!TOUCH && <ShotcamSetting settings={settings} onSetting={onSetting} />}
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
        {last && <small>{clock(loadout.time)} {loadout.test ? 'test night, alone' : 'hunt'} · Best <span>{loadout.best}</span></small>}
        {last && !loadout.soloOk && <small>Night hunts are for 2–4 hunters: create a room under Multiplayer.</small>}
      </div>
      {last ? <button className="cta" disabled={!loadout.soloOk} onClick={loadout.onPlay}>{loadout.test ? 'Test the night' : 'Start hunt'}</button>
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
    ...(enabled ? [['friends', 'Multiplayer', 'Hunt with friends in a room']] : []),
    ['controls', 'Controls', 'Keys, buttons and tips'],
    ['settings', 'Settings', 'Sound, aim and view'],
  ];
  const open = tabs.find(([k]) => k === tab);
  return (
    <div className="menu-screen">
      <section className={`menu-panel${open ? ' open' : ''}`} aria-label="Main menu">
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
            {tab === 'controls' && <dl className="keys">
              {CONTROLS.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
              {!TOUCH && settings.shotcam && <div><dt>{keyName(settings.shotcamKey)}</dt><dd>Save the shotcam clip of your last kill</dd></div>}
              <p className="hint">The shot takes time to reach the birds: swing through and fire in front of fast ones. Doubles score ×2.{TOUCH && ' Played in landscape.'}</p>
            </dl>}
            {tab === 'settings' && <Settings settings={settings} onSetting={onSetting} />}
          </div>}
        </>}
      </section>
      {enabled && (
        <aside className="menu-board" aria-label="Leaderboard">
          <header className="board-head">
            <div className="kicker">Leaderboard</div>
            <h2>Top hunters</h2>
          </header>
          <Leaderboard user={user} board={board} error={netErr} />
        </aside>
      )}
    </div>
  );
}

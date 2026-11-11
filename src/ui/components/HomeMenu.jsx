// The main menu: a command panel over the live scene, with Hunt / Multiplayer / Leaderboard / Controls tabs.
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
    <a href="https://sketchfab.com/3d-models/swainsons-thrush-in-flight-8784ede7ab0a46ad9967a772676e5c47" target="_blank" rel="noreferrer">“Swainson's Thrush - in Flight”</a> by osuecampus (wingbeat re-posed) ·{' '}
    <a href="https://sketchfab.com/3d-models/realistic-mallard-duck-game-ready-asset-dd33cd2e30944a4aae2de1a06a828f4f" target="_blank" rel="noreferrer">“Realistic Mallard Duck”</a> by 3Dima ·{' '}
    <a href="https://sketchfab.com/3d-models/labrador-dog-1f56cfbab07e4fe49b5d9e521c82073a" target="_blank" rel="noreferrer">“Labrador Dog”</a> by kenchoo (gallop added) ·{' '}
    <a href="https://sketchfab.com/3d-models/low-poly-shotgun-bff766c9561e4bccb27f2036b9d3090a" target="_blank" rel="noreferrer">“low poly shotgun”</a> by leoxx300 ·{' '}
    <a href="https://sketchfab.com/3d-models/low-poly-cz-drake-cdd637b874fa41809d528862d0ef279c" target="_blank" rel="noreferrer">“Low-Poly CZ Drake”</a> by TastyTony
  </div>
);

// account: { user, signIn, netErr, board: { rows, quarry, onQuarry } } · loadout: { quarryName, weaponName, best, onPlay }
// rooms: see Rooms · quarryPicker / gunPicker: the choice cards.
export default function HomeMenu({ tab, onTab, account, loadout, rooms, quarryPicker, gunPicker }) {
  const { user, signIn, netErr, board } = account;
  const tabs = [['hunt', 'Hunt'], ...(enabled ? [['friends', 'Multiplayer'], ['board', 'Leaderboard']] : []), ['controls', 'Controls']];
  return (
    <div className="menu-screen">
      <aside className="menu-panel">
        <header className="brand">
          <div className="kicker">Wetland &amp; upland bird hunting</div>
          <h1>Open Season</h1>
          <div className="tagline">{Object.values(QUARRY).map(q => q.name).join('  ·  ')}</div>
        </header>
        <nav className="tabs" role="tablist">
          {tabs.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'tab on' : 'tab'} onClick={() => onTab(k)}>{label}</button>
          ))}
        </nav>
        <div className="tabpanel" role="tabpanel">
          {tab === 'hunt' && <>
            <div className="sect">Quarry</div>
            {quarryPicker}
            <div className="sect">Shotgun</div>
            {gunPicker}
          </>}
          {tab === 'friends' && <Rooms user={user} weaponName={loadout.weaponName} rooms={rooms} />}
          {tab === 'board' && <>
            <div className="sect">Top hunters</div>
            <Leaderboard user={user} board={board} error={netErr} />
          </>}
          {tab === 'controls' && <dl className="keys">
            {CONTROLS.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            <p className="hint">The shot takes time to reach the birds: swing through and fire in front of fast ones. Doubles score ×2.{TOUCH && ' Played in landscape.'}</p>
          </dl>}
        </div>
        {tab === 'hunt' && (
          <div className="launch">
            <div className="loadout">
              <small>Loadout</small>
              <b>{loadout.quarryName} · {loadout.weaponName}</b>
              <small>{clock(GAME_TIME)} hunt · Best <span>{loadout.best}</span></small>
            </div>
            <button className="cta" onClick={loadout.onPlay}>Start hunt</button>
          </div>
        )}
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
      </aside>
    </div>
  );
}

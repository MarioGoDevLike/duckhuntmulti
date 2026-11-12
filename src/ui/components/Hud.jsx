// In-hunt overlay: score and clock, room standings, countdown, reticle, messages, shells, and the touch controls;
// on a night hunt also the lamp (for whoever holds it), the party's bag and the birds in the air.
import { TOUCH } from '../../config/platform.js';
import { clock, capitalize } from '../lib/format.js';
import { callText } from '../lib/messages.js';

// The night strip: the lamp and its battery (lamper), the party's bag, birds still to find and birds in the air.
function NightPanel({ n }) {
  const L = n.lamp, lamper = n.role !== 'gun';
  return (
    <div className="night">
      {lamper && (
        <div className={L.on ? 'lamp on' : 'lamp'}>
          <b>{L.on ? 'LAMP ON' : 'LAMP OFF'}</b>
          <span>{L.spot ? 'Spot' : 'Flood'}{L.red ? ' · Red filter' : ''}</span>
          <i className="bat"><i style={{ width: `${Math.round(L.bat * 100)}%` }} className={L.bat < 0.15 ? 'low' : ''} /></i>
        </div>
      )}
      <div className="path">
        <span>Bag <b>{n.found}</b>{n.down > 0 && <> · <em>{n.down} down to find</em></>}</span>
        <span>{n.flying ? `${n.flying} in the air` : 'Watch the beams'}</span>
      </div>
      {!TOUCH && (
        <div className="keys">
          {lamper ? <>Click lamp · Right-click spot/flood · F red · watch the projector beams for a bird, then hold it in your light</> : <>Birds show in the projector beams and the lamp · every shot sends them higher</>}
          {n.role === 'both' && <> · L lamp · Q spot · click shoots</>}
          <br />Callouts: {[1, 2, 3, 4].map(k => <span key={k}><kbd>{k}</kbd> {callText(n.role, k)} </span>)}
        </div>
      )}
    </div>
  );
}

// hud: the engine's onHud state · standings: room players best first (null solo) · game: the engine handle.
export default function Hud({ hud, Q, best, msg, standings, me, game }) {
  const total = hud.total, n = hud.night, gun = !n || n.role !== 'lamp';
  const countdown = hud.time > total ? hud.time - total : 0;
  return (
    <div className={n ? 'hud nightmode' : 'hud'}>
      <div className="top">
        <span>{n ? `Party bag ${hud.ducks} · ${hud.score} pts` : `Score ${hud.score} · ${capitalize(Q.many)} ${hud.ducks}`}</span>
        <b className={hud.time <= 20 ? 'low' : ''}>{n && <small>Dawn </small>}{clock(Math.min(hud.time, total))}</b>
        <span>Best {Math.max(best, hud.score)}</span>
      </div>
      {standings && !n && <div className="live">{standings.map(p => (
        <div key={p.id} className={p.id === me ? 'me' : ''}>{p.name} <b>{p.score}</b></div>
      ))}</div>}
      {n && <NightPanel n={n} />}
      {countdown > 0 && <div className="count">{countdown}<small>{TOUCH ? 'Get ready' : n ? 'Click to take your place in the dark' : 'Click the field to take aim'}</small></div>}
      {!hud.aiming && <div className={gun ? 'reticle' : 'reticle lampdot'} />}
      <div key={msg.id} className="msg">{msg.text}</div>
      {(hud.canGrab || hud.holding) && <div className="grab">{hud.holding ? (TOUCH ? 'Tap PUT DOWN to lay it back' : 'E — put it back') : (TOUCH ? 'Tap PICK UP to hold the bird' : 'E — pick up the bird')}</div>}
      {gun && (
        <div className="ammo">
          {hud.reloading ? <em>RELOADING…</em> : hud.shells === 0 && <em>EMPTY — {TOUCH ? 'tap RELOAD' : 'press R'}</em>}
          {Array.from({ length: hud.mag }, (_, i) => <i key={i} className={i < hud.shells ? 'on' : ''} />)}
        </div>
      )}
      {TOUCH && (
        <div className="tc">
          <button className="pause" onPointerDown={() => game.pause()}>II</button>
          {gun ? <>
            <button className="reload" onPointerDown={() => game.reload()}>RELOAD</button>
            <button className={hud.aiming ? 'aim active' : 'aim'} onPointerDown={() => game.toggleAim()}>AIM</button>
            <button className="fire" onPointerDown={() => game.fire()}>FIRE</button>
          </> : <>
            <button className="reload" onPointerDown={() => game.lampMode('red')}>RED</button>
            <button className={n.lamp.spot ? 'aim active' : 'aim'} onPointerDown={() => game.lampMode('spot')}>SPOT</button>
            <button className="fire" onPointerDown={() => game.lamp()}>LAMP</button>
          </>}
          {n && <div className="calls">
            <button onPointerDown={() => game.call(1)}>{callText(n.role, 1)}</button>
            <button onPointerDown={() => game.call(3)}>{callText(n.role, 3)}</button>
          </div>}
          {(hud.canGrab || hud.holding) && <button className="grabbtn" onPointerDown={() => game.hold()}>{hud.holding ? 'PUT DOWN' : 'PICK UP'}</button>}
        </div>
      )}
    </div>
  );
}

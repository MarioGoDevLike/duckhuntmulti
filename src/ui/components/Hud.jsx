// In-hunt overlay: score and clock, room standings, countdown, reticle, messages, shells, and the touch controls.
import { GAME_TIME } from '../../config/gameplay.js';
import { TOUCH } from '../../config/platform.js';
import { clock, capitalize } from '../lib/format.js';

// hud: the engine's onHud state · standings: room players best first (null solo) · game: the engine handle.
export default function Hud({ hud, Q, best, msg, standings, me, game }) {
  const countdown = hud.time > GAME_TIME ? hud.time - GAME_TIME : 0;
  return (
    <div className="hud">
      <div className="top">
        <span>Score {hud.score} · {capitalize(Q.many)} {hud.ducks}</span>
        <b className={hud.time <= 20 ? 'low' : ''}>{clock(Math.min(hud.time, GAME_TIME))}</b>
        <span>Best {Math.max(best, hud.score)}</span>
      </div>
      {standings && <div className="live">{standings.map(p => (
        <div key={p.id} className={p.id === me ? 'me' : ''}>{p.name} <b>{p.score}</b></div>
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
          <button className="pause" onPointerDown={() => game.pause()}>II</button>
          <button className="reload" onPointerDown={() => game.reload()}>RELOAD</button>
          <button className={hud.aiming ? 'aim active' : 'aim'} onPointerDown={() => game.toggleAim()}>AIM</button>
          <button className="fire" onPointerDown={() => game.fire()}>FIRE</button>
          {(hud.canGrab || hud.holding) && <button className="grabbtn" onPointerDown={() => game.hold()}>{hud.holding ? 'PUT DOWN' : 'PICK UP'}</button>}
        </div>
      )}
    </div>
  );
}

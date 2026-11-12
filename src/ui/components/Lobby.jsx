// A room between rounds: who is in, what the next round hunts, and the start button.
import { WEAPONS } from '../../config/gameplay.js';
import { MAX_PLAYERS, roundOver } from '../../net/firebase.js';

// members: [{ id, name, weapon, role }] in join order · roomData: rooms/{code} (null while connecting).
// night: the next round is a night hunt — each hunter picks the lamp or a gun (onRole), and it needs exactly one lamp.
export default function Lobby({ room, roomData, members, me, canStart, onStart, onLeave, error, quarryPicker, gunPicker, night, onRole }) {
  const lamps = members.filter(p => p.role === 'lamp').length, mine = members.find(p => p.id === me)?.role || 'gun';
  const status = !roomData ? 'Connecting…'
    : !roundOver(roomData, Date.now() + room.offset) ? 'A round is under way — you join the next one.'
    : roomData.members.length < 2 ? 'Waiting for at least one more hunter…'
    : night && lamps === 0 ? 'Someone has to take the lamp.'
    : night && lamps > 1 ? 'Only one hunter can hold the lamp.'
    : night && lamps === members.length ? 'Someone has to carry a gun.'
    : night ? 'Ready: start the night when everyone is.'
    : roomData.round === 0 ? `Starts by itself when ${MAX_PLAYERS} have joined, or start now.` : 'Ready for another round.';
  return (
    <div className="overlay">
      <div className="card">
        <h1>ROOM {room.code}</h1>
        <div className="sub">Share the code · {members.length}/{MAX_PLAYERS} hunters</div>
        <ol className="board lobby">
          {members.map((p, i) => (
            <li key={p.id} className={p.id === me ? 'me' : ''}>
              <span>{i + 1}</span><span>{p.name}</span><span>{night && p.role === 'lamp' ? 'The lamp' : WEAPONS[p.weapon]?.name}</span>
            </li>
          ))}
        </ol>
        <div className="who">{status}</div>
        <div className="label" style={{ marginTop: 16 }}>Quarry for the next round</div>
        {quarryPicker}
        {night && <>
          <div className="label">Your part tonight</div>
          <div className="cards" role="radiogroup" aria-label="Role">
            {[['lamp', 'The lamp', 'Watch the projector beams; when a bird crosses one, catch it in your light and keep it there.'],
              ['gun', 'A gun', 'Shoot what the light shows you. Every shot sends the bird higher, until it leaves.']].map(([k, name, line]) => (
              <button key={k} role="radio" aria-checked={mine === k} className={mine === k ? 'pick on' : 'pick'} onClick={() => onRole(k)}>
                <b>{name}</b><small>{line}</small>
              </button>
            ))}
          </div>
        </>}
        {!(night && mine === 'lamp') && <><div className="label">Your shotgun</div>{gunPicker}</>}
        <div className="menu">
          <button disabled={!canStart} onClick={onStart}>START HUNT</button>
          <button className="ghost" onClick={onLeave}>Leave room</button>
        </div>
        {error && <div className="err">{error}</div>}
      </div>
    </div>
  );
}

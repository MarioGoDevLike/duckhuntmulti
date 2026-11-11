// A room between rounds: who is in, what the next round hunts, and the start button.
import { WEAPONS } from '../../config/gameplay.js';
import { MAX_PLAYERS, roundOver } from '../../net/firebase.js';

// members: [{ id, name, weapon }] in join order · roomData: rooms/{code} (null while connecting).
export default function Lobby({ room, roomData, members, me, canStart, onStart, onLeave, error, quarryPicker, gunPicker }) {
  const status = !roomData ? 'Connecting…'
    : !roundOver(roomData, Date.now() + room.offset) ? 'A round is under way — you join the next one.'
    : roomData.members.length < 2 ? 'Waiting for at least one more hunter…'
    : roomData.round === 0 ? `Starts by itself when ${MAX_PLAYERS} have joined, or start now.` : 'Ready for another round.';
  return (
    <div className="overlay">
      <div className="card">
        <h1>ROOM {room.code}</h1>
        <div className="sub">Share the code · {members.length}/{MAX_PLAYERS} hunters</div>
        <ol className="board lobby">
          {members.map((p, i) => (
            <li key={p.id} className={p.id === me ? 'me' : ''}>
              <span>{i + 1}</span><span>{p.name}</span><span>{WEAPONS[p.weapon]?.name}</span>
            </li>
          ))}
        </ol>
        <div className="who">{status}</div>
        <div className="label" style={{ marginTop: 16 }}>Quarry for the next round</div>
        {quarryPicker}
        <div className="label">Your shotgun</div>
        {gunPicker}
        <div className="menu">
          <button disabled={!canStart} onClick={onStart}>START HUNT</button>
          <button className="ghost" onClick={onLeave}>Leave room</button>
        </div>
        {error && <div className="err">{error}</div>}
      </div>
    </div>
  );
}

// A room between rounds, laid out like the main menu: the left sidebar holds the next hunt and the start button, the
// floating card on the right lists the hunters. The host (the room's first member) picks the quarry and starts the hunt;
// everyone else picks their gun and choke.
import { useState } from 'react';
import { WEAPONS } from '../../config/gameplay.js';
import { MAX_PLAYERS, roundOver } from '../../net/firebase.js';

const ROLES = [
  ['lamp', 'The lamp', 'Watch the projector beams; when a bird crosses one, catch it in your light and keep it there.'],
  ['gun', 'A gun', 'Shoot what the light shows you. Every shot sends the bird higher, until it leaves.'],
];

// members: [{ id, name, weapon, role }] in join order, the host first.
function Roster({ members, me, night }) {
  return (
    <ol className="board roster">
      {members.map((p, i) => (
        <li key={p.id} className={p.id === me ? 'me' : ''}>
          <span>{i + 1}</span>
          <span>{p.name}{i === 0 && <em className="hosttag">Host</em>}</span>
          <span>{night && p.role === 'lamp' ? 'The lamp' : WEAPONS[p.weapon]?.name}</span>
        </li>
      ))}
      {Array.from({ length: MAX_PLAYERS - members.length }, (_, i) => (
        <li key={`open${i}`} className="open"><span>{members.length + i + 1}</span><span>Open spot</span></li>
      ))}
    </ol>
  );
}

// roomData: rooms/{code} (null while connecting) · isHost: we pick the quarry and start the hunt.
// quarryPicker (host) / gunPicker (the others): the choice cards · hunt: { quarry, map, portrait } the next round.
// night: the next round is a night hunt — each hunter picks the lamp or a gun (onRole), and it needs exactly one lamp.
export default function Lobby({ room, roomData, members, me, isHost, canStart, onStart, onLeave, error, quarryPicker, gunPicker, night, onRole, hunt }) {
  const [copied, setCopied] = useState(false);
  const lamps = members.filter(p => p.role === 'lamp').length, mine = members.find(p => p.id === me)?.role || 'gun';
  const hostName = members[0]?.name || 'the host';
  const status = !roomData ? 'Connecting…'
    : !roundOver(roomData, Date.now() + room.offset) ? 'A round is under way — you join the next one.'
    : roomData.members.length < 2 ? 'Waiting for at least one more hunter…'
    : night && lamps === 0 ? 'Someone has to take the lamp.'
    : night && lamps > 1 ? 'Only one hunter can hold the lamp.'
    : night && lamps === members.length ? 'Someone has to carry a gun.'
    : !isHost ? `Waiting for ${hostName} to start the hunt.`
    : night ? 'Ready: start the night when everyone is.'
    : roomData.round === 0 ? `Starts by itself when ${MAX_PLAYERS} have joined, or start now.` : 'Ready for another round.';
  const copy = () => navigator.clipboard?.writeText(room.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {});

  return (
    <div className="menu-screen">
      <section className="menu-panel open" aria-label={`Room ${room.code}`}>
        <header className="menu-head">
          <button className="back" onClick={onLeave}>‹ Leave</button>
          <h2>Room</h2>
          <button className="roomcode" onClick={copy} title="Copy the room code" aria-label={`Room code ${room.code}, copy it`}>
            <b>{room.code}</b><small>{copied ? 'Copied' : 'Copy'}</small>
          </button>
        </header>
        <div className="roomstatus" role="status">{status}</div>

        <div className="roster-inline"><div className="sect">Hunters · {members.length}/{MAX_PLAYERS}</div><Roster members={members} me={me} night={night} /></div>

        {isHost ? <>
          <div className="sect">Choose the quarry</div>
          {quarryPicker}
        </> : <>
          <div className="sect">The quarry</div>
          <div className="nexthunt">
            <span className="pic bird">{hunt.portrait && <img src={hunt.portrait} alt="" />}<em>×{hunt.quarry.pts}</em></span>
            <div>
              <b>{hunt.quarry.name}</b>
              <small>{hunt.quarry.line}</small>
              <small className="where">{hunt.map.name} · picked by {hostName}</small>
            </div>
          </div>
        </>}

        {night && <>
          <div className="sect">Your part tonight</div>
          <div className="cards" role="radiogroup" aria-label="Role">
            {ROLES.map(([k, name, line]) => (
              <button key={k} role="radio" aria-checked={mine === k} className={mine === k ? 'pick role on' : 'pick role'} onClick={() => onRole(k)}>
                <b>{name}</b><small>{line}</small>
              </button>
            ))}
          </div>
        </>}

        {!isHost && !(night && mine === 'lamp') && <>
          <div className="sect">Your shotgun &amp; choke</div>
          {gunPicker}
        </>}

        {error && <div className="err">{error}</div>}

        <div className="launch">
          <div className="loadout">
            <small>Next round</small>
            <b>{hunt.quarry.name} · {hunt.map.name}</b>
            <small>{members.length}/{MAX_PLAYERS} hunters</small>
          </div>
          {isHost ? <button className="cta" disabled={!canStart} onClick={onStart}>{night ? 'Start the night' : 'Start hunt'}</button>
            : <span className="waiting">{hostName} starts the hunt</span>}
        </div>
      </section>

      <aside className="menu-board" aria-label="Hunters">
        <header className="board-head">
          <div className="kicker">Room {room.code}</div>
          <h2>Hunters</h2>
        </header>
        <Roster members={members} me={me} night={night} />
        <p className="hint roomhint">Share the code <b>{room.code}</b> with friends. Up to {MAX_PLAYERS} can hunt together.</p>
      </aside>
    </div>
  );
}

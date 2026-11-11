import { clock } from '../lib/format.js';

export default function PauseMenu({ inRoom, hud, onResume, onRestart, onHome, onLeave }) {
  return (
    <div className="overlay">
      <div className="card">
        <h1>PAUSED</h1>
        <div className="sub">{inRoom ? 'The hunt carries on for the others' : `${clock(hud.time)} left · Score ${hud.score}`}</div>
        <div className="menu">
          <button onClick={onResume}>RESUME</button>
          {inRoom ? <button className="ghost" onClick={onLeave}>Leave room</button> : <>
            <button className="ghost" onClick={onRestart}>Restart hunt</button>
            <button className="ghost" onClick={onHome}>Main menu</button>
          </>}
        </div>
      </div>
    </div>
  );
}

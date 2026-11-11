// End of a hunt, shown over the bag: the verdict banner (rooms) and the results bar.
import { capitalize } from '../lib/format.js';

export default function HuntOver({ result, verdict, Q, best, netErr, inRoom, onBackToRoom, onLeave, onPlayAgain, onHome }) {
  const accuracy = result.shots ? Math.round(result.ducks / result.shots * 100) : 0;
  return <>
    {verdict && <div className="banner">{verdict}</div>}
    <div className="endbar">
      <div className="endstats">
        <b>HUNT OVER</b>{result.record && <span className="rec">NEW HIGH SCORE</span>}
        <span>Score <b>{result.score}</b> · {capitalize(Q.many)} <b>{result.ducks}</b> · Accuracy {accuracy}% · Best <b>{best}</b></span>
        {netErr && <span className="err">{netErr}</span>}
      </div>
      <div className="endbtns">
        {inRoom ? <>
          <button onClick={onBackToRoom}>BACK TO ROOM</button>
          <button className="ghost" onClick={onLeave}>Leave room</button>
        </> : <>
          <button onClick={onPlayAgain}>PLAY AGAIN</button>
          <button className="ghost" onClick={onHome}>Main menu</button>
        </>}
      </div>
    </div>
  </>;
}

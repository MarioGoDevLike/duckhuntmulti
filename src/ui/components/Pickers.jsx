// Quarry and shotgun choice cards, shared by the Hunt tab and the room lobby.
import { QUARRY, WEAPONS } from '../../config/gameplay.js';
import { MAPS, mapsFor } from '../../config/maps.js';

const Rating = ({ label, v }) => (
  <div className="rating"><span>{label}</span><i>{[1, 2, 3, 4, 5].map(n => <b key={n} className={n <= v ? 'on' : ''} />)}</i></div>
);

// Shotgun handling on the same 1–5 scale: shells carried, how quickly the second shot comes, time to full again.
const gunRatings = w => ({
  capacity: w.mag,
  followUp: Math.round(Math.min(5, Math.max(1, 5 - (w.interval - 0.1) * 15))),
  reload: Math.round(Math.min(5, Math.max(1, 5 - (w.single ? w.mag * w.reload : w.reload) * 1.2))),
});

// portraits: { [kind]: image URL } rendered from the 3D models.
export function QuarryPicker({ value, onPick, portraits }) {
  return (
    <div className="cards four" role="radiogroup" aria-label="Quarry">
      {Object.entries(QUARRY).map(([k, q]) => (
        <button key={k} role="radio" aria-checked={k === value} className={k === value ? 'pick on' : 'pick'} onClick={() => onPick(k)}>
          <span className="pic bird">{portraits[k] && <img src={portraits[k]} alt="" />}<em>×{q.pts}</em></span>
          <b>{q.name}</b><small>{q.line}</small>
          <Rating label="Speed" v={q.speed} /><Rating label="Challenge" v={q.skill} />
        </button>
      ))}
    </div>
  );
}

// Where to hunt. pictures: { [map]: image URL } (optional) · always: show it even when the quarry has only one map.
export function MapPicker({ quarry, value, onPick, pictures = {}, always = false }) {
  const ids = mapsFor(quarry);
  if (ids.length < 2 && !always) return null;
  return (
    <div className="cards maps" role="radiogroup" aria-label="Hunting ground">
      {ids.map(k => (
        <button key={k} role="radio" aria-checked={k === value} className={k === value ? 'pick on' : 'pick'} onClick={() => onPick(k)}>
          {pictures[k] && <span className="pic map"><img src={pictures[k]} alt={`View of ${MAPS[k].name}`} /></span>}
          <b>{MAPS[k].name}</b><small>{MAPS[k].line}</small>
        </button>
      ))}
    </div>
  );
}

// pictures: { [weapon]: image URL } rendered from the guns in the hunter's hands.
export function GunPicker({ value, onPick, pictures }) {
  return (
    <div className="cards" role="radiogroup" aria-label="Shotgun">
      {Object.entries(WEAPONS).map(([k, w]) => {
        const r = gunRatings(w);
        return (
          <button key={k} role="radio" aria-checked={k === value} className={k === value ? 'pick on' : 'pick'} onClick={() => onPick(k)}>
            <span className="pic gunshot">{pictures[k] && <img src={pictures[k]} alt="" />}</span>
            <b>{w.name}</b><small>{w.type}</small>
            <Rating label="Capacity" v={r.capacity} /><Rating label="Follow-up" v={r.followUp} /><Rating label="Reload" v={r.reload} />
          </button>
        );
      })}
    </div>
  );
}

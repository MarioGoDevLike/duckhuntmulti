// Per-browser preferences. The keys keep the game's original name so existing high scores and choices carry over.
export const KEYS = { best: 'marshDawnHighscore', weapon: 'marshDawnWeapon', quarry: 'marshDawnQuarry' };
// Each quarry keeps its own best. Ducks keep the original key: the game hunted only ducks when it was written.
export const bestKey = quarry => (quarry === 'duck' ? KEYS.best : `${KEYS.best}:${quarry}`);

export const store = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
export const read = k => { try { return localStorage.getItem(k); } catch { return null; } };

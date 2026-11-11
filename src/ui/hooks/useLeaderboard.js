import { useEffect, useState } from 'react';
import { submitScore, topScores } from '../../net/firebase.js';
import { leaderboardErrorText } from '../lib/messages.js';

// Signed in: save each finished hunt to its quarry's board (kept only if it beats the player's best there), and load
// the top 10 of the board being viewed — again after a save, so a new entry shows at once.
// rows: null until loaded (or signed out) · error: why it could not be saved or loaded.
export function useLeaderboard(user, result, quarry) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [saves, setSaves] = useState(0);

  useEffect(() => {
    if (!user || !result) return;
    let stale = false;
    submitScore(user, result.quarry, result.score, result.ducks).then(
      () => { if (!stale) setSaves(n => n + 1); },
      err => { console.error(err); if (!stale) setError(leaderboardErrorText(err)); });
    return () => { stale = true; };
  }, [user, result]);

  useEffect(() => {
    if (!user) { setRows(null); return; }
    let stale = false;
    setRows(null);
    topScores(quarry).then(
      top => { if (!stale) { setRows(top); setError(''); } },
      err => { console.error(err); if (!stale) setError(leaderboardErrorText(err)); });
    return () => { stale = true; };
  }, [user, quarry, saves]);

  return { rows, error };
}

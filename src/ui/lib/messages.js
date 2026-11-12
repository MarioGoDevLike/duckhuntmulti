// Firebase errors in words a player can act on.

export const roomErrorText = err => (err?.code === 'permission-denied' ? 'Access denied — check the Firestore rules.' : err?.message || 'Something went wrong.');

export const leaderboardErrorText = err => (err.code === 'permission-denied'
  ? 'Leaderboard access denied — check the Firestore rules.'
  : `Could not reach the leaderboard (${err.code || err.message}).`);

// Say why sign-in failed: a generic message hid a missing Firebase authorized domain on the deployed site.
const SIGN_IN = {
  'auth/unauthorized-domain': () => `Sign-in isn't enabled for ${location.hostname} yet: add it under Firebase › Authentication › Settings › Authorized domains.`,
  'auth/popup-blocked': () => 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.',
  'auth/popup-closed-by-user': () => 'The sign-in window was closed before finishing.',
  'auth/cancelled-popup-request': () => '',
  'auth/network-request-failed': () => 'No connection to Google. Check your internet and try again.',
  'auth/operation-not-allowed': () => 'Google sign-in is turned off in Firebase › Authentication › Sign-in method.',
};
export const signInErrorText = err => SIGN_IN[err.code]?.() ?? `Sign-in did not complete (${err.code || err.message}).`;

// Night hunt callouts, keys 1–4 (or the CALL buttons): what the lamp and the guns say to each other in the dark.
export const CALLS = {
  lamp: ['Bird in the beam!', 'Coming round the tree', 'Take it now!', "It's gone"],
  gun: ['I see it', 'Hold the light on it', 'Shooting!', "Can't see it — find it again"],
};
export const callText = (role, n) => (CALLS[role === 'gun' ? 'gun' : 'lamp'] || CALLS.lamp)[n - 1] || '';

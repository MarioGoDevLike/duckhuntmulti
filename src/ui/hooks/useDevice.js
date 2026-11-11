import { useEffect, useState } from 'react';
import { TOUCH } from '../../config/platform.js';

// Fullscreen through the standard API or Safari's prefixed one. iPhone Safari has neither, so the toggle hides there.
export const FS_OK = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
function toggleFullscreen() {
  const d = document, el = d.documentElement;
  if (fsElement()) return (d.exitFullscreen || d.webkitExitFullscreen).call(d);
  // Once fullscreen, also try to hold landscape (only Android allows locking the orientation).
  Promise.resolve((el.requestFullscreen || el.webkitRequestFullscreen).call(el))
    .then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
}

// [isFullscreen, toggle]
export function useFullscreen() {
  const [isFs, setIsFs] = useState(() => !!fsElement());
  useEffect(() => {
    const onFs = () => setIsFs(!!fsElement());
    document.addEventListener('fullscreenchange', onFs); document.addEventListener('webkitfullscreenchange', onFs);
    return () => { document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('webkitfullscreenchange', onFs); };
  }, []);
  return [isFs, toggleFullscreen];
}

// A phone or tablet held upright (the hunt is landscape only).
const portraitQuery = matchMedia('(orientation: portrait)');
export function usePortrait() {
  const [portrait, setPortrait] = useState(() => TOUCH && portraitQuery.matches);
  useEffect(() => {
    const onTurn = () => setPortrait(TOUCH && portraitQuery.matches);
    portraitQuery.addEventListener('change', onTurn);
    return () => portraitQuery.removeEventListener('change', onTurn);
  }, []);
  return portrait;
}

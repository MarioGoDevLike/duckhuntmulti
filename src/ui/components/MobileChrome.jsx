// Phone and tablet extras: the rotate prompt and the fullscreen toggle.
import { TOUCH } from '../../config/platform.js';
import { FS_OK, useFullscreen } from '../hooks/useDevice.js';

export function RotatePrompt() {
  return (
    <div className="rotate" role="alert">
      <svg viewBox="0 0 64 64" aria-hidden="true"><rect x="22" y="8" width="20" height="36" rx="3" /><path d="M14 52a22 22 0 0 0 36 0M50 52l-1-7M50 52l-7 0" /></svg>
      <b>Turn your phone sideways</b>
      <small>The hunt is played in landscape. It's paused until you rotate.</small>
    </div>
  );
}

export function FullscreenButton({ inPlay }) {
  const [isFs, toggle] = useFullscreen();
  if (!TOUCH || !FS_OK) return null;
  const label = isFs ? 'Exit full screen' : 'Full screen';
  return (
    <button className={'fs' + (inPlay ? ' inplay' : '')} onClick={toggle} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {isFs ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
      </svg>
    </button>
  );
}

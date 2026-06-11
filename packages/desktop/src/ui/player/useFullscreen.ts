import { useCallback, useEffect, useState, type RefObject } from 'react';

/**
 * Drive the browser Fullscreen API for a single element.
 *
 * `isFullscreen` is derived from the `fullscreenchange` event (not from the
 * `toggle` call), so pressing Esc — the browser's native exit — flips it back
 * to false and any button bound to it updates correctly.
 */
export function useFullscreen(targetRef: RefObject<HTMLElement>): {
  isFullscreen: boolean;
  toggle: () => void;
} {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === targetRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [targetRef]);

  const toggle = useCallback(() => {
    const el = targetRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen();
    }
  }, [targetRef]);

  return { isFullscreen, toggle };
}

import { useEffect, useRef, useState } from 'react';
import { useTVEventHandler } from 'react-native';

/**
 * Show on-screen controls, then hide them after `timeoutMs` of remote
 * inactivity. Any remote event reveals them and restarts the idle timer.
 */
export function useAutoHideControls(timeoutMs = 3000): { visible: boolean } {
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const arm = () => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), timeoutMs);
  };

  // Any remote event reveals the chrome and restarts the idle timer.
  useTVEventHandler(() => {
    setVisible(true);
    arm();
  });

  useEffect(() => {
    arm();
    return () => {
      if (timer.current !== undefined) clearTimeout(timer.current);
    };
    // arm() closes over timeoutMs, which is stable for the lifetime of a screen.
  }, []);

  return { visible };
}

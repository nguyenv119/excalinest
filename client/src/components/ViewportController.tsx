import { useEffect } from 'react';
import type { MutableRefObject } from 'react';         // ← from 'react', NOT '@xyflow/react'
import { useReactFlow } from '@xyflow/react';
import type { Viewport, XYPosition } from '@xyflow/react';

interface ViewportControllerProps {
  /** Ref through which App.tsx reads screenToFlowPosition for paste placement. */
  screenToFlowPositionRef: MutableRefObject<((pos: XYPosition) => XYPosition) | null>;
}

export const VIEWPORT_KEY = 'kc-viewport';

export function ViewportController({ screenToFlowPositionRef }: ViewportControllerProps) {
  const { setViewport, screenToFlowPosition } = useReactFlow();

  // Expose screenToFlowPosition for paste placement (Cmd+V).
  // Called at paste time (not during render), so keeping the ref current via
  // useEffect is sufficient — no stale-closure issues.
  useEffect(() => {
    screenToFlowPositionRef.current = screenToFlowPosition;
  }, [screenToFlowPosition, screenToFlowPositionRef]);

  // Restore saved viewport on mount
  useEffect(() => {
    const saved = localStorage.getItem(VIEWPORT_KEY);
    if (saved) {
      try {
        const vp = JSON.parse(saved) as Viewport;
        setViewport(vp); // immediate, no animation — before first user interaction
      } catch { /* malformed JSON — ignore */ }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

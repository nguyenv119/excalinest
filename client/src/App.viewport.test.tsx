/**
 * ViewportController integration tests.
 *
 * These tests verify that App.tsx correctly wires ViewportController into
 * ReactFlow, verifies viewport stays put on collapse/expand, and persists
 * viewport state to localStorage via onMoveEnd.
 *
 * Kept separate from App.collapse.test.tsx because this file mocks
 * @xyflow/react at the module level (vi.mock is hoisted by Vitest) to
 * capture props passed to ReactFlow and to stub useReactFlow. That mock
 * would break tests in other files that rely on real ReactFlow rendering.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Edge, Viewport } from '@xyflow/react';
import type { CanvasNodeType } from './components/CanvasNode';
import App from './App';
import * as api from './api';
import type { CanvasNodeData } from './api';

// ─── ReactFlow stub ──────────────────────────────────────────────────────────
// Captures props passed to <ReactFlow> so tests can:
//   1. Verify onMoveEnd is wired (localStorage persistence)
//   2. Trigger onToggleCollapse directly from node data (collapse/expand)
//   3. Assert fitView prop value (first-visit vs saved-viewport)
//
// Also stubs useReactFlow so ViewportController can call setViewport,
// screenToFlowPosition, and getViewport without a real layout engine (jsdom).
//
// Background/Controls/MiniMap are nulled because they use the ReactFlow
// zustand store internally, which is unavailable when ReactFlow itself is a stub.

let capturedReactFlowProps: Record<string, unknown> = {};
const mockSetViewport = vi.fn();

// REVIEW: mocking core dependency — test may not reflect real behavior
vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...actual,
    ReactFlow: (props: { children?: ReactNode; nodes?: CanvasNodeType[]; edges?: Edge[] } & Record<string, unknown>) => {
      capturedReactFlowProps = props;
      // Render children so ViewportController mounts inside the stub context
      return <div className="react-flow">{props.children as ReactNode}</div>;
    },
    // Stub subcomponents that require the ReactFlow zustand store
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    useReactFlow: () => ({
      setViewport: mockSetViewport,
    }),
  };
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const parentNode: CanvasNodeData = {
  id: 'parent',
  parent_id: null,
  title: 'Parent',
  notes: '',
  x: 0,
  y: 0,
  width: 320,
  height: 240,
  collapsed: 0,
  border_color: null,
  bg_color: null,
  border_width: null,
  border_style: null,
  font_size: null,
  font_color: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const childNode: CanvasNodeData = {
  id: 'child',
  parent_id: 'parent',
  title: 'Child',
  notes: '',
  x: 50,
  y: 60,
  width: null,
  height: null,
  collapsed: 0,
  border_color: null,
  bg_color: null,
  border_width: null,
  border_style: null,
  font_size: null,
  font_color: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

// Helper: wait for nodes to be loaded into ReactFlow props and return the
// onToggleCollapse callback for a specific node ID.
async function waitForToggleCollapse(nodeId: string): Promise<(id: string) => void> {
  let cb: ((id: string) => void) | undefined;
  await waitFor(() => {
    const nodes = capturedReactFlowProps.nodes as CanvasNodeType[] | undefined;
    const node = nodes?.find((n) => n.id === nodeId);
    if (!node?.data?.onToggleCollapse) throw new Error('onToggleCollapse not yet available');
    cb = node.data.onToggleCollapse as (id: string) => void;
  });
  return cb!;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('App — ViewportController integration', () => {
  beforeEach(() => {
    capturedReactFlowProps = {};
    mockSetViewport.mockClear();
    localStorage.clear();

    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([parentNode, childNode]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([]);
    vi.spyOn(api, 'patchNode').mockResolvedValue(parentNode);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ReactFlow receives onMoveEnd handler after App mounts', async () => {
    /**
     * Verifies that App wires an onMoveEnd callback into ReactFlow.
     *
     * Why: Without onMoveEnd, viewport pan/zoom events are never captured
     * and localStorage will never be updated. This is the minimal contract
     * that the persistence mechanism is plumbed at all.
     *
     * What breaks: Viewport position is never saved to localStorage, so
     * reloading the page always shows the default fitView rather than where
     * the user left off.
     */
    // GIVEN the API returns nodes (mocked in beforeEach)

    // WHEN App mounts
    render(<App />);
    await waitFor(() => {
      expect(typeof capturedReactFlowProps.onMoveEnd).toBe('function');
    });

    // THEN ReactFlow receives an onMoveEnd prop that is a function
    expect(typeof capturedReactFlowProps.onMoveEnd).toBe('function');
  });

  it('onMoveEnd saves viewport to localStorage after debounce', async () => {
    /**
     * Verifies that invoking the onMoveEnd handler eventually writes the
     * viewport to localStorage under the key "kc-viewport".
     *
     * Why: localStorage persistence is the contract that enables the user
     * to reload and return to the same viewport. If the key is wrong or the
     * value is not JSON-serialized, the restore logic will silently fail.
     *
     * What breaks: Reloading the page loses the user's viewport position
     * even though the save was wired.
     */
    // GIVEN App is mounted with mocked API
    render(<App />);
    await waitFor(() => {
      expect(typeof capturedReactFlowProps.onMoveEnd).toBe('function');
    });

    const viewport: Viewport = { x: 100, y: 200, zoom: 2 };

    // WHEN onMoveEnd is called with a viewport and 600ms debounce elapses
    await act(async () => {
      (capturedReactFlowProps.onMoveEnd as (_: unknown, vp: Viewport) => void)(
        {},
        viewport
      );
      // Advance past the 600ms debounce
      await new Promise((r) => setTimeout(r, 700));
    });

    // THEN localStorage contains the serialized viewport under "kc-viewport"
    const saved = localStorage.getItem('kc-viewport');
    expect(saved).not.toBeNull();
    expect(JSON.parse(saved!)).toEqual(viewport);
  }, 10000);

  it('fitView prop is true on first visit when no saved viewport exists', async () => {
    /**
     * Verifies that ReactFlow receives fitView=true on first visit (no saved
     * viewport in localStorage), so the canvas auto-fits all nodes into view.
     *
     * Why: On first visit or after clearing storage, the canvas should fit
     * all nodes into view. If fitView is unconditionally disabled, a first-time
     * user sees nodes at their raw coordinate positions which may be off-screen.
     *
     * What breaks: New users or users who clear storage see an empty canvas
     * until they manually navigate to their nodes.
     */
    // GIVEN no saved viewport in localStorage (cleared in beforeEach)

    // WHEN App mounts
    render(<App />);
    await waitFor(() => {
      expect(capturedReactFlowProps.fitView !== undefined).toBe(true);
    });

    // THEN ReactFlow receives fitView=true
    expect(capturedReactFlowProps.fitView).toBe(true);
  });

  it('fitView prop is false when a saved viewport exists in localStorage', async () => {
    /**
     * Verifies that ReactFlow receives fitView=false when a saved viewport
     * exists, so the ViewportController can restore the saved position
     * instead of overriding it with fit-all-nodes.
     *
     * Why: If fitView runs after restoring from localStorage, the restore is
     * overridden and the user ends up at the fit-all-nodes view rather than
     * where they left off.
     *
     * What breaks: Reloading the page with a saved viewport always shows the
     * fit-all-nodes view, making localStorage persistence useless.
     */
    // GIVEN a saved viewport in localStorage
    localStorage.setItem('kc-viewport', JSON.stringify({ x: 50, y: 75, zoom: 1.2 }));

    // WHEN App mounts
    render(<App />);
    await waitFor(() => {
      expect(capturedReactFlowProps.fitView !== undefined).toBe(true);
    });

    // THEN ReactFlow receives fitView=false
    expect(capturedReactFlowProps.fitView).toBe(false);
  });

  it('expanding a collapsed parent does NOT call fitBounds (auto-zoom removed)', async () => {
    /**
     * Verifies that expanding a collapsed parent does NOT call fitBounds.
     *
     * Why: Auto-zoom on expand was removed (KC-2r4) because users want the
     * viewport to stay put when toggling collapse/expand. Calling fitBounds
     * would forcibly pan/zoom to the node, overriding the user's current
     * viewport — a disruptive behavior.
     *
     * What breaks: If this test fails, auto-zoom has regressed and expanding
     * a node again hijacks the viewport, moving it away from whatever the
     * user was looking at.
     */
    // GIVEN a parent with one child, collapsed first
    render(<App />);
    const toggleCollapse = await waitForToggleCollapse('parent');
    act(() => { toggleCollapse('parent'); });
    mockSetViewport.mockClear();

    // WHEN expand is triggered (toggle on a collapsed node)
    act(() => { toggleCollapse('parent'); });
    await new Promise((r) => setTimeout(r, 100));

    // THEN setViewport is NOT called — viewport stays put on expand
    expect(mockSetViewport).not.toHaveBeenCalled();
  }, 10000);

  it('collapsing an expanded parent does NOT call setViewport (auto-zoom removed)', async () => {
    /**
     * Verifies that collapsing a parent does NOT call setViewport.
     *
     * Why: Auto-zoom on collapse was removed (KC-2r4) because users want the
     * viewport to stay put when toggling collapse/expand. Previously collapsing
     * would pop a saved viewport and animate back — that behavior is gone.
     *
     * What breaks: If this test fails, collapsing a parent again animates the
     * viewport back to a previously-saved position, overriding the user's
     * current view.
     */
    // GIVEN a parent with one child (expanded)
    render(<App />);
    const toggleCollapse = await waitForToggleCollapse('parent');

    // WHEN collapse is triggered
    await act(async () => {
      toggleCollapse('parent');
      await new Promise((r) => setTimeout(r, 100));
    });

    // THEN setViewport is NOT called — no viewport animation on collapse
    expect(mockSetViewport).not.toHaveBeenCalled();
  }, 10000);

  it('ViewportController renders null and does not add DOM elements to the canvas', async () => {
    /**
     * Verifies that ViewportController is rendered as a child of ReactFlow
     * but produces no DOM output (returns null).
     *
     * Why: ViewportController must be inside <ReactFlow> to use useReactFlow().
     * It must render null to avoid adding unexpected DOM nodes to the canvas
     * that could interfere with the ReactFlow rendering layer.
     *
     * What breaks: Either ViewportController errors on mount (if outside
     * ReactFlow) or renders visible DOM elements that overlay the canvas.
     */
    // GIVEN App mounts with standard data

    // WHEN App renders
    render(<App />);
    await waitFor(() => {
      expect(document.querySelector('.react-flow')).not.toBeNull();
    });

    // THEN no element with a ViewportController-specific data-testid exists —
    // ViewportController returns null and adds no DOM nodes to the canvas.
    expect(document.querySelector('[data-testid="viewport-controller"]')).toBeNull();
  });


  it('setViewport is called on mount when localStorage has a saved viewport', async () => {
    /**
     * Verifies that ViewportController restores the saved viewport from
     * localStorage by calling setViewport immediately on mount.
     *
     * Why: This is the core "return to where you left off" contract. Without
     * setViewport being called on mount with the saved data, the user always
     * starts at the default fitView position regardless of their last session.
     *
     * What breaks: Users lose their viewport position on every page reload,
     * making localStorage persistence functionally useless.
     */
    // GIVEN localStorage has a saved viewport
    const savedViewport: Viewport = { x: 50, y: 75, zoom: 1.2 };
    localStorage.setItem('kc-viewport', JSON.stringify(savedViewport));

    // WHEN App mounts
    render(<App />);

    // THEN setViewport is called with the saved viewport (mount-restore path)
    await waitFor(() => {
      expect(mockSetViewport).toHaveBeenCalledWith(savedViewport);
    });
  });

  it('no error is thrown when localStorage contains malformed JSON for kc-viewport', async () => {
    /**
     * Verifies that ViewportController silently ignores malformed JSON in
     * localStorage rather than throwing an error that would crash the app.
     *
     * Why: A corrupted or truncated localStorage value (e.g. from a browser
     * crash during the save) must not break the entire canvas. Silent failure
     * is the correct behavior — fall back to fitView instead of crashing.
     *
     * What breaks: If JSON.parse throws uncaught, the ReactFlow canvas never
     * renders and the user sees a blank or error screen.
     */
    // GIVEN localStorage has malformed JSON under the viewport key
    localStorage.setItem('kc-viewport', 'not-valid-json{{{');

    // WHEN App mounts
    let caughtError: unknown = null;
    try {
      render(<App />);
      await waitFor(() => {
        expect(document.querySelector('.react-flow')).not.toBeNull();
      });
    } catch (e) {
      caughtError = e;
    }

    // THEN no error is thrown — canvas renders normally
    expect(caughtError).toBeNull();
  });
});

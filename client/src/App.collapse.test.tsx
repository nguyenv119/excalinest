import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, fireEvent, act } from '@testing-library/react';
import App from './App';
import * as api from './api';
import type { CanvasNodeData, CanvasEdge } from './api';
import { dbNodeToFlowNodeBase } from './App';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const parentNode: CanvasNodeData = {
  id: 'parent',
  parent_id: null,
  title: 'Parent',
  notes: '',
  x: 0,
  y: 0,
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

const collapsedParentNode: CanvasNodeData = {
  ...parentNode,
  id: 'collapsed-parent',
  title: 'Collapsed Parent',
  collapsed: 1,
};

const childOfCollapsedNode: CanvasNodeData = {
  ...childNode,
  id: 'child-of-collapsed',
  parent_id: 'collapsed-parent',
  title: 'Child of Collapsed',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('App — collapse/expand behavior', () => {
  beforeEach(() => {
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'patchNode').mockResolvedValue(parentNode);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows collapse toggle button on nodes that have children', async () => {
    /**
     * Verifies that the ▼/▶ collapse toggle button appears on a node that
     * has at least one child in the tree.
     *
     * Why: The collapse feature is the core differentiating feature of this
     * canvas. If the button doesn't render, users cannot access collapse/
     * expand at all.
     *
     * What breaks: Parent nodes appear identically to leaf nodes; users have
     * no affordance to collapse subtrees.
     */
    // GIVEN a parent node with one child
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([parentNode, childNode]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([]);

    // WHEN App mounts and data loads
    const { container } = render(<App />);

    // THEN the collapse button appears on the parent node
    await waitFor(() => {
      const toggleButton = container.querySelector('[data-testid="collapse-toggle"]');
      expect(toggleButton).not.toBeNull();
    });
  });

  it('does not show collapse toggle on leaf nodes (no children)', async () => {
    /**
     * Verifies that the collapse toggle is NOT shown on leaf nodes.
     *
     * Why: Showing a non-functional toggle on leaf nodes would confuse users
     * and clutter the UI. The toggle should only appear when there are
     * descendants to hide.
     *
     * What breaks: Leaf nodes show a collapse button that does nothing, making
     * the UI feel broken and misleading.
     */
    // GIVEN only a single root node with no children
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([parentNode]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([]);

    // WHEN App mounts
    const { container } = render(<App />);

    // THEN no collapse button is rendered
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });
    const toggleButtons = container.querySelectorAll('[data-testid="collapse-toggle"]');
    expect(toggleButtons).toHaveLength(0);
  });

  it('hides child nodes on canvas after they are initially loaded with a collapsed parent', async () => {
    /**
     * Verifies that when a node has collapsed=1 in the DB, its children are
     * loaded with hidden:true so they are invisible on initial render.
     *
     * Why: Collapse state must persist across page reloads. If the hidden flag
     * is not applied on load, a "collapsed" parent will show its children
     * immediately on page load, defeating the purpose of persistence.
     *
     * What breaks: After a page reload, previously collapsed subtrees become
     * fully visible again, requiring the user to re-collapse manually.
     */
    // GIVEN a collapsed parent and its child loaded from DB
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([
      collapsedParentNode,
      childOfCollapsedNode,
    ]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([]);

    // WHEN App mounts
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // THEN the child node text is NOT rendered (it is hidden)
    // React Flow's `hidden: true` removes the node from the DOM
    await waitFor(() => {
      // The child node title should not be present since it's hidden
      expect(container.querySelector('[data-id="child-of-collapsed"]')).toBeNull();
    });
  });

  it('persists collapsed state to server when toggle is clicked', async () => {
    /**
     * Verifies that clicking the collapse toggle calls patchNode with the
     * new collapsed value so the state persists across reloads.
     *
     * Why: Without server persistence, collapsed state is lost on page reload.
     * The patchNode call is the only mechanism ensuring SQLite records the
     * collapsed flag.
     *
     * What breaks: User collapses a node, refreshes the page, and finds the
     * node expanded again — the collapse action had no durable effect.
     */
    // GIVEN a parent node with one child, parent is currently expanded
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([parentNode, childNode]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([]);
    const patchSpy = vi.spyOn(api, 'patchNode').mockResolvedValue(parentNode);

    // WHEN App mounts and user clicks the collapse toggle
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="collapse-toggle"]')).not.toBeNull();
    });
    const toggleButton = container.querySelector('[data-testid="collapse-toggle"]')!;
    fireEvent.click(toggleButton);

    // THEN patchNode is called with collapsed: 1 for the parent node
    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith('parent', expect.objectContaining({ collapsed: 1 }));
    });
  });

  it('collapsed parent node loads with compact height of 52px', async () => {
    /**
     * Verifies that a parent node with collapsed=1 in the DB is rendered
     * with a style height of 52px (COLLAPSED_HEIGHT) on initial load.
     *
     * Why: The compact collapse feature shrinks collapsed parent nodes to a
     * 52px title bar so the canvas is less cluttered. The height must be
     * applied at load time (not just after toggling) so that reload correctly
     * shows the compacted state that was saved.
     *
     * What breaks: After reloading, previously collapsed parents render at
     * their full height (e.g. 240px), making the canvas look unexpectedly
     * expanded even though the user had collapsed them.
     */
    // GIVEN a collapsed parent (collapsed=1) with known dimensions loaded from DB
    const collapsedParentWithDims: CanvasNodeData = {
      ...collapsedParentNode,
      width: 320,
      height: 240,
    };
    const child = { ...childOfCollapsedNode };
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([collapsedParentWithDims, child]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([]);

    // WHEN App mounts and data loads
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // THEN the collapsed parent wrapper has height 52px
    await waitFor(() => {
      const parentEl = container.querySelector('[data-id="collapsed-parent"]') as HTMLElement | null;
      expect(parentEl).not.toBeNull();
      expect(parentEl!.style.height).toBe('52px');
    });
  });

  it('collapsing an expanded parent shrinks its height to 52px', async () => {
    /**
     * Verifies that clicking the collapse toggle on an expanded parent node
     * changes its style height from the expanded value (240px) to 52px.
     *
     * Why: The compact collapse feature is the core differentiating UX of
     * the canvas. Without the height shrink, collapsing a parent looks
     * identical to the expanded state (children simply disappear but the
     * card keeps its full size), which is confusing.
     *
     * What breaks: Collapsing a parent hides child nodes but the parent
     * card remains at its full 240px height, wasting canvas space and not
     * signaling that the subtree is hidden.
     */
    // GIVEN a parent node with known dimensions and one child (expanded)
    const expandedParent: CanvasNodeData = {
      ...parentNode,
      width: 320,
      height: 240,
    };
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([expandedParent, childNode]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([]);

    // WHEN App mounts, parent is expanded, then collapse toggle is clicked
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="collapse-toggle"]')).not.toBeNull();
    });
    fireEvent.click(container.querySelector('[data-testid="collapse-toggle"]')!);

    // THEN the parent wrapper shrinks to 52px
    await waitFor(() => {
      const parentEl = container.querySelector('[data-id="parent"]') as HTMLElement | null;
      expect(parentEl).not.toBeNull();
      expect(parentEl!.style.height).toBe('52px');
    });
  });

  it('expanding a collapsed parent restores its saved height', async () => {
    /**
     * Verifies that clicking the collapse toggle on a collapsed parent node
     * (collapsed=1 from DB) restores the node height to the saved expanded
     * height (stored in expandedStylesRef).
     *
     * Why: Expand must undo the compact-collapse shrink exactly. If the
     * saved height is not restored, the node expands to a wrong size
     * (e.g. still 52px or defaults to 0), making children invisible or
     * the layout broken.
     *
     * What breaks: After expanding a collapsed parent, the node remains
     * at 52px or snaps to an incorrect height, so children overflow the
     * parent or are invisible.
     */
    // GIVEN a collapsed parent (collapsed=1) with saved DB dimensions
    const collapsedParentWithDims: CanvasNodeData = {
      ...collapsedParentNode,
      width: 320,
      height: 240,
    };
    const child = { ...childOfCollapsedNode };
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([collapsedParentWithDims, child]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([]);

    // WHEN App mounts, parent is collapsed (52px), then expand toggle is clicked
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="collapse-toggle"]')).not.toBeNull();
    });
    fireEvent.click(container.querySelector('[data-testid="collapse-toggle"]')!);

    // THEN the parent wrapper restores to the saved expanded height of 240px
    await waitFor(() => {
      const parentEl = container.querySelector('[data-id="collapsed-parent"]') as HTMLElement | null;
      expect(parentEl).not.toBeNull();
      expect(parentEl!.style.height).toBe('240px');
    });
  });

  it('collapse then expand restores the resized height when node was resized before collapsing', async () => {
    /**
     * Verifies that collapsing then expanding a parent after a programmatic
     * resize restores the resized dimensions, not the original DB dimensions.
     *
     * Why: The collapse action captures the current node style (including any
     * post-resize dimensions) in expandedStylesRef. Expand must read from there
     * to restore the post-resize height. If it reads from DB dimensions or
     * ignores the ref, the user loses their resized layout every time they
     * collapse and expand.
     *
     * What breaks: After resizing a parent, collapsing and expanding it resets
     * the node to its original DB height instead of the resized height the user
     * set.
     */
    // GIVEN a parent node with initial DB dimensions (320x240) and one child
    const expandedParent: CanvasNodeData = {
      ...parentNode,
      width: 320,
      height: 240,
    };
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([expandedParent, childNode]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([]);

    // WHEN App mounts, we simulate a resize to 500x400 by calling onNodeResized
    // (which is the callback CanvasNode calls after NodeResizer drag ends),
    // then collapse, then expand
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="collapse-toggle"]')).not.toBeNull();
    });

    // Simulate a resize by calling onNodeResized through the React fiber
    // to update both expandedStylesRef and node style before collapsing
    await act(async () => {
      const nodeEl = container.querySelector('[data-id="parent"]');
      expect(nodeEl).not.toBeNull();
      // Walk the React fiber to find the onNodeResized callback in node data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fiberKey = Object.keys(nodeEl!).find((k) => k.startsWith('__reactFiber'));
      if (fiberKey) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let fiber = (nodeEl as any)[fiberKey];
        while (fiber) {
          if (fiber.memoizedProps?.data?.onNodeResized) {
            fiber.memoizedProps.data.onNodeResized('parent', 500, 400);
            break;
          }
          fiber = fiber.child ?? fiber.return;
        }
      }
    });

    // Collapse the parent — this records the resized 500x400 into expandedStylesRef
    fireEvent.click(container.querySelector('[data-testid="collapse-toggle"]')!);
    await waitFor(() => {
      const parentEl = container.querySelector('[data-id="parent"]') as HTMLElement | null;
      expect(parentEl!.style.height).toBe('52px');
    });

    // Expand the parent — should restore to the resized 400px, not original 240px
    fireEvent.click(container.querySelector('[data-testid="collapse-toggle"]')!);

    // THEN the parent restores to the resized height of 400px
    await waitFor(() => {
      const parentEl = container.querySelector('[data-id="parent"]') as HTMLElement | null;
      expect(parentEl).not.toBeNull();
      expect(parentEl!.style.height).toBe('400px');
    });
  });

  it('hides edges connected to hidden nodes when a parent is collapsed', async () => {
    /**
     * Verifies that edges whose source or target is a hidden descendant are
     * also hidden when a parent is collapsed.
     *
     * Why: If only nodes are hidden but edges remain visible, the canvas
     * shows floating edge lines dangling with no visible endpoints — a broken
     * visual state.
     *
     * What breaks: After collapsing a parent, edges between its hidden children
     * remain visible as floating arrows on the canvas.
     */
    // GIVEN a parent, two children, and an edge between the children
    const sibling1: CanvasNodeData = { ...childNode, id: 'sibling1', parent_id: 'parent', title: 'Sibling 1' };
    const sibling2: CanvasNodeData = { ...childNode, id: 'sibling2', parent_id: 'parent', title: 'Sibling 2' };
    const edgeBetweenSiblings: CanvasEdge = {
      id: 'e-siblings',
      source_id: 'sibling1',
      target_id: 'sibling2',
      source_handle: null,
      target_handle: null,
      label: null,
      stroke_color: null,
      stroke_width: null,
      stroke_style: null,
      created_at: '2024-01-01T00:00:00Z',
    };

    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([parentNode, sibling1, sibling2]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([edgeBetweenSiblings]);

    // WHEN App mounts and user clicks the collapse toggle on the parent
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="collapse-toggle"]')).not.toBeNull();
    });
    const toggleButton = container.querySelector('[data-testid="collapse-toggle"]')!;
    fireEvent.click(toggleButton);

    // THEN the edge between siblings is no longer in the DOM
    await waitFor(() => {
      // React Flow renders edges in .react-flow__edge elements; hidden edges are removed from DOM
      const edgeEl = container.querySelector('[data-id="e-siblings"]');
      expect(edgeEl).toBeNull();
    });
  });
});

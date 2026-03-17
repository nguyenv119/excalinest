import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/react';
import App from './App';
import * as api from './api';
import type { CanvasNodeData, CanvasEdge } from './api';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const styledNode: CanvasNodeData = {
  id: 'node-style-1',
  parent_id: null,
  title: 'Styled Node',
  notes: 'some notes',
  x: 10,
  y: 20,
  width: null,
  height: null,
  collapsed: 0,
  border_color: null,
  bg_color: null,
  border_width: null,
  border_style: null,
  font_size: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const styledEdge: CanvasEdge = {
  id: 'edge-style-1',
  source_id: 'node-style-1',
  target_id: 'node-style-1',
  source_handle: null,
  target_handle: null,
  label: null,
  stroke_color: null,
  stroke_width: null,
  stroke_style: null,
  created_at: '2024-01-01T00:00:00Z',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('App — styling panel: NodeDetailPanel style section', () => {
  beforeEach(() => {
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([styledNode]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([styledEdge]);
    vi.spyOn(api, 'patchNode').mockResolvedValue(styledNode);
    vi.spyOn(api, 'patchEdge').mockResolvedValue(styledEdge);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Style section renders all controls when a node is selected', async () => {
    /**
     * Verifies that NodeDetailPanel renders all four style control groups
     * (stroke swatches, background swatches, border width toggles, border style
     * toggles) when a node is selected.
     *
     * Why: The styling section is the primary UI surface for bead 8j4.4.
     * Each control group targets a different style dimension (color, fill,
     * weight, line-style). Missing any group means users lose that dimension.
     *
     * What breaks: Clicking a node opens the panel but one or more style
     * control groups are absent, silently preventing certain style changes.
     */
    // GIVEN the App has loaded with one node

    // WHEN App mounts and we click the node to select it
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    const nodeEl = container.querySelector('[data-id="node-style-1"]');
    expect(nodeEl).not.toBeNull();
    fireEvent.click(nodeEl!);

    // THEN the NodeDetailPanel shows all four style control groups
    await waitFor(() => {
      expect(container.querySelector('[data-testid="stroke-swatches"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="bg-swatches"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="border-width-toggles"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="border-style-toggles"]')).not.toBeNull();
    });
  });

  it('clicking a stroke swatch marks it active (aria-pressed) and persists to server', async () => {
    /**
     * Verifies that clicking a stroke color swatch immediately persists via
     * patchNode AND marks the swatch as the active selection in the DOM via
     * aria-pressed.
     *
     * Why: Style picks are discrete choices (not continuous text entry), so
     * they should persist immediately without debounce. aria-pressed makes the
     * active state machine-readable for both tests and assistive technology.
     *
     * What breaks: Clicking a color swatch appears to work but either the
     * color is never saved, or the swatch stays visually unselected so the
     * user cannot tell which color is active.
     */
    // GIVEN the App has loaded with one node and patchNode is mocked
    const patchSpy = vi.spyOn(api, 'patchNode').mockResolvedValue({
      ...styledNode,
      border_color: '#ef4444',
    });

    // WHEN App mounts, node is clicked to select it, then a stroke swatch is clicked
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    const nodeEl = container.querySelector('[data-id="node-style-1"]');
    expect(nodeEl).not.toBeNull();
    fireEvent.click(nodeEl!);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="stroke-swatches"]')).not.toBeNull();
    });

    const swatchBtn = container.querySelector('[data-testid="stroke-swatch-red"]');
    expect(swatchBtn).not.toBeNull();
    fireEvent.click(swatchBtn!);

    // THEN patchNode is called with border_color: '#ef4444'
    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith(
        'node-style-1',
        expect.objectContaining({ border_color: '#ef4444' })
      );
    });

    // AND the swatch is marked active in the DOM
    await waitFor(() => {
      const swatch = container.querySelector('[data-testid="stroke-swatch-red"]');
      expect(swatch?.getAttribute('aria-pressed')).toBe('true');
    });
  });
});

describe('App — styling panel: EdgeDetailPanel', () => {
  beforeEach(() => {
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([styledNode]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([styledEdge]);
    vi.spyOn(api, 'patchNode').mockResolvedValue(styledNode);
    vi.spyOn(api, 'patchEdge').mockResolvedValue(styledEdge);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('EdgeDetailPanel does not render when no edge is selected', async () => {
    /**
     * Verifies that the EdgeDetailPanel is absent from the DOM when no edge
     * is currently selected.
     *
     * Why: The panel should only appear when an edge is selected — rendering it
     * when nothing is selected would confuse users and waste screen space.
     *
     * What breaks: The edge panel is always visible, overlapping the canvas
     * and obscuring nodes even when the user is not working with edges.
     */
    // GIVEN App loads with no edge selected

    // WHEN App mounts
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // THEN EdgeDetailPanel is not present
    expect(container.querySelector('[data-testid="edge-detail-panel"]')).toBeNull();
  });

  it('EdgeDetailPanel renders stroke swatches but no bg-swatches when an edge is selected', async () => {
    /**
     * Verifies that EdgeDetailPanel shows stroke color swatches but does NOT
     * show background (fill) swatches, since edges have no fill.
     *
     * Why: Showing fill controls for edges would be confusing and meaningless —
     * edges are lines, not shapes. Hiding irrelevant controls keeps the panel
     * focused and avoids user confusion.
     *
     * What breaks: Users see a "Background" swatch row in the EdgeDetailPanel
     * and click it expecting the edge fill to change — nothing happens and
     * the user is confused.
     *
     * Note: React Flow SVG edges do not render in JSDOM. We trigger onEdgeClick
     * via a test-only hidden button (data-testid="select-edge-{id}") that App
     * renders when import.meta.env.MODE === 'test'.
     */
    // GIVEN App has loaded with a node and an edge

    // WHEN App mounts
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // Trigger edge selection via the test-only trigger button (replicates onEdgeClick)
    const edgeTrigger = container.querySelector('[data-testid="select-edge-edge-style-1"]');
    expect(edgeTrigger).not.toBeNull();
    fireEvent.click(edgeTrigger!);

    // THEN EdgeDetailPanel appears with stroke swatches but without bg-swatches
    await waitFor(() => {
      expect(container.querySelector('[data-testid="edge-detail-panel"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="edge-stroke-swatches"]')).not.toBeNull();
    });
    expect(container.querySelector('[data-testid="edge-bg-swatches"]')).toBeNull();
  });
});

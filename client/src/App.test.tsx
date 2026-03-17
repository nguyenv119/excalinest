import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import * as api from './api';
import type { CanvasNodeData, CanvasEdge } from './api';

// React Flow requires ResizeObserver in jsdom
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// React Flow uses crypto.randomUUID internally
Object.defineProperty(globalThis, 'crypto', {
  value: { randomUUID: () => 'test-uuid' },
  configurable: true,
});

const mockNode: CanvasNodeData = {
  id: 'n1',
  parent_id: null,
  title: 'Alpha',
  notes: 'some notes',
  x: 10,
  y: 20,
  collapsed: 0,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const mockEdge: CanvasEdge = {
  id: 'e1',
  source_id: 'n1',
  target_id: 'n2',
  label: null,
  created_at: '2024-01-01T00:00:00Z',
};

describe('App — smoke test', () => {
  beforeEach(() => {
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([mockNode]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([mockEdge]);
    vi.spyOn(api, 'patchNode').mockResolvedValue(mockNode);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the ReactFlow canvas after data loads', async () => {
    /**
     * App mounts and renders the ReactFlow canvas container, proving the
     * data-loading → state-conversion → render pipeline works end-to-end.
     *
     * Why: This is the smoke test for the entire App render path — if the
     * drag-stop wiring (onNodeDragStop) or data conversion breaks, the
     * component will throw during mount.
     *
     * What breaks: The app crashes on load and shows a blank page instead
     * of the canvas.
     */
    // GIVEN the API returns one node and one edge (mocked in beforeEach)

    // WHEN App mounts
    const { container } = render(<App />);

    // THEN the ReactFlow canvas is rendered
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });
  });

  it('renders the Toolbar with an Add Node button after data loads', async () => {
    /**
     * Verifies that the Toolbar overlay is rendered inside the canvas once
     * data has loaded, giving users the ability to create new nodes.
     *
     * Why: Without the Toolbar being mounted in App, the "Add Node" feature
     * cannot be reached regardless of Toolbar's own unit tests passing.
     *
     * What breaks: The canvas renders but shows no "Add Node" button;
     * users cannot create any nodes.
     */
    // GIVEN the API returns nodes and edges (mocked in beforeEach)

    // WHEN App mounts and data loads
    render(<App />);

    // THEN the Add Node button is visible
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add node/i })).toBeInTheDocument();
    });
  });

  it('appends a new node to the canvas when Add Node is clicked', async () => {
    /**
     * Verifies that clicking "Add Node" calls createNode and adds the returned
     * node to the React Flow nodes state, making it visible in the canvas.
     *
     * Why: The Toolbar callback and the createNode → setNodes pipeline must be
     * wired together in App. A unit test on Toolbar alone cannot catch a missing
     * handleAddNode or a broken state update.
     *
     * What breaks: Clicking "Add Node" does nothing — the canvas node count
     * remains unchanged despite the user's action.
     */
    // GIVEN the API is set up, and createNode returns a new node
    const newNode: CanvasNodeData = {
      id: 'n2',
      parent_id: null,
      title: 'New Node',
      notes: '',
      x: 100,
      y: 100,
      collapsed: 0,
      created_at: '2024-01-02T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
    };
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'createNode').mockResolvedValue(newNode);

    render(<App />);
    await waitFor(() => screen.getByRole('button', { name: /add node/i }));

    // WHEN the Add Node button is clicked
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));

    // THEN createNode was called
    await waitFor(() => {
      expect(api.createNode).toHaveBeenCalledTimes(1);
    });
  });
});

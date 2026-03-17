import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
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

describe('App — onNodeDragStop', () => {
  beforeEach(() => {
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([mockNode]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([mockEdge]);
    vi.spyOn(api, 'patchNode').mockResolvedValue(mockNode);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the canvas after data loads without throwing', async () => {
    /**
     * Verifies that App mounts, calls fetchNodes/fetchEdges, and renders the
     * ReactFlow canvas without errors.
     *
     * This is a smoke test for the App render path introduced in KC-1.4 and
     * exercised here to confirm the drag-stop wiring (onNodeDragStop prop
     * passed to ReactFlow) does not break the component mount.
     *
     * If this contract breaks, the app will crash on load and no canvas will
     * be displayed to the user.
     */
    const { container } = render(<App />);

    await waitFor(() => {
      expect(api.fetchNodes).toHaveBeenCalledOnce();
      expect(api.fetchEdges).toHaveBeenCalledOnce();
    });

    // ReactFlow renders a div with class react-flow
    expect(container.querySelector('.react-flow')).not.toBeNull();
  });
});

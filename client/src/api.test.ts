import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { patchNode } from './api';

describe('patchNode', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a PATCH request to /nodes/:id with the given patch as JSON body', async () => {
    /**
     * Verifies that patchNode issues a PATCH request to the correct URL with
     * Content-Type: application/json and serialises the patch fields as the
     * request body.
     *
     * This matters because the server expects PATCH /nodes/:id with a JSON
     * body to update individual node fields (e.g. x/y after a drag). If the
     * method, URL, or body encoding are wrong the server will ignore the update
     * and position changes will be silently lost.
     *
     * If this contract breaks, dragging a node will appear to work locally but
     * the new position will not be persisted — on reload the node snaps back to
     * its old location.
     */
    const mockResponse = {
      id: 'node-1',
      parent_id: null,
      title: 'Test',
      notes: '',
      x: 42,
      y: 99,
      collapsed: 0 as const,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:01Z',
    };

    // REVIEW: mocking core dependency — test may not reflect real behavior
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as unknown as Response);

    const result = await patchNode('node-1', { x: 42, y: 99 });

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith('/nodes/node-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: 42, y: 99 }),
    });
    expect(result).toEqual(mockResponse);
  });

  it('throws an error when the server responds with a non-OK status', async () => {
    /**
     * Verifies that patchNode rejects with an Error when the server returns a
     * non-2xx HTTP status (e.g. 404 for an unknown node ID).
     *
     * This matters because a silent failure (returning an empty object on
     * error, as the stub did) hides server-side problems, making it impossible
     * to diagnose why position updates are not persisting.
     *
     * If this contract breaks, callers will receive a resolved promise with
     * garbage data instead of a rejection, so error-handling code paths will
     * never trigger and failures will be invisible in the UI.
     */

    // REVIEW: mocking core dependency — test may not reflect real behavior
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as unknown as Response);

    await expect(patchNode('nonexistent', { x: 0, y: 0 })).rejects.toThrow(
      'patchNode failed: 404'
    );
  });
});

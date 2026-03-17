import { describe, it, expect, vi, afterEach } from 'vitest';
import { createNode } from './api';
import type { CanvasNodeData } from './api';

const mockCreatedNode: CanvasNodeData = {
  id: 'new-node-id',
  parent_id: null,
  title: 'New Node',
  notes: '',
  x: 100,
  y: 200,
  collapsed: 0,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('createNode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts to /nodes and returns the created node', async () => {
    /**
     * Verifies that createNode sends a POST request to /nodes with the
     * provided data and returns the server response as a CanvasNodeData object.
     *
     * Why: This is the data pathway for all node creation. If the POST is not
     * sent, or the response is not parsed, nodes will never persist to the DB
     * and will disappear on page reload.
     *
     * What breaks: Clicking "Add Node" creates a node that vanishes on reload,
     * or createNode throws/returns stale data.
     */
    // GIVEN a successful POST /nodes response
    // REVIEW: mocking core dependency — test may not reflect real behavior
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockCreatedNode), { status: 201 })
    );

    // WHEN createNode is called with partial data
    const result = await createNode({ title: 'New Node', x: 100, y: 200 });

    // THEN it POSTed to /nodes and returned the parsed node
    expect(fetchSpy).toHaveBeenCalledWith('/nodes', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    }));
    expect(result).toEqual(mockCreatedNode);
  });

  it('throws when the server responds with an error status', async () => {
    /**
     * Verifies that createNode throws an Error when the server returns a
     * non-OK status (e.g., 422 validation error, 500 server error).
     *
     * Why: Callers must be able to catch creation failures and surface them to
     * the user. Silently swallowing errors leads to phantom nodes in local state
     * that do not exist in the DB.
     *
     * What breaks: The canvas shows a node that wasn't persisted; reload removes
     * it, confusing the user with silent data loss.
     */
    // GIVEN the server returns a 500 error
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Internal Server Error', { status: 500 })
    );

    // WHEN createNode is called
    // THEN it throws
    await expect(createNode({ title: 'Bad' })).rejects.toThrow('createNode failed: 500');
  });

  it('sends the provided data as the request body', async () => {
    /**
     * Verifies that the data passed to createNode is serialised into the POST
     * body so the server can persist the correct field values.
     *
     * Why: If the body is missing or incorrect, the server will insert a node
     * with default/empty values regardless of what the UI provided.
     *
     * What breaks: New nodes always appear with the default title and position
     * instead of what the caller specified.
     */
    // GIVEN a successful POST response
    // REVIEW: mocking core dependency — test may not reflect real behavior
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockCreatedNode), { status: 201 })
    );
    const payload = { title: 'My Node', x: 50, y: 75 };

    // WHEN createNode is called with specific data
    await createNode(payload);

    // THEN the body contains the serialised payload
    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject(payload);
  });
});

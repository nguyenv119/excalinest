import type { CanvasNode, CanvasEdge } from './types.js';

const BASE_URL = process.env.CANVAS_API_URL ?? 'http://localhost:3001';

// ─── Generic request helper ──────────────────────────────────────────────────

/**
 * Performs an HTTP request to the Canvas Express API and returns the parsed
 * JSON response body typed as T.
 *
 * For DELETE requests (which return 204 No Content), call request<void> and
 * the caller is responsible for not reading a return value — use the
 * specialised requestVoid() helper instead to make the intent explicit.
 *
 * Throws an Error with method, path, status, and server-provided body text on
 * any non-2xx response.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, init);

  if (!res.ok) {
    const body = await res.text();
    const method = init?.method ?? 'GET';
    throw new Error(`${method} ${path} failed with status ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Performs an HTTP request that returns 204 No Content (DELETE endpoints).
 * Correctly avoids calling .json() on an empty body.
 */
async function requestVoid(path: string, init?: RequestInit): Promise<void> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, init);

  if (!res.ok) {
    const body = await res.text();
    const method = init?.method ?? 'DELETE';
    throw new Error(`${method} ${path} failed with status ${res.status}: ${body}`);
  }
}

// ─── Node functions ──────────────────────────────────────────────────────────

/** Fetch all nodes from the canvas. */
export function getNodes(): Promise<CanvasNode[]> {
  return request<CanvasNode[]>('/nodes');
}

/** Create a single node. The server assigns the id. */
export function createNode(data: Partial<CanvasNode>): Promise<CanvasNode> {
  return request<CanvasNode>('/nodes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

/** Atomically create multiple nodes with client-supplied ids. */
export function createNodesBulk(
  nodes: Array<Partial<CanvasNode> & { id: string; title: string }>,
): Promise<CanvasNode[]> {
  return request<CanvasNode[]>('/nodes/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodes }),
  });
}

/** Partially update a node by id. */
export function updateNode(id: string, patch: Partial<CanvasNode>): Promise<CanvasNode> {
  return request<CanvasNode>(`/nodes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

/** Delete a node and all its descendants + connected edges (server-side cascade). */
export function deleteNode(id: string): Promise<void> {
  return requestVoid(`/nodes/${id}`, { method: 'DELETE' });
}

// ─── Edge functions ──────────────────────────────────────────────────────────

/** Fetch all edges from the canvas. */
export function getEdges(): Promise<CanvasEdge[]> {
  return request<CanvasEdge[]>('/edges');
}

/** Create an edge between two existing nodes. */
export function createEdge(
  data: Pick<CanvasEdge, 'source_id' | 'target_id'> &
    Partial<Pick<CanvasEdge, 'source_handle' | 'target_handle' | 'label' | 'stroke_color' | 'stroke_width' | 'stroke_style'>>,
): Promise<CanvasEdge> {
  return request<CanvasEdge>('/edges', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

/** Delete an edge by id. */
export function deleteEdge(id: string): Promise<void> {
  return requestVoid(`/edges/${id}`, { method: 'DELETE' });
}

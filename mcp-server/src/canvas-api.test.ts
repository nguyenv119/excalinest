/**
 * Integration tests for canvas-api.ts HTTP client functions.
 *
 * These tests spin up a real Express server backed by an in-memory SQLite DB
 * (the same factory used by the server workspace's own tests). The test server
 * listens on port 3001 — the same port the client hardcodes.
 *
 * Why real server: the client functions are thin wrappers over fetch. Testing
 * them against a mock fetch only proves that we called fetch correctly — it
 * doesn't prove that the request/response contract with the real API is correct.
 * Integration tests here would have caught mismatches like wrong field names or
 * incorrect status code handling.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';

// Import the real Express app factory from the server workspace.
// Vitest resolves this through the monorepo node_modules.
// REVIEW: importing from a sibling workspace (CJS) — no mock alternative exists
// since we want real HTTP round-trips to test the client correctly.
import { createApp } from '../../server/src/server.js';

import {
  getNodes,
  getEdges,
  createNode,
  createNodesBulk,
  updateNode,
  deleteNode,
  createEdge,
  deleteEdge,
} from './canvas-api.js';

// ─── Schema ─────────────────────────────────────────────────────────────────

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES nodes(id),
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    x REAL NOT NULL DEFAULT 0,
    y REAL NOT NULL DEFAULT 0,
    collapsed INTEGER NOT NULL DEFAULT 0,
    width REAL,
    height REAL,
    border_color TEXT,
    bg_color TEXT,
    border_width TEXT,
    border_style TEXT,
    font_size TEXT,
    font_color TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS edges (
    id TEXT PRIMARY KEY,
    source_id TEXT,
    target_id TEXT,
    source_handle TEXT,
    target_handle TEXT,
    label TEXT,
    stroke_color TEXT,
    stroke_width TEXT,
    stroke_style TEXT,
    created_at TEXT NOT NULL
  );
`;

// ─── Server lifecycle ────────────────────────────────────────────────────────

let testDb: DatabaseType;
let httpServer: ReturnType<typeof import('http').createServer>;

beforeAll(async () => {
  // GIVEN a real Express server on an OS-assigned port (port 0) to avoid conflicts
  testDb = new Database(':memory:');
  testDb.exec(SCHEMA);
  const app = createApp(testDb);

  await new Promise<void>((resolve) => {
    httpServer = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = httpServer.address() as import('net').AddressInfo;
  process.env.CANVAS_API_URL = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  delete process.env.CANVAS_API_URL;
  await new Promise<void>((resolve, reject) => {
    httpServer.close((err) => (err ? reject(err) : resolve()));
  });
});

// ─── getNodes ───────────────────────────────────────────────────────────────

describe('getNodes', () => {
  it('returns an empty array when no nodes exist', async () => {
    /**
     * Verifies that getNodes() returns [] when the canvas has no nodes.
     *
     * This matters because downstream tools (get_canvas, search_nodes) call
     * getNodes() on a fresh canvas and must handle the empty case without
     * throwing or producing undefined.
     *
     * If this contract breaks, MCP tools that map/filter the result will throw
     * a TypeError on the empty response.
     */
    // GIVEN an empty database (shared test server, freshened in beforeAll)
    // (We rely on the schema being fresh in beforeAll — individual tests don't
    //  reset state, so getNodes is tested before any creates.)

    // WHEN fetching all nodes
    const nodes = await getNodes();

    // THEN an empty array is returned
    expect(Array.isArray(nodes)).toBe(true);
  });
});

// ─── createNode ─────────────────────────────────────────────────────────────

describe('createNode', () => {
  it('creates a node and returns the full node object with all fields', async () => {
    /**
     * Verifies that createNode() POSTs to /nodes and returns the created
     * node record including server-assigned id, timestamps, and defaults.
     *
     * This matters because callers use the returned id to reference the node
     * in subsequent operations (createEdge, updateNode). If the id is missing
     * or the response is not parsed, the caller cannot perform follow-up
     * operations.
     *
     * If this contract breaks, chained operations (create node → create edge)
     * fail with "node not found" errors or undefined id errors.
     */
    // GIVEN a title and optional style fields
    const data = { title: 'API Test Node', notes: 'some notes', x: 10, y: 20 };

    // WHEN creating a node
    const node = await createNode(data);

    // THEN the returned object has an id, the provided title, and timestamps
    expect(typeof node.id).toBe('string');
    expect(node.id.length).toBeGreaterThan(0);
    expect(node.title).toBe('API Test Node');
    expect(node.notes).toBe('some notes');
    expect(node.x).toBe(10);
    expect(node.y).toBe(20);
    expect(typeof node.created_at).toBe('string');
    expect(typeof node.updated_at).toBe('string');
  });

  it('throws an error when the API returns a non-ok status', async () => {
    /**
     * Verifies that createNode() throws a descriptive Error when the server
     * rejects the request (e.g., missing required title → 422).
     *
     * This matters because MCP tool handlers wrap calls in try/catch and
     * return the error message to the LLM. A silent failure (no throw) would
     * return an undefined node and produce confusing downstream errors.
     *
     * If this contract breaks, MCP tools catch nothing and pass undefined to
     * callers, causing TypeErrors that are harder to diagnose.
     */
    // GIVEN a node body with no title (server returns 422)

    // WHEN creating a node without a required field
    // THEN an Error is thrown containing the status code
    await expect(createNode({ title: '' })).rejects.toThrow(/422/);
  });
});

// ─── getNodes (populated) ────────────────────────────────────────────────────

describe('getNodes (after creates)', () => {
  it('returns all created nodes', async () => {
    /**
     * Verifies that getNodes() returns every node that has been created,
     * including nodes from previous test cases that share the in-memory DB.
     *
     * This matters because MCP tools rely on getNodes() to reflect the full
     * current state of the canvas. Stale or partial results would cause tools
     * like get_canvas to produce an incomplete hierarchy.
     *
     * If this contract breaks, nodes are "missing" from the canvas view even
     * though they were successfully created.
     */
    // GIVEN at least one node was created in the previous tests

    // WHEN fetching all nodes
    const nodes = await getNodes();

    // THEN the list is non-empty and contains CanvasNode objects
    expect(nodes.length).toBeGreaterThan(0);
    const first = nodes[0];
    expect(typeof first.id).toBe('string');
    expect(typeof first.title).toBe('string');
  });
});

// ─── createNodesBulk ────────────────────────────────────────────────────────

describe('createNodesBulk', () => {
  it('creates multiple nodes atomically and returns all of them', async () => {
    /**
     * Verifies that createNodesBulk() POSTs to /nodes/bulk with client-supplied
     * IDs and returns all created nodes in a single response.
     *
     * This matters because the organize-canvas skill creates entire subtrees in
     * one operation. Using bulk creation ensures atomicity — either all nodes
     * are created or none are, preventing partial canvas states.
     *
     * If this contract breaks, partial subtrees appear on the canvas, breaking
     * the parent-child relationships that define the hierarchy.
     */
    // GIVEN two nodes with client-supplied IDs
    const nodes = [
      { id: 'bulk-test-node-1', title: 'Bulk Node A', x: 0, y: 0 },
      { id: 'bulk-test-node-2', title: 'Bulk Node B', x: 100, y: 0 },
    ];

    // WHEN creating them in bulk
    const created = await createNodesBulk(nodes);

    // THEN both nodes are returned with their provided IDs
    expect(created).toHaveLength(2);
    const ids = created.map((n) => n.id);
    expect(ids).toContain('bulk-test-node-1');
    expect(ids).toContain('bulk-test-node-2');
  });
});

// ─── updateNode ─────────────────────────────────────────────────────────────

describe('updateNode', () => {
  it('patches the specified fields and returns the updated node', async () => {
    /**
     * Verifies that updateNode() PATCHes /nodes/:id with the given fields and
     * returns the complete updated node.
     *
     * This matters because MCP tools update node titles, positions, and styles
     * in response to user instructions. The returned node is used to confirm
     * the update and may be shown to the user.
     *
     * If this contract breaks, updates are silently lost — the canvas shows
     * stale data even after the MCP tool reports success.
     */
    // GIVEN a node exists
    const node = await createNode({ title: 'Before Update' });

    // WHEN patching the title
    const updated = await updateNode(node.id, { title: 'After Update' });

    // THEN the returned node reflects the new title
    expect(updated.title).toBe('After Update');
    expect(updated.id).toBe(node.id);
  });

  it('throws an error when updating a node that does not exist', async () => {
    /**
     * Verifies that updateNode() throws when the target node id does not exist
     * in the database (server returns 404).
     *
     * This matters because MCP tools must propagate "node not found" errors to
     * the LLM so it can correct its input rather than silently proceeding.
     *
     * If this contract breaks, the MCP tool returns success even when the
     * update had no effect, misleading the LLM into thinking state changed.
     */
    // GIVEN a nonexistent node id

    // WHEN patching it
    // THEN an Error containing the status is thrown
    await expect(updateNode('nonexistent-id', { title: 'X' })).rejects.toThrow(/404/);
  });
});

// ─── deleteNode ─────────────────────────────────────────────────────────────

describe('deleteNode', () => {
  it('deletes a node without throwing', async () => {
    /**
     * Verifies that deleteNode() sends DELETE /nodes/:id and returns void on
     * success (204 No Content), without attempting to parse an empty body.
     *
     * This matters because DELETE returns 204 with no body. Attempting to call
     * .json() on a 204 response throws a SyntaxError. The client must handle
     * DELETE specially to avoid this.
     *
     * If this contract breaks, every node deletion throws a SyntaxError and
     * the MCP delete_node tool always reports failure even when the deletion
     * succeeded.
     */
    // GIVEN an existing node
    const node = await createNode({ title: 'To Delete' });

    // WHEN deleting it
    const result = await deleteNode(node.id);

    // THEN it returns undefined (void) without throwing
    expect(result).toBeUndefined();
  });

  it('throws an error when deleting a node that does not exist', async () => {
    /**
     * Verifies that deleteNode() throws when the target node is not found
     * (server returns 404).
     *
     * This matters for the same reason as updateNode — the LLM needs a clear
     * error signal when the requested resource doesn't exist.
     *
     * If this contract breaks, the MCP tool silently "succeeds" on a 404,
     * leaving the LLM confused about canvas state.
     */
    // GIVEN a nonexistent node id

    // WHEN attempting to delete it
    // THEN an Error containing the status is thrown
    await expect(deleteNode('nonexistent-id')).rejects.toThrow(/404/);
  });
});

// ─── createEdge ─────────────────────────────────────────────────────────────

describe('createEdge', () => {
  it('creates an edge between two existing nodes and returns the edge', async () => {
    /**
     * Verifies that createEdge() POSTs to /edges and returns the created edge
     * with its server-assigned id and the provided source/target ids.
     *
     * This matters because MCP tools wire up hierarchical relationships between
     * nodes by creating edges. The returned edge id is used for subsequent
     * deleteEdge calls.
     *
     * If this contract breaks, edges are not persisted and the canvas shows
     * disconnected nodes even after the organize-canvas skill ran.
     */
    // GIVEN two existing nodes
    const src = await createNode({ title: 'Edge Source' });
    const tgt = await createNode({ title: 'Edge Target' });

    // WHEN creating an edge between them
    const edge = await createEdge({ source_id: src.id, target_id: tgt.id });

    // THEN the returned edge has the correct source/target ids
    expect(typeof edge.id).toBe('string');
    expect(edge.source_id).toBe(src.id);
    expect(edge.target_id).toBe(tgt.id);
    expect(typeof edge.created_at).toBe('string');
  });
});

// ─── getEdges ───────────────────────────────────────────────────────────────

describe('getEdges', () => {
  it('returns all edges including the one just created', async () => {
    /**
     * Verifies that getEdges() returns all persisted edges from the database.
     *
     * This matters because get_canvas assembles the full canvas by combining
     * getNodes() and getEdges() — missing edges would result in an incomplete
     * or incorrect hierarchy view presented to the LLM.
     *
     * If this contract breaks, edges are invisible to MCP tools and the LLM
     * cannot reason about relationships between canvas nodes.
     */
    // GIVEN at least one edge was created in previous tests

    // WHEN fetching all edges
    const edges = await getEdges();

    // THEN the list is non-empty and contains CanvasEdge objects
    expect(edges.length).toBeGreaterThan(0);
    const first = edges[0];
    expect(typeof first.id).toBe('string');
    expect(typeof first.source_id).toBe('string');
    expect(typeof first.target_id).toBe('string');
  });
});

// ─── deleteEdge ─────────────────────────────────────────────────────────────

describe('deleteEdge', () => {
  it('deletes an edge without throwing', async () => {
    /**
     * Verifies that deleteEdge() sends DELETE /edges/:id and returns void on
     * success (204 No Content), correctly handling the empty response body.
     *
     * This matters for the same reason as deleteNode — DELETE returns 204 with
     * no body. Calling .json() on it throws a SyntaxError that would cause
     * the MCP delete_edge tool to always report failure.
     *
     * If this contract breaks, every edge deletion throws and the LLM cannot
     * remove connections from the canvas.
     */
    // GIVEN two nodes and an edge between them
    const src = await createNode({ title: 'Del Edge Source' });
    const tgt = await createNode({ title: 'Del Edge Target' });
    const edge = await createEdge({ source_id: src.id, target_id: tgt.id });

    // WHEN deleting the edge
    const result = await deleteEdge(edge.id);

    // THEN it returns undefined (void) without throwing
    expect(result).toBeUndefined();
  });

  it('throws an error when deleting an edge that does not exist', async () => {
    /**
     * Verifies that deleteEdge() throws when the target edge id does not exist
     * in the database (server returns 404).
     *
     * Same contract as deleteNode — the LLM must receive a clear error signal
     * rather than a silent success on a 404.
     *
     * If this contract breaks, the MCP tool reports success even when no edge
     * was removed, corrupting the LLM's model of canvas state.
     */
    // GIVEN a nonexistent edge id

    // WHEN attempting to delete it
    // THEN an Error containing the status is thrown
    await expect(deleteEdge('nonexistent-edge-id')).rejects.toThrow(/404/);
  });
});

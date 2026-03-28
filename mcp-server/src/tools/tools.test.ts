/**
 * Integration tests for MCP tool handlers.
 *
 * These tests spin up a real Express server backed by an in-memory SQLite DB
 * and invoke the tool handler functions directly (bypassing the MCP protocol
 * layer) to verify that each handler calls the correct canvas-api functions,
 * builds the correct response shape, and handles errors correctly.
 *
 * Why real server: tool handlers call canvas-api.ts which makes real HTTP
 * requests. Mocking fetch would only test call patterns, not the full
 * request/response contract. The integration tests here prove the tools
 * actually work against the real API.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { createApp } from '../../../server/src/server.js';

// ─── Schema (mirrors server/src/db.ts) ──────────────────────────────────────

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
  testDb = new Database(':memory:');
  testDb.exec(SCHEMA);
  const app = createApp(testDb);

  await new Promise<void>((resolve) => {
    httpServer = app.listen(3001, '127.0.0.1', () => resolve());
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    httpServer.close((err) => (err ? reject(err) : resolve()));
  });
});

// Import tool handlers — canvas-api.ts hardcodes localhost:3001
import { handleGetCanvas } from './get-canvas.js';
import { handleSearchNodes } from './search-nodes.js';
import { handleCreateNode } from './create-node.js';
import { handleCreateNodes } from './create-nodes.js';
import { handleUpdateNode } from './update-node.js';
import { handleDeleteNode } from './delete-node.js';
import { handleCreateEdge } from './create-edge.js';
import { handleDeleteEdge } from './delete-edge.js';

// ─── get_canvas ──────────────────────────────────────────────────────────────

describe('handleGetCanvas', () => {
  it('returns a hierarchical JSON structure with roots and edges arrays', async () => {
    /**
     * Verifies that get_canvas fetches nodes + edges and returns a nested
     * hierarchy where children are embedded under their parent root nodes.
     *
     * This matters because the LLM uses get_canvas to understand the full
     * canvas structure at a glance. A flat list would require the LLM to
     * manually group nodes, which is error-prone and adds cognitive load.
     *
     * If this contract breaks, the LLM receives a flat or malformed structure
     * and cannot accurately describe or modify the canvas hierarchy.
     */
    // GIVEN an empty canvas
    // WHEN calling get_canvas
    const result = await handleGetCanvas();

    // THEN the response is a JSON string with roots and edges arrays
    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed.roots)).toBe(true);
    expect(Array.isArray(parsed.edges)).toBe(true);
  });

  it('nests child nodes under their parent root in the hierarchy', async () => {
    /**
     * Verifies that child nodes (those with a parent_id) are nested under
     * their parent's "children" array rather than appearing as root nodes.
     *
     * This matters because the hierarchical view is the primary way the LLM
     * navigates the canvas. If children appear as root nodes, the LLM cannot
     * understand or reproduce the parent-child structure.
     *
     * If this contract breaks, all nodes appear as roots and the tree structure
     * is lost — the LLM cannot distinguish top-level concepts from sub-topics.
     */
    // GIVEN a parent node and a child node with parent_id set
    const { createNode } = await import('../canvas-api.js');
    const parent = await createNode({ title: 'Parent Node', x: 0, y: 0 });
    await createNode({ title: 'Child Node', parent_id: parent.id, x: 10, y: 10 });

    // WHEN calling get_canvas
    const result = await handleGetCanvas();

    // THEN the parent appears as a root and the child is nested under it
    const parsed = JSON.parse(result.content[0].text);
    const parentRoot = parsed.roots.find((r: { id: string }) => r.id === parent.id);
    expect(parentRoot).toBeDefined();
    expect(Array.isArray(parentRoot.children)).toBe(true);
    expect(parentRoot.children.some((c: { title: string }) => c.title === 'Child Node')).toBe(true);
  });
});

// ─── search_nodes ────────────────────────────────────────────────────────────

describe('handleSearchNodes', () => {
  it('returns nodes matching the query in title (case-insensitive)', async () => {
    /**
     * Verifies that search_nodes filters nodes whose title contains the query
     * string, regardless of case.
     *
     * This matters because the LLM uses search to locate specific nodes before
     * performing updates. Case-sensitive search would miss nodes where the LLM
     * guesses a different capitalization.
     *
     * If this contract breaks, the LLM cannot find nodes it knows exist,
     * leading to duplicate creation or failed updates.
     */
    // GIVEN a node with a known title
    const { createNode } = await import('../canvas-api.js');
    await createNode({ title: 'SearchableNode UniqueXYZ', x: 0, y: 0 });

    // WHEN searching with lowercase query matching part of the title
    const result = await handleSearchNodes({ query: 'searchablenode uniquexyz' });

    // THEN the matching node is returned
    const matches = JSON.parse(result.content[0].text);
    expect(Array.isArray(matches)).toBe(true);
    expect(matches.some((n: { title: string }) => n.title === 'SearchableNode UniqueXYZ')).toBe(true);
  });

  it('returns nodes matching the query in notes (case-insensitive)', async () => {
    /**
     * Verifies that search_nodes also searches through node notes, not just titles.
     *
     * This matters because nodes often carry detailed information in their notes
     * field. Searching only titles would miss nodes where the relevant term
     * appears in the body.
     *
     * If this contract breaks, the LLM cannot locate nodes by their content,
     * only by their titles — severely limiting search utility.
     */
    // GIVEN a node with a unique string in its notes
    const { createNode } = await import('../canvas-api.js');
    await createNode({ title: 'Plain Title', notes: 'UniqueNotesToken987', x: 0, y: 0 });

    // WHEN searching for the notes token
    const result = await handleSearchNodes({ query: 'uniquenotestoken987' });

    // THEN the node is found
    const matches = JSON.parse(result.content[0].text);
    expect(matches.some((n: { notes: string }) => n.notes === 'UniqueNotesToken987')).toBe(true);
  });

  it('returns an empty array when no nodes match the query', async () => {
    /**
     * Verifies that search_nodes returns [] when no nodes match the query,
     * rather than throwing or returning null/undefined.
     *
     * This matters because the LLM must handle empty search results gracefully.
     * An error or null return would cause downstream tool calls to fail.
     *
     * If this contract breaks, the LLM receives an error on an empty search
     * and cannot determine whether the canvas is empty or the query was wrong.
     */
    // GIVEN a query that matches nothing
    // WHEN searching
    const result = await handleSearchNodes({ query: 'zzz-no-match-ever-zzz' });

    // THEN an empty array is returned
    const matches = JSON.parse(result.content[0].text);
    expect(matches).toEqual([]);
  });
});

// ─── create_node ─────────────────────────────────────────────────────────────

describe('handleCreateNode', () => {
  it('creates a node and returns the created node as JSON', async () => {
    /**
     * Verifies that create_node POSTs to the API and returns the created node
     * including its server-assigned id.
     *
     * This matters because the LLM needs the returned id to reference the node
     * in subsequent operations (creating edges, updating, deleting).
     *
     * If this contract breaks, the LLM cannot chain operations after node
     * creation, forcing it to call get_canvas to find the id it just created.
     */
    // GIVEN a title and optional fields
    // WHEN creating a node
    const result = await handleCreateNode({ title: 'Tool Created Node', notes: 'test notes' });

    // THEN the created node is returned as JSON with an id
    expect(result.isError).toBeFalsy();
    const node = JSON.parse(result.content[0].text);
    expect(typeof node.id).toBe('string');
    expect(node.title).toBe('Tool Created Node');
    expect(node.notes).toBe('test notes');
  });

  it('returns an error response when title is missing', async () => {
    /**
     * Verifies that create_node returns isError: true when the API rejects
     * the request (e.g., empty title → 422 from server).
     *
     * This matters because the LLM must receive a clear error signal when its
     * input is invalid, not a silent failure or thrown exception that crashes
     * the MCP session.
     *
     * If this contract breaks, invalid inputs cause unhandled exceptions and
     * the MCP session terminates rather than reporting the error gracefully.
     */
    // GIVEN no title (empty string is invalid)
    // WHEN attempting to create
    const result = await handleCreateNode({ title: '' });

    // THEN isError is true and the error message is in the content
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/422|failed/i);
  });
});

// ─── create_nodes ────────────────────────────────────────────────────────────

describe('handleCreateNodes', () => {
  it('creates multiple nodes atomically and returns all created nodes', async () => {
    /**
     * Verifies that create_nodes bulk-creates nodes with client-supplied IDs
     * and returns the full list of created nodes.
     *
     * This matters because the organize-canvas skill creates entire subtrees
     * in one call to ensure atomicity. Returning only a count or subset would
     * prevent the skill from verifying all nodes were created.
     *
     * If this contract breaks, partial canvas states are created silently,
     * producing orphaned nodes or incomplete hierarchies.
     */
    // GIVEN two nodes with client-supplied IDs
    const nodes = [
      { id: 'tool-bulk-1', title: 'Bulk Tool Node A', x: 0, y: 0 },
      { id: 'tool-bulk-2', title: 'Bulk Tool Node B', x: 100, y: 0 },
    ];

    // WHEN creating them via create_nodes
    const result = await handleCreateNodes({ nodes });

    // THEN both nodes are returned
    expect(result.isError).toBeFalsy();
    const created = JSON.parse(result.content[0].text);
    expect(Array.isArray(created)).toBe(true);
    expect(created).toHaveLength(2);
    const ids = created.map((n: { id: string }) => n.id);
    expect(ids).toContain('tool-bulk-1');
    expect(ids).toContain('tool-bulk-2');
  });
});

// ─── update_node ─────────────────────────────────────────────────────────────

describe('handleUpdateNode', () => {
  it('patches the node and returns the updated node as JSON', async () => {
    /**
     * Verifies that update_node PATCHes the specified fields on an existing
     * node and returns the complete updated node.
     *
     * This matters because the LLM uses update_node to rename, reposition,
     * and restyle nodes. The returned node confirms the change was applied.
     *
     * If this contract breaks, the LLM cannot verify updates were applied and
     * may repeatedly attempt the same update, producing duplicate requests.
     */
    // GIVEN an existing node
    const { createNode } = await import('../canvas-api.js');
    const node = await createNode({ title: 'Before Tool Update' });

    // WHEN updating via the tool handler
    const result = await handleUpdateNode({ id: node.id, title: 'After Tool Update' });

    // THEN the updated node is returned
    expect(result.isError).toBeFalsy();
    const updated = JSON.parse(result.content[0].text);
    expect(updated.title).toBe('After Tool Update');
    expect(updated.id).toBe(node.id);
  });

  it('returns an error response when the node does not exist', async () => {
    /**
     * Verifies that update_node returns isError: true when the target node
     * id does not exist (404 from API).
     *
     * This matters so the LLM knows its update had no effect and can correct
     * the id before retrying.
     *
     * If this contract breaks, the LLM believes the update succeeded when it
     * did not, producing stale assumptions about canvas state.
     */
    // GIVEN a nonexistent node id
    // WHEN updating
    const result = await handleUpdateNode({ id: 'nonexistent-tool-id', title: 'X' });

    // THEN isError is true
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/404|failed/i);
  });
});

// ─── delete_node ─────────────────────────────────────────────────────────────

describe('handleDeleteNode', () => {
  it('deletes a node and returns a confirmation message', async () => {
    /**
     * Verifies that delete_node sends DELETE /nodes/:id and returns a
     * human-readable confirmation string on success.
     *
     * This matters because the LLM presents confirmation to the user. An
     * empty or JSON response would not clearly communicate success.
     *
     * If this contract breaks, the LLM cannot confirm deletion to the user
     * and may report the operation as failed even though it succeeded.
     */
    // GIVEN an existing node
    const { createNode } = await import('../canvas-api.js');
    const node = await createNode({ title: 'Tool Delete Me' });

    // WHEN deleting via the tool handler
    const result = await handleDeleteNode({ id: node.id });

    // THEN a confirmation text is returned
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toMatch(/deleted/i);
  });

  it('returns an error response when the node does not exist', async () => {
    /**
     * Verifies that delete_node returns isError: true when the target node
     * does not exist (404 from API).
     *
     * Same contract as update_node error handling — the LLM must know whether
     * the operation succeeded to maintain an accurate model of canvas state.
     *
     * If this contract breaks, the LLM believes a non-existent node was
     * deleted, which is misleading but less harmful than the reverse case.
     */
    // GIVEN a nonexistent node id
    // WHEN deleting
    const result = await handleDeleteNode({ id: 'nonexistent-delete-id' });

    // THEN isError is true
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/404|failed/i);
  });
});

// ─── create_edge ─────────────────────────────────────────────────────────────

describe('handleCreateEdge', () => {
  it('creates an edge and returns the created edge as JSON', async () => {
    /**
     * Verifies that create_edge POSTs to /edges and returns the created edge
     * with source_id, target_id, and server-assigned id.
     *
     * This matters because the LLM wires up relationships between nodes using
     * create_edge. The returned id is needed for subsequent deleteEdge calls.
     *
     * If this contract breaks, the LLM cannot chain create_edge → delete_edge
     * operations, and cannot verify the edge was persisted.
     */
    // GIVEN two existing nodes
    const { createNode } = await import('../canvas-api.js');
    const src = await createNode({ title: 'Edge Tool Src' });
    const tgt = await createNode({ title: 'Edge Tool Tgt' });

    // WHEN creating an edge between them
    const result = await handleCreateEdge({ source_id: src.id, target_id: tgt.id });

    // THEN the created edge is returned as JSON
    expect(result.isError).toBeFalsy();
    const edge = JSON.parse(result.content[0].text);
    expect(typeof edge.id).toBe('string');
    expect(edge.source_id).toBe(src.id);
    expect(edge.target_id).toBe(tgt.id);
  });
});

// ─── delete_edge ─────────────────────────────────────────────────────────────

describe('handleDeleteEdge', () => {
  it('deletes an edge and returns a confirmation message', async () => {
    /**
     * Verifies that delete_edge sends DELETE /edges/:id and returns a
     * human-readable confirmation string on success.
     *
     * This matters so the LLM can confirm to the user that the connection
     * between nodes was removed.
     *
     * If this contract breaks, the LLM cannot confirm edge deletion and may
     * leave the user uncertain about whether relationships were removed.
     */
    // GIVEN two nodes and an edge between them
    const { createNode, createEdge } = await import('../canvas-api.js');
    const src = await createNode({ title: 'Del Edge Tool Src' });
    const tgt = await createNode({ title: 'Del Edge Tool Tgt' });
    const edge = await createEdge({ source_id: src.id, target_id: tgt.id });

    // WHEN deleting via the tool handler
    const result = await handleDeleteEdge({ id: edge.id });

    // THEN a confirmation text is returned
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toMatch(/deleted/i);
  });

  it('returns an error response when the edge does not exist', async () => {
    /**
     * Verifies that delete_edge returns isError: true when the target edge
     * does not exist (404 from API).
     *
     * Same contract as delete_node — the LLM must know whether the delete
     * had any effect to reason correctly about canvas state.
     *
     * If this contract breaks, the LLM believes a non-existent edge was
     * removed and its model of connections becomes incorrect.
     */
    // GIVEN a nonexistent edge id
    // WHEN deleting
    const result = await handleDeleteEdge({ id: 'nonexistent-edge-tool-id' });

    // THEN isError is true
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/404|failed/i);
  });
});

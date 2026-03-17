import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';
import { makeEdgesRouter } from './edges';
import { makeNodesRouter } from './nodes';

/**
 * Build an isolated Express app backed by a fresh in-memory SQLite database.
 * Each test gets its own DB instance so tests never share state.
 */
function buildTestApp() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      parent_id TEXT REFERENCES nodes(id),
      title TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      x REAL NOT NULL DEFAULT 0,
      y REAL NOT NULL DEFAULT 0,
      collapsed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS edges (
      id TEXT PRIMARY KEY,
      source_id TEXT,
      target_id TEXT,
      label TEXT,
      created_at TEXT NOT NULL
    );
  `);

  const app = express();
  app.use(express.json());
  app.use('/nodes', makeNodesRouter(db));
  app.use('/edges', makeEdgesRouter(db));
  return { app, db };
}

describe('GET /edges', () => {
  it('returns_empty_array_when_no_edges_exist', async () => {
    /**
     * Verifies that GET /edges returns an empty array when the edges table is empty.
     *
     * This matters because callers rely on a consistent array type regardless of
     * whether data exists — a null/undefined response would cause runtime errors
     * in consuming code that maps over the result.
     *
     * If this contract breaks, the client canvas would crash on mount when there
     * are no edges to display.
     */
    const { app } = buildTestApp();
    const res = await request(app).get('/edges');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns_all_persisted_edges', async () => {
    /**
     * Verifies that GET /edges returns all edges that have been inserted,
     * including their id, source_id, target_id, label, and created_at fields.
     *
     * This matters because the React Flow canvas reconstructs its edge state
     * entirely from this endpoint on every page load — missing or incomplete
     * rows would result in invisible connections between nodes.
     *
     * If this contract breaks, edges drawn by the user would disappear on
     * reload even though they were persisted to the DB.
     */
    const { app, db } = buildTestApp();
    const now = new Date().toISOString();
    // Insert two nodes to reference
    db.prepare(
      `INSERT INTO nodes (id, title, x, y, created_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)`
    ).run('node-1', 'A', now, now);
    db.prepare(
      `INSERT INTO nodes (id, title, x, y, created_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)`
    ).run('node-2', 'B', now, now);
    db.prepare(
      `INSERT INTO edges (id, source_id, target_id, label, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run('edge-1', 'node-1', 'node-2', 'my-label', now);

    const res = await request(app).get('/edges');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: 'edge-1',
      source_id: 'node-1',
      target_id: 'node-2',
      label: 'my-label',
    });
  });
});

describe('POST /edges', () => {
  it('creates_edge_and_returns_201_with_new_row', async () => {
    /**
     * Verifies that POSTing valid source_id and target_id creates a new edge
     * row and returns it as JSON with HTTP 201.
     *
     * This matters because the UI creates edges when the user drags from one
     * node handle to another — the response provides the server-assigned ID
     * that the client stores in React Flow state for later deletion.
     *
     * If this contract breaks, drawn edges would have no stable ID and could
     * not be deleted via the API, causing phantom edges that reappear on reload.
     */
    const { app, db } = buildTestApp();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO nodes (id, title, x, y, created_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)`
    ).run('src-node', 'Source', now, now);
    db.prepare(
      `INSERT INTO nodes (id, title, x, y, created_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)`
    ).run('tgt-node', 'Target', now, now);

    const res = await request(app)
      .post('/edges')
      .send({ source_id: 'src-node', target_id: 'tgt-node' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      source_id: 'src-node',
      target_id: 'tgt-node',
    });
    expect(typeof res.body.id).toBe('string');
    expect(res.body.id.length).toBeGreaterThan(0);
  });

  it('creates_edge_with_optional_label', async () => {
    /**
     * Verifies that an optional label field is persisted when provided in the
     * POST body and returned in the response.
     *
     * This matters because edge labels are a core display feature (arrows can
     * carry textual meaning) and must round-trip through the API faithfully.
     *
     * If this contract breaks, edge labels set by the user would be silently
     * dropped, making labeled connections indistinguishable from unlabeled ones.
     */
    const { app, db } = buildTestApp();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO nodes (id, title, x, y, created_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)`
    ).run('n1', 'N1', now, now);
    db.prepare(
      `INSERT INTO nodes (id, title, x, y, created_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)`
    ).run('n2', 'N2', now, now);

    const res = await request(app)
      .post('/edges')
      .send({ source_id: 'n1', target_id: 'n2', label: 'calls' });

    expect(res.status).toBe(201);
    expect(res.body.label).toBe('calls');
  });

  it('returns_422_when_source_id_does_not_exist', async () => {
    /**
     * Verifies that POSTing an edge whose source_id references a non-existent
     * node returns HTTP 422 (Unprocessable Entity).
     *
     * This matters because dangling edge references would cause React Flow to
     * render edges with no visible source handle, silently breaking the graph.
     *
     * If this contract breaks, invalid edges can be inserted into the DB and
     * would appear as orphaned connections that cannot be cleaned up.
     */
    const { app, db } = buildTestApp();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO nodes (id, title, x, y, created_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)`
    ).run('real-node', 'Real', now, now);

    const res = await request(app)
      .post('/edges')
      .send({ source_id: 'nonexistent', target_id: 'real-node' });

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error');
  });

  it('returns_422_when_target_id_does_not_exist', async () => {
    /**
     * Verifies that POSTing an edge whose target_id references a non-existent
     * node returns HTTP 422 (Unprocessable Entity).
     *
     * This is symmetric to the source_id check — both endpoints of an edge
     * must refer to real nodes to preserve graph integrity.
     *
     * If this contract breaks, edges pointing to deleted or never-created nodes
     * would be persisted and would appear as broken arrows after reload.
     */
    const { app, db } = buildTestApp();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO nodes (id, title, x, y, created_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)`
    ).run('real-node', 'Real', now, now);

    const res = await request(app)
      .post('/edges')
      .send({ source_id: 'real-node', target_id: 'nonexistent' });

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error');
  });

  it('returns_422_when_source_id_is_missing', async () => {
    /**
     * Verifies that POSTing without a source_id returns 422.
     *
     * This matters because source_id is a required field — accepting a request
     * without it would insert a NULL source into the DB, making the edge
     * unrenderable by React Flow.
     *
     * If this contract breaks, the UI could accidentally submit malformed
     * payloads that corrupt the graph state.
     */
    const { app, db } = buildTestApp();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO nodes (id, title, x, y, created_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)`
    ).run('n1', 'N1', now, now);

    const res = await request(app)
      .post('/edges')
      .send({ target_id: 'n1' });

    expect(res.status).toBe(422);
  });

  it('returns_422_when_target_id_is_missing', async () => {
    /**
     * Verifies that POSTing without a target_id returns 422.
     *
     * Symmetric to missing source_id — both fields are mandatory for an edge
     * to be meaningful in the graph.
     *
     * If this contract breaks, edges with a NULL target would be stored,
     * breaking React Flow's edge rendering on reload.
     */
    const { app, db } = buildTestApp();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO nodes (id, title, x, y, created_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)`
    ).run('n1', 'N1', now, now);

    const res = await request(app)
      .post('/edges')
      .send({ source_id: 'n1' });

    expect(res.status).toBe(422);
  });
});

describe('DELETE /edges/:id', () => {
  it('deletes_existing_edge_and_returns_204', async () => {
    /**
     * Verifies that DELETE /edges/:id removes the edge from the database and
     * returns HTTP 204 No Content.
     *
     * This matters because edge deletion is the mechanism for cleaning up
     * connections the user no longer wants — if the row remains in the DB
     * after deletion, the edge would reappear on the next page reload.
     *
     * If this contract breaks, deleted edges accumulate in the DB and are
     * re-rendered each time the canvas loads, confusing the user.
     */
    const { app, db } = buildTestApp();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO nodes (id, title, x, y, created_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)`
    ).run('n1', 'N1', now, now);
    db.prepare(
      `INSERT INTO nodes (id, title, x, y, created_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)`
    ).run('n2', 'N2', now, now);
    db.prepare(
      `INSERT INTO edges (id, source_id, target_id, label, created_at) VALUES (?, ?, ?, NULL, ?)`
    ).run('e1', 'n1', 'n2', now);

    const res = await request(app).delete('/edges/e1');
    expect(res.status).toBe(204);

    const remaining = db.prepare('SELECT * FROM edges WHERE id = ?').get('e1');
    expect(remaining).toBeUndefined();
  });

  it('returns_404_when_edge_does_not_exist', async () => {
    /**
     * Verifies that DELETE /edges/:id returns 404 when the requested edge ID
     * does not exist in the database.
     *
     * This matters because the client may attempt to delete an edge that was
     * already removed (e.g., due to a node cascade delete). Without a 404,
     * there is no way to distinguish a successful delete from an invalid request.
     *
     * If this contract breaks, double-delete requests silently succeed, masking
     * bugs in client-side state management where edges are deleted twice.
     */
    const { app } = buildTestApp();
    const res = await request(app).delete('/edges/nonexistent-id');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('edge_is_no_longer_returned_by_get_edges_after_deletion', async () => {
    /**
     * Verifies end-to-end that an edge deleted via DELETE is no longer visible
     * through GET /edges on the same database.
     *
     * This matters because the canvas fetches all edges on load — if a deleted
     * edge still appears in GET /edges, it will be re-rendered, contradicting
     * the user's intent.
     *
     * If this contract breaks, users see "ghost" edges reappear every time
     * they reload the page after deleting a connection.
     */
    const { app, db } = buildTestApp();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO nodes (id, title, x, y, created_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)`
    ).run('n1', 'N1', now, now);
    db.prepare(
      `INSERT INTO nodes (id, title, x, y, created_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)`
    ).run('n2', 'N2', now, now);
    db.prepare(
      `INSERT INTO edges (id, source_id, target_id, label, created_at) VALUES (?, ?, ?, NULL, ?)`
    ).run('e1', 'n1', 'n2', now);

    await request(app).delete('/edges/e1');

    const res = await request(app).get('/edges');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});

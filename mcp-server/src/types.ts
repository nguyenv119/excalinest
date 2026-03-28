// ─── Canvas Types ────────────────────────────────────────────────────────────
// Mirrors the DB schema from server/src/db.ts and the client interfaces in
// client/src/api.ts. Named CanvasNode (not CanvasNodeData) since this is the
// MCP server's own type namespace.

export interface CanvasNode {
  id: string;
  parent_id: string | null;
  title: string;
  notes: string;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  collapsed: 0 | 1;
  border_color: string | null;
  bg_color: string | null;
  border_width: string | null;
  border_style: string | null;
  font_size: string | null;
  font_color: string | null;
  created_at: string;
  updated_at: string;
}

export interface CanvasEdge {
  id: string;
  source_id: string;
  target_id: string;
  source_handle: string | null;
  target_handle: string | null;
  label: string | null;
  stroke_color: string | null;
  stroke_width: string | null;
  stroke_style: string | null;
  created_at: string;
}

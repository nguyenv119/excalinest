// ─── Color Families ──────────────────────────────────────────────────────────
// These values MUST match .claude/skills/organize-canvas/SKILL.md exactly.
// The organize-canvas skill and get_color_palette MCP tool both depend on
// this as the single source of truth for canvas color semantics.

export interface ColorFamily {
  name: string;
  parent_bg: string;
  child_bg: string;
  border: string;
  font: string;
}

export const COLOR_FAMILIES: ColorFamily[] = [
  { name: "Indigo",  parent_bg: "#ECEFFE", child_bg: "#F6F7FF", border: "#6366F1", font: "#312E81" },
  { name: "Purple",  parent_bg: "#F0EBFE", child_bg: "#F8F6FF", border: "#8B5CF6", font: "#4C1D95" },
  { name: "Teal",    parent_bg: "#DFFBF4", child_bg: "#F0FDF9", border: "#0D9488", font: "#134E4A" },
  { name: "Amber",   parent_bg: "#FEF3E2", child_bg: "#FFFAF2", border: "#D97706", font: "#78350F" },
  { name: "Rose",    parent_bg: "#FDE8EE", child_bg: "#FFF1F5", border: "#E11D48", font: "#881337" },
  { name: "Green",   parent_bg: "#E9FAE7", child_bg: "#F3FDF2", border: "#16A34A", font: "#14532D" },
  { name: "Cyan",    parent_bg: "#DDF6FD", child_bg: "#EEFAFD", border: "#0891B2", font: "#164E63" },
  { name: "Slate",   parent_bg: "#E9EEF2", child_bg: "#F3F6F8", border: "#475569", font: "#1E293B" },
  { name: "Orange",  parent_bg: "#FDEAD7", child_bg: "#FFF4ED", border: "#EA580C", font: "#7C2D12" },
  { name: "Blue",    parent_bg: "#DBEAFE", child_bg: "#EFF6FF", border: "#2563EB", font: "#1E3A8A" },
  { name: "Gold",    parent_bg: "#FEEFC6", child_bg: "#FFFBEB", border: "#CA8A04", font: "#713F12" },
  { name: "Emerald", parent_bg: "#BBF7D0", child_bg: "#DCFCE7", border: "#15803D", font: "#14532D" },
  { name: "Fuchsia", parent_bg: "#FAE8FF", child_bg: "#FDF4FF", border: "#C026D3", font: "#701A75" },
  { name: "Sky",     parent_bg: "#E0F2FE", child_bg: "#F0F9FF", border: "#0284C7", font: "#0C4A6E" },
  { name: "Warm",    parent_bg: "#F2ECE6", child_bg: "#FAF7F4", border: "#A16207", font: "#713F12" },
];

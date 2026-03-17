// ─── Style constants ──────────────────────────────────────────────────────────

const STROKE_COLORS = [
  { id: 'default', label: 'Default', color: null, display: 'transparent', border: 'rgba(255,255,255,0.15)' },
  { id: 'dark', label: 'Dark', color: '#1a1a1a', display: '#1a1a1a', border: null },
  { id: 'red', label: 'Red', color: '#ef4444', display: '#ef4444', border: null },
  { id: 'green', label: 'Green', color: '#22c55e', display: '#22c55e', border: null },
  { id: 'blue', label: 'Blue', color: '#3b82f6', display: '#3b82f6', border: null },
  { id: 'orange', label: 'Orange', color: '#f97316', display: '#f97316', border: null },
];

const STROKE_WIDTHS = [
  { id: 'thin', label: '—', title: 'Thin' },
  { id: 'medium', label: '–', title: 'Medium' },
  { id: 'thick', label: '━', title: 'Thick' },
];

const STROKE_STYLES = [
  { id: 'solid', label: '—', title: 'Solid' },
  { id: 'dashed', label: '╌', title: 'Dashed' },
  { id: 'dotted', label: '···', title: 'Dotted' },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface EdgeDetailPanelProps {
  edgeId: string | null;
  edgeStyle: { stroke_color: string | null; stroke_width: string | null; stroke_style: string | null } | null;
  onUpdate: (id: string, patch: { stroke_color?: string | null; stroke_width?: string | null; stroke_style?: string | null }) => void;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EdgeDetailPanel({ edgeId, edgeStyle, onUpdate, onClose }: EdgeDetailPanelProps) {
  if (!edgeId || !edgeStyle) return null;

  const handleStrokeColor = (color: string | null) => {
    onUpdate(edgeId, { stroke_color: color });
  };

  const handleStrokeWidth = (width: string) => {
    const next = edgeStyle.stroke_width === width ? null : width;
    onUpdate(edgeId, { stroke_width: next });
  };

  const handleStrokeStyle = (style: string) => {
    const next = edgeStyle.stroke_style === style ? null : style;
    onUpdate(edgeId, { stroke_style: next });
  };

  return (
    <div className="kc-panel" data-testid="edge-detail-panel">
      <div className="kc-panel__header">
        <span className="kc-panel__title">Edge Detail</span>
        <button
          className="kc-panel__close"
          onClick={onClose}
          aria-label="Close edge panel"
        >
          &#x2715;
        </button>
      </div>

      <div className="kc-panel__body">
        <div className="kc-panel__field">
          <span className="kc-panel__label">Style</span>

          <div className="kc-style-row">
            <span className="kc-style-row__label">Stroke</span>
            <div className="kc-style-swatches" data-testid="edge-stroke-swatches">
              {STROKE_COLORS.map((s) => (
                <button
                  key={s.id}
                  data-testid={`edge-stroke-swatch-${s.id}`}
                  className={`kc-swatch${edgeStyle.stroke_color === s.color ? ' kc-swatch--active' : ''}`}
                  title={s.label}
                  onClick={() => handleStrokeColor(s.color)}
                  style={{
                    background: s.display,
                    borderColor: s.border ?? s.display,
                  }}
                />
              ))}
            </div>
          </div>

          <div className="kc-style-row">
            <span className="kc-style-row__label">Width</span>
            <div className="kc-style-toggles" data-testid="edge-stroke-width-toggles">
              {STROKE_WIDTHS.map((w) => (
                <button
                  key={w.id}
                  data-testid={`edge-stroke-width-${w.id}`}
                  className={`kc-style-toggle${edgeStyle.stroke_width === w.id ? ' kc-style-toggle--active' : ''}`}
                  title={w.title}
                  onClick={() => handleStrokeWidth(w.id)}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>

          <div className="kc-style-row">
            <span className="kc-style-row__label">Line</span>
            <div className="kc-style-toggles" data-testid="edge-stroke-style-toggles">
              {STROKE_STYLES.map((s) => (
                <button
                  key={s.id}
                  data-testid={`edge-stroke-style-${s.id}`}
                  className={`kc-style-toggle${edgeStyle.stroke_style === s.id ? ' kc-style-toggle--active' : ''}`}
                  title={s.title}
                  onClick={() => handleStrokeStyle(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

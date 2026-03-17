export interface ToolbarProps {
  onAddNode: () => void;
}

export function Toolbar({ onAddNode }: ToolbarProps) {
  return (
    <div className="kc-toolbar">
      <button
        className="kc-toolbar__btn"
        onClick={onAddNode}
        type="button"
        aria-label="Add node"
      >
        <span className="kc-toolbar__btn-icon" aria-hidden="true">+</span>
        <span className="kc-toolbar__btn-label">Add Node</span>
      </button>
    </div>
  );
}

export default Toolbar;

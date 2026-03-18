import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NodeDetailPanel } from './components/NodeDetailPanel';
import type { CanvasNodeType } from './components/CanvasNode';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<CanvasNodeType['data']> = {}): CanvasNodeType {
  return {
    id: 'n1',
    type: 'canvasNode',
    position: { x: 0, y: 0 },
    data: {
      title: 'Test Node',
      notes: 'Some **markdown** notes',
      hasChildren: false,
      collapsed: false,
      onToggleCollapse: vi.fn(),
      onAddChild: vi.fn(),
      onNodeResized: vi.fn(),
      borderColor: null,
      bgColor: null,
      borderWidth: null,
      borderStyle: null,
      fontColor: null,
      fontSize: null,
      ...overrides,
    },
  };
}

function makeHandlers() {
  return {
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
  };
}

// ─── Tests: isEditing state machine ───────────────────────────────────────────

describe('NodeDetailPanel — isEditing state machine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults_to_preview_mode_when_node_is_selected', () => {
    /**
     * Verifies that NodeDetailPanel renders in preview mode (ReactMarkdown)
     * by default when a node is first selected, without any user interaction.
     *
     * Why: The KC-2 feature adds markdown preview as the default notes view.
     * Users should see rendered markdown immediately on node selection, not a
     * raw textarea. The Edit button provides access to the raw text when needed.
     *
     * What breaks: On node selection, users see a raw textarea instead of
     * rendered markdown, requiring an extra click to get to preview — the
     * opposite of the intended UX.
     */
    // GIVEN a node with notes
    const node = makeNode({ notes: 'Some **markdown** notes' });
    const handlers = makeHandlers();

    // WHEN NodeDetailPanel renders with the node
    render(<NodeDetailPanel node={node} {...handlers} />);

    // THEN the textarea is NOT visible (preview mode, not edit mode)
    expect(screen.queryByRole('textbox', { name: /notes/i })).toBeNull();
    // AND the "Edit" button is shown (not "Preview")
    expect(screen.getByRole('button', { name: 'Edit' })).not.toBeNull();
  });

  it('edit_button_switches_to_edit_mode_showing_textarea', () => {
    /**
     * Verifies that clicking the "Edit" button switches the notes field from
     * preview mode (ReactMarkdown div) to edit mode (textarea).
     *
     * Why: Users need to edit their notes. The Edit button is the affordance
     * for entering edit mode. If clicking it does not show the textarea, users
     * cannot modify notes at all.
     *
     * What breaks: Clicking "Edit" has no effect — the panel stays in preview
     * mode and the user cannot edit their notes.
     */
    // GIVEN NodeDetailPanel renders in default preview mode
    const node = makeNode({ notes: 'Hello world' });
    const handlers = makeHandlers();
    render(<NodeDetailPanel node={node} {...handlers} />);

    // WHEN the "Edit" button is clicked
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    // THEN the textarea is now visible
    expect(screen.getByRole('textbox', { name: /notes/i })).not.toBeNull();
    // AND the mode toggle now shows "Preview"
    expect(screen.getByRole('button', { name: 'Preview' })).not.toBeNull();
  });

  it('preview_button_switches_back_to_preview_mode', () => {
    /**
     * Verifies that clicking the "Preview" button (visible in edit mode)
     * switches back to markdown preview mode, hiding the textarea.
     *
     * Why: The Edit/Preview toggle must be bidirectional so users can switch
     * back to rendered markdown after editing. Without the ability to return
     * to preview, the toggle is a one-way trap into raw text mode.
     *
     * What breaks: After clicking "Edit", there is no way to return to the
     * markdown preview — users are stuck in raw textarea mode for the session.
     */
    // GIVEN NodeDetailPanel is in edit mode (after clicking "Edit")
    const node = makeNode({ notes: 'Hello world' });
    const handlers = makeHandlers();
    render(<NodeDetailPanel node={node} {...handlers} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('textbox', { name: /notes/i })).not.toBeNull();

    // WHEN the "Preview" button is clicked
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    // THEN the textarea is hidden again
    expect(screen.queryByRole('textbox', { name: /notes/i })).toBeNull();
    // AND the "Edit" button is shown again
    expect(screen.getByRole('button', { name: 'Edit' })).not.toBeNull();
  });

  it('switching_to_a_different_node_resets_to_preview_mode', () => {
    /**
     * Verifies that when the selected node changes (a different node is passed
     * as the `node` prop), the panel resets to preview mode even if the user
     * was previously in edit mode.
     *
     * Why: The edit mode is per-selection session. When the user clicks a
     * different node, they should see its markdown preview immediately without
     * carrying over the edit state from the previous node. Leaving edit mode
     * visible for a new node would confuse the user about which node they're
     * editing.
     *
     * What breaks: After editing one node and clicking a different node, the
     * new node's panel opens in edit mode instead of preview — the user sees
     * a textarea for the new node before choosing to edit.
     */
    // GIVEN NodeDetailPanel is in edit mode on node n1
    const node1 = makeNode({ notes: 'Notes for node 1' });
    const node2: CanvasNodeType = { ...makeNode({ notes: 'Notes for node 2' }), id: 'n2' };
    const handlers = makeHandlers();
    const { rerender } = render(<NodeDetailPanel node={node1} {...handlers} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('textbox', { name: /notes/i })).not.toBeNull();

    // WHEN a different node is selected (prop changes to node2)
    rerender(<NodeDetailPanel node={node2} {...handlers} />);

    // THEN the panel resets to preview mode
    expect(screen.queryByRole('textbox', { name: /notes/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit' })).not.toBeNull();
  });
});

// ─── Tests: font-size toggle ───────────────────────────────────────────────────

describe('NodeDetailPanel — font-size toggle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clicking_font_size_toggle_calls_onUpdate_with_selected_size', () => {
    /**
     * Verifies that clicking a font size toggle button (S/M/L) immediately
     * calls onUpdate with the corresponding font_size token.
     *
     * Why: Font size is a style property stored as a semantic token in the DB.
     * The toggle must fire onUpdate (which persists via patchNode) immediately
     * so the size selection takes effect without requiring any other action.
     *
     * What breaks: Clicking S/M/L appears to do nothing — the font_size is
     * never sent to the server, so the size selection is lost on page reload.
     */
    // GIVEN a node with no font_size set (null)
    const node = makeNode({ fontSize: null });
    const handlers = makeHandlers();
    render(<NodeDetailPanel node={node} {...handlers} />);

    // WHEN the "S" (small) size toggle is clicked
    const smallToggle = screen.getByTestId('font-size-small');
    fireEvent.click(smallToggle);

    // THEN onUpdate is called with font_size: 'small'
    expect(handlers.onUpdate).toHaveBeenCalledWith('n1', expect.objectContaining({ font_size: 'small' }));
  });

  it('clicking_the_active_font_size_toggle_calls_onUpdate_with_null', () => {
    /**
     * Verifies that clicking the currently active font size toggle (same size
     * is already set) calls onUpdate with font_size: null, toggling it off.
     *
     * Why: The font size control is a toggle — clicking the active option
     * should deactivate it, resetting the node title to the default 13.5px.
     * This allows users to remove an explicit font size and return to the
     * global default without needing a separate "reset" button.
     *
     * What breaks: Clicking the active size does nothing or selects the same
     * size again — there is no way to remove a font_size setting once applied,
     * and the control appears sticky/broken.
     */
    // GIVEN a node with font_size 'large' already set
    const node = makeNode({ fontSize: 'large' });
    const handlers = makeHandlers();
    render(<NodeDetailPanel node={node} {...handlers} />);

    // WHEN the "L" (large) toggle is clicked again (it is already active)
    const largeToggle = screen.getByTestId('font-size-large');
    fireEvent.click(largeToggle);

    // THEN onUpdate is called with font_size: null (toggle off)
    expect(handlers.onUpdate).toHaveBeenCalledWith('n1', expect.objectContaining({ font_size: null }));
  });
});

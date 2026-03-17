import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toolbar } from './Toolbar';

describe('Toolbar', () => {
  it('renders the Add Node button', () => {
    /**
     * Verifies that the Toolbar renders a visible "Add Node" button.
     *
     * Why: The Toolbar's sole purpose for KC-1.6 is to expose this button.
     * If the button is absent, users have no way to create nodes from the UI.
     *
     * What breaks: The canvas has no entry point for adding nodes, making
     * the app unusable for its core workflow.
     */
    // GIVEN an onAddNode callback
    const onAddNode = vi.fn();

    // WHEN the Toolbar is rendered
    render(<Toolbar onAddNode={onAddNode} />);

    // THEN the Add Node button is visible
    expect(screen.getByRole('button', { name: /add node/i })).toBeInTheDocument();
  });

  it('calls onAddNode when the button is clicked', () => {
    /**
     * Verifies that clicking "Add Node" invokes the onAddNode callback exactly once.
     *
     * Why: The Toolbar is stateless and delegates creation to the parent (App).
     * If the callback is not fired, clicking the button silently does nothing,
     * which is a broken user interaction with no observable error.
     *
     * What breaks: Clicking "Add Node" does nothing — no node appears on canvas.
     */
    // GIVEN an onAddNode spy
    const onAddNode = vi.fn();
    render(<Toolbar onAddNode={onAddNode} />);

    // WHEN the button is clicked
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));

    // THEN the callback is called once
    expect(onAddNode).toHaveBeenCalledTimes(1);
  });

  it('does not call onAddNode when rendered without interaction', () => {
    /**
     * Verifies that just rendering the Toolbar does not trigger onAddNode.
     *
     * Why: Prevents accidental node creation on mount, which would pollute
     * the canvas with a phantom node before the user acts.
     *
     * What breaks: A new node appears on canvas immediately when the app loads,
     * even though the user never clicked "Add Node".
     */
    // GIVEN an onAddNode spy
    const onAddNode = vi.fn();

    // WHEN the Toolbar is rendered without any user interaction
    render(<Toolbar onAddNode={onAddNode} />);

    // THEN the callback is never called
    expect(onAddNode).not.toHaveBeenCalled();
  });
});

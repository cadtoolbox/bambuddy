/**
 * Tests for the AmsNameHoverCard component.
 * Focuses on the hover-card visibility behaviour, specifically the bug fix
 * where blurring the friendly name input now schedules the card to close.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../utils';
import { AmsNameHoverCard } from '../../pages/PrintersPage';
import { api } from '../../api/client';

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      saveAmsLabel: vi.fn().mockResolvedValue(undefined),
      deleteAmsLabel: vi.fn().mockResolvedValue(undefined),
    },
  };
});

const mockAms = {
  id: 1,
  serial_number: 'SN-AMS-001',
  sw_ver: '1.0.0',
  hw_ver: '1.0.0',
  tray: [],
};

function renderCard(canEdit = true) {
  return render(
    <AmsNameHoverCard
      ams={mockAms as never}
      printerId={1}
      label="AMS-A"
      amsLabels={{}}
      canEdit={canEdit}
      onSaved={vi.fn()}
    >
      <span>trigger</span>
    </AmsNameHoverCard>
  );
}

describe('AmsNameHoverCard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the card after hovering over the trigger', async () => {
    const { container } = renderCard();
    const trigger = container.firstElementChild as HTMLElement;

    fireEvent.mouseEnter(trigger);
    vi.advanceTimersByTime(100);

    await waitFor(() => {
      expect(screen.getByText('AMS-A')).toBeInTheDocument();
    });
  });

  it('hides the card after mouse leaves (no input focus)', async () => {
    const { container } = renderCard();
    const trigger = container.firstElementChild as HTMLElement;

    fireEvent.mouseEnter(trigger);
    vi.advanceTimersByTime(100);

    await waitFor(() => {
      expect(screen.getByText('AMS-A')).toBeInTheDocument();
    });

    fireEvent.mouseLeave(trigger);
    vi.advanceTimersByTime(300);

    await waitFor(() => {
      expect(screen.queryByText('AMS-A')).not.toBeInTheDocument();
    });
  });

  it('closes the card when the friendly name input loses focus', async () => {
    const { container } = renderCard();
    const trigger = container.firstElementChild as HTMLElement;

    // Open the card via hover
    fireEvent.mouseEnter(trigger);
    vi.advanceTimersByTime(100);

    await waitFor(() => {
      expect(screen.getByText('AMS-A')).toBeInTheDocument();
    });

    // Focus then blur the input
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.blur(input);

    // Advance past the 200 ms close timeout
    vi.advanceTimersByTime(300);

    await waitFor(() => {
      expect(screen.queryByText('AMS-A')).not.toBeInTheDocument();
    });
  });

  it('does not close card immediately while input is focused', async () => {
    const { container } = renderCard();
    const trigger = container.firstElementChild as HTMLElement;

    // Open the card via hover
    fireEvent.mouseEnter(trigger);
    vi.advanceTimersByTime(100);

    await waitFor(() => {
      expect(screen.getByText('AMS-A')).toBeInTheDocument();
    });

    // Focus the input and then move the mouse out – card should stay open
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.mouseLeave(trigger);
    vi.advanceTimersByTime(300);

    // Card should still be visible because input is focused
    expect(screen.getByText('AMS-A')).toBeInTheDocument();
  });

  it('Clear button calls deleteAmsLabel directly and closes the popup', async () => {
    const onSaved = vi.fn();
    render(
      <AmsNameHoverCard
        ams={mockAms as never}
        printerId={1}
        label="AMS-A"
        amsLabels={{ 1: 'My AMS' }}
        canEdit={true}
        onSaved={onSaved}
      >
        <span>trigger</span>
      </AmsNameHoverCard>,
    );

    const trigger = screen.getByText('trigger').parentElement as HTMLElement;
    fireEvent.mouseEnter(trigger);
    vi.advanceTimersByTime(100);

    await waitFor(() => {
      expect(screen.getByText('AMS-A')).toBeInTheDocument();
    });

    // Click the Clear button
    const clearButton = screen.getByRole('button', { name: /clear/i });
    fireEvent.click(clearButton);

    await waitFor(() => {
      expect(vi.mocked(api.deleteAmsLabel)).toHaveBeenCalledWith(1, 1, 'SN-AMS-001');
      expect(onSaved).toHaveBeenCalled();
      expect(screen.queryByText('AMS-A')).not.toBeInTheDocument();
    });
  });
});

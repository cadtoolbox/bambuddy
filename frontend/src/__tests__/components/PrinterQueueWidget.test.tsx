/**
 * Tests for the PrinterQueueWidget component.
 *
 * This is a compact widget that shows "Next in queue" with the first pending
 * item's name and a "+N" badge if there are more items. Returns null when empty.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '../utils';
import { PrinterQueueWidget } from '../../components/PrinterQueueWidget';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';

const mockQueueItems = [
  {
    id: 1,
    printer_id: 1,
    archive_id: 1,
    position: 1,
    status: 'pending',
    archive_name: 'First Print',
    printer_name: 'X1 Carbon',
    print_time_seconds: 3600,
    scheduled_time: null,
  },
  {
    id: 2,
    printer_id: 1,
    archive_id: 2,
    position: 2,
    status: 'pending',
    archive_name: 'Second Print',
    printer_name: 'X1 Carbon',
    print_time_seconds: 7200,
    scheduled_time: null,
  },
];

describe('PrinterQueueWidget', () => {
  beforeEach(() => {
    server.use(
      http.get('/api/v1/queue/', ({ request }) => {
        const url = new URL(request.url);
        const printerId = url.searchParams.get('printer_id');
        if (printerId === '1') {
          return HttpResponse.json(mockQueueItems);
        }
        return HttpResponse.json([]);
      })
    );
  });

  describe('rendering', () => {
    it('shows next in queue label', async () => {
      render(<PrinterQueueWidget printerId={1} />);

      await waitFor(() => {
        expect(screen.getByText('Next in queue')).toBeInTheDocument();
      });
    });

    it('shows first pending item name', async () => {
      render(<PrinterQueueWidget printerId={1} />);

      await waitFor(() => {
        expect(screen.getByText('First Print')).toBeInTheDocument();
      });
    });

    it('shows additional items badge when multiple pending', async () => {
      render(<PrinterQueueWidget printerId={1} />);

      await waitFor(() => {
        // Shows "+1" badge since there are 2 items
        expect(screen.getByText('+1')).toBeInTheDocument();
      });
    });

    it('shows Waiting for unscheduled items', async () => {
      render(<PrinterQueueWidget printerId={1} />);

      await waitFor(() => {
        expect(screen.getByText('Waiting')).toBeInTheDocument();
      });
    });
  });

  describe('empty state', () => {
    it('renders nothing when no pending items', async () => {
      const { container } = render(<PrinterQueueWidget printerId={999} />);

      // Wait for query to resolve
      await waitFor(() => {
        // Widget returns null when empty, so container should have no visible widget
        expect(container.querySelector('a[href="/queue"]')).not.toBeInTheDocument();
      });
    });
  });

  describe('single item', () => {
    it('does not show badge when only one item', async () => {
      server.use(
        http.get('/api/v1/queue/', () => {
          return HttpResponse.json([mockQueueItems[0]]);
        })
      );

      render(<PrinterQueueWidget printerId={1} />);

      await waitFor(() => {
        expect(screen.getByText('First Print')).toBeInTheDocument();
      });

      // Should not have a "+N" badge
      expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
    });
  });

  describe('link behavior', () => {
    it('links to queue page', async () => {
      render(<PrinterQueueWidget printerId={1} />);

      await waitFor(() => {
        const link = screen.getByRole('link');
        expect(link).toHaveAttribute('href', '/queue');
      });
    });
  });

  describe('force_color_match filtering', () => {
    it('shows item when force_color_match override exactly matches loaded filament', async () => {
      server.use(
        http.get('/api/v1/queue/', () => {
          return HttpResponse.json([
            {
              ...mockQueueItems[0],
              filament_overrides: [
                { type: 'PLA', color: 'ff0000', force_color_match: true },
              ],
            },
          ]);
        })
      );

      // Printer has the exact PLA:ff0000 filament loaded
      const loadedFilaments = new Set(['PLA:ff0000']);
      render(<PrinterQueueWidget printerId={1} loadedFilaments={loadedFilaments} />);

      await waitFor(() => {
        expect(screen.getByText('First Print')).toBeInTheDocument();
      });
    });

    it('hides item when force_color_match override does not match any loaded filament', async () => {
      server.use(
        http.get('/api/v1/queue/', () => {
          return HttpResponse.json([
            {
              ...mockQueueItems[0],
              filament_overrides: [
                { type: 'PLA', color: 'ff0000', force_color_match: true },
              ],
            },
          ]);
        })
      );

      // Printer has a different color loaded — force match must fail
      const loadedFilaments = new Set(['PLA:00ff00']);
      const { container } = render(
        <PrinterQueueWidget printerId={1} loadedFilaments={loadedFilaments} />
      );

      await waitFor(() => {
        // All items filtered out → widget returns null
        expect(container.querySelector('a[href="/queue"]')).not.toBeInTheDocument();
      });
    });

    it('shows item when preference-only override matches at least one loaded filament', async () => {
      server.use(
        http.get('/api/v1/queue/', () => {
          return HttpResponse.json([
            {
              ...mockQueueItems[0],
              filament_overrides: [
                { type: 'PLA', color: 'ff0000', force_color_match: false },
                { type: 'PLA', color: '00ff00', force_color_match: false },
              ],
            },
          ]);
        })
      );

      // Only the second color is loaded — some() should pass
      const loadedFilaments = new Set(['PLA:00ff00']);
      render(<PrinterQueueWidget printerId={1} loadedFilaments={loadedFilaments} />);

      await waitFor(() => {
        expect(screen.getByText('First Print')).toBeInTheDocument();
      });
    });

    it('hides item when preference-only overrides have no color match', async () => {
      server.use(
        http.get('/api/v1/queue/', () => {
          return HttpResponse.json([
            {
              ...mockQueueItems[0],
              filament_overrides: [
                { type: 'PLA', color: 'ff0000', force_color_match: false },
              ],
            },
          ]);
        })
      );

      // No matching color loaded
      const loadedFilaments = new Set(['PLA:0000ff']);
      const { container } = render(
        <PrinterQueueWidget printerId={1} loadedFilaments={loadedFilaments} />
      );

      await waitFor(() => {
        expect(container.querySelector('a[href="/queue"]')).not.toBeInTheDocument();
      });
    });

    it('counts only compatible items when some have unmatched force_color_match overrides', async () => {
      server.use(
        http.get('/api/v1/queue/', () => {
          return HttpResponse.json([
            {
              ...mockQueueItems[0],
              filament_overrides: [
                { type: 'PLA', color: 'ff0000', force_color_match: true },
              ],
            },
            {
              ...mockQueueItems[1],
              filament_overrides: [
                { type: 'PLA', color: '0000ff', force_color_match: true },
              ],
            },
          ]);
        })
      );

      // Only the first item's force color matches
      const loadedFilaments = new Set(['PLA:ff0000']);
      render(<PrinterQueueWidget printerId={1} loadedFilaments={loadedFilaments} />);

      await waitFor(() => {
        // First item is compatible and should be shown
        expect(screen.getByText('First Print')).toBeInTheDocument();
      });

      // Second item is filtered out — no "+1" badge
      expect(screen.queryByText('+1')).not.toBeInTheDocument();
    });
  });
});

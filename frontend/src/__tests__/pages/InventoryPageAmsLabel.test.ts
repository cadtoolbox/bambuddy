/**
 * Tests for the AMS label suffix logic in the InventoryPage location column.
 *
 * The location sort value extractor is a pure function that uses the assignment's
 * ams_label to append a friendly name suffix.  We test the sort-value path here
 * because it is a pure function that can be exercised without mounting a component.
 */

import { describe, it, expect } from 'vitest';
import type { SpoolAssignment } from '../../api/client';
import { formatSlotLabel } from '../../utils/amsHelpers';

// Replicate the location sort-value extractor from InventoryPage (not exported)
function locationSortValue(
  assignment: SpoolAssignment | undefined,
): string {
  if (!assignment) return '';
  const isExt = assignment.ams_id === 254 || assignment.ams_id === 255;
  const isHt = !isExt && assignment.ams_id >= 128;
  const label = assignment.ams_label ? ` (${assignment.ams_label})` : '';
  return `${assignment.printer_name || ''} ${formatSlotLabel(assignment.ams_id, assignment.tray_id, isHt, isExt)}${label}`;
}

function makeAssignment(overrides: Partial<SpoolAssignment> = {}): SpoolAssignment {
  return {
    id: 1,
    spool_id: 1,
    printer_id: 1,
    printer_name: 'Printer 1',
    ams_id: 0,
    tray_id: 0,
    configured: true,
    fingerprint_color: null,
    fingerprint_type: null,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('InventoryPage location column AMS label suffix', () => {
  it('omits suffix when ams_label is null', () => {
    const a = makeAssignment({ ams_label: null });
    expect(locationSortValue(a)).toBe('Printer 1 AMS-A Slot 1');
  });

  it('omits suffix when ams_label is undefined', () => {
    const a = makeAssignment({ ams_label: undefined });
    expect(locationSortValue(a)).toBe('Printer 1 AMS-A Slot 1');
  });

  it('appends (FriendlyName) when ams_label is set', () => {
    const a = makeAssignment({ ams_label: 'Silk Colours' });
    expect(locationSortValue(a)).toBe('Printer 1 AMS-A Slot 1 (Silk Colours)');
  });

  it('includes ams_label for AMS-HT units', () => {
    const a = makeAssignment({ ams_id: 128, tray_id: 0, ams_label: 'Workshop HT' });
    expect(locationSortValue(a)).toBe('Printer 1 HT-A (Workshop HT)');
  });

  it('includes ams_label for external spool', () => {
    const a = makeAssignment({ ams_id: 254, tray_id: 0, ams_label: 'External' });
    // External spools get label "External" from formatSlotLabel
    expect(locationSortValue(a)).toBe('Printer 1 External (External)');
  });

  it('returns empty string when assignment is undefined', () => {
    expect(locationSortValue(undefined)).toBe('');
  });
});

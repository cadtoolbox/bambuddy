/**
 * Tests for the FilamentSlotCircle component.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FilamentSlotCircle } from '../../components/FilamentSlotCircle';

describe('FilamentSlotCircle', () => {
  it('renders the slot number', () => {
    render(<FilamentSlotCircle trayColor="FF0000" trayType="PLA" isEmpty={false} slotNumber={3} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('uses the trayColor as background when provided', () => {
    const { container } = render(
      <FilamentSlotCircle trayColor="FF0000" trayType="PLA" isEmpty={false} slotNumber={1} />
    );
    const circle = container.firstChild as HTMLElement;
    expect(circle.style.backgroundColor).toBe('rgb(255, 0, 0)');
  });

  it('uses #333 background when trayType is set but trayColor is absent', () => {
    const { container } = render(
      <FilamentSlotCircle trayColor="" trayType="PLA" isEmpty={false} slotNumber={1} />
    );
    const circle = container.firstChild as HTMLElement;
    expect(circle.style.backgroundColor).toBe('rgb(51, 51, 51)');
  });

  it('uses transparent background when slot is empty (no type or color)', () => {
    const { container } = render(
      <FilamentSlotCircle isEmpty={true} slotNumber={1} />
    );
    const circle = container.firstChild as HTMLElement;
    expect(circle.style.backgroundColor).toBe('transparent');
  });

  it('applies dashed border when isEmpty is true', () => {
    const { container } = render(
      <FilamentSlotCircle isEmpty={true} slotNumber={2} />
    );
    const circle = container.firstChild as HTMLElement;
    expect(circle.style.borderStyle).toBe('dashed');
    expect(circle.style.borderColor).toBe('rgb(102, 102, 102)');
  });

  it('applies solid border when isEmpty is false', () => {
    const { container } = render(
      <FilamentSlotCircle trayColor="00FF00" trayType="PETG" isEmpty={false} slotNumber={2} />
    );
    const circle = container.firstChild as HTMLElement;
    expect(circle.style.borderStyle).toBe('solid');
  });

  it('uses black text for light filament colors', () => {
    // White (#FFFFFF) is a light color
    render(
      <FilamentSlotCircle trayColor="FFFFFF" trayType="PLA" isEmpty={false} slotNumber={1} />
    );
    const span = screen.getByText('1');
    expect(span.style.color).toBe('rgb(0, 0, 0)');
  });

  it('uses white text for dark filament colors', () => {
    // Dark color (#111111) is not light
    render(
      <FilamentSlotCircle trayColor="111111" trayType="PLA" isEmpty={false} slotNumber={1} />
    );
    const span = screen.getByText('1');
    expect(span.style.color).toBe('rgb(255, 255, 255)');
  });
});

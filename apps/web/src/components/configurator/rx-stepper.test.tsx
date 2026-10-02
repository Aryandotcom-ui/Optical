import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { formatDioptres, RxStepper } from './rx-stepper';

function Harness({
  initial = null,
  allowEmpty = false,
}: {
  initial?: number | null;
  allowEmpty?: boolean;
}) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <RxStepper
      id="sph"
      label="SPH"
      value={value}
      onChange={setValue}
      min={-12}
      max={12}
      step={0.25}
      start={0}
      format={formatDioptres}
      allowEmpty={allowEmpty}
      emptyLabel="None"
      decrementLabel="Decrease SPH"
      incrementLabel="Increase SPH"
    />
  );
}

describe('RxStepper', () => {
  it('is a labelled spin button that moves in 0.25 D steps', () => {
    render(<Harness initial={0} />);
    const input = screen.getByRole('spinbutton', { name: 'SPH' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-valuenow', '-0.25');
    expect(input).toHaveValue('−0.25');
    fireEvent.keyDown(input, { key: 'PageUp' });
    expect(input).toHaveAttribute('aria-valuetext', '+0.75');
    fireEvent.click(screen.getByRole('button', { name: 'Increase SPH' }));
    expect(input).toHaveValue('+1.00');
  });

  it('stops at the limits', () => {
    render(<Harness initial={11.75} />);
    const input = screen.getByRole('spinbutton', { name: 'SPH' });
    fireEvent.keyDown(input, { key: 'PageUp' });
    expect(input).toHaveAttribute('aria-valuenow', '12');
    expect(screen.getByRole('button', { name: 'Increase SPH' })).toBeDisabled();
    fireEvent.keyDown(input, { key: 'Home' });
    expect(input).toHaveAttribute('aria-valuenow', '-12');
  });

  it('accepts typed values, including the minus sign from prescriptions', () => {
    render(<Harness initial={0} />);
    const input = screen.getByRole('spinbutton', { name: 'SPH' });
    fireEvent.change(input, { target: { value: '−3.5' } });
    fireEvent.blur(input);
    expect(input).toHaveAttribute('aria-valuenow', '-3.5');
  });

  it('can be cleared when the value is optional', () => {
    render(<Harness initial={-0.5} allowEmpty />);
    const input = screen.getByRole('spinbutton', { name: 'SPH' });
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(input).toHaveAttribute('aria-valuetext', 'None');
    expect(input).not.toHaveAttribute('aria-valuenow');
  });
});

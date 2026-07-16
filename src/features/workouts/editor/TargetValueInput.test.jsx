import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { TargetValueInput } from './TargetValueInput.jsx';

afterEach(cleanup);

function ControlledInput({ initialTarget, onChange }) {
  const [target, setTarget] = useState(initialTarget);
  return <TargetValueInput target={target} onChange={(value) => {
    setTarget((current) => ({ ...current, value }));
    onChange(value);
  }} />;
}

describe('TargetValueInput', () => {
  it('edits duration as minutes and seconds while emitting canonical seconds', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledInput initialTarget={{ kind: 'duration', value: 180 }} onChange={onChange} />);

    expect(screen.getByLabelText('Минуты')).toHaveValue(3);
    expect(screen.getByLabelText('Секунды')).toHaveValue(0);
    await user.clear(screen.getByLabelText('Секунды'));
    await user.type(screen.getByLabelText('Секунды'), '30');
    expect(onChange).toHaveBeenLastCalledWith(210);
  });

  it('converts kilometers into canonical meters', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledInput initialTarget={{ kind: 'distance', value: 3000 }} onChange={onChange} />);

    expect(screen.getByLabelText('Дистанция')).toHaveValue(3);
    await user.clear(screen.getByLabelText('Дистанция'));
    await user.type(screen.getByLabelText('Дистанция'), '5');
    expect(onChange).toHaveBeenLastCalledWith(5000);
  });
});

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExerciseTargetEditor } from './ExerciseTargetEditor.jsx';

afterEach(cleanup);

describe('ExerciseTargetEditor', () => {
  it('shows only target-relevant fields and returns canonical duration seconds', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ExerciseTargetEditor
      exercise={{
        name: 'Планка', structure: 'sets', sets: 3, restSeconds: 60,
        target: { kind: 'duration', value: 180, unit: 'seconds' },
      }}
      onBack={() => {}}
      onConfirm={onConfirm}
    />);

    expect(screen.getByLabelText('Подходы')).toBeInTheDocument();
    expect(screen.getByLabelText('Минуты')).toHaveValue(3);
    expect(screen.queryByLabelText('Повторения')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Добавить в план' }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      structure: 'sets',
      target: { kind: 'duration', value: 180, unit: 'seconds' },
    }));
  });

  it('switches continuous exercise between time and distance without showing sets', async () => {
    const user = userEvent.setup();
    render(<ExerciseTargetEditor
      exercise={{
        name: 'Бег', structure: 'continuous', sets: 1, restSeconds: 0,
        target: { kind: 'distance', value: 3000, unit: 'meters' },
      }}
      onBack={() => {}}
      onConfirm={() => {}}
    />);
    expect(screen.queryByLabelText('Подходы')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Время' }));
    expect(screen.getByLabelText('Минуты')).toBeInTheDocument();
    expect(screen.queryByLabelText('Дистанция')).not.toBeInTheDocument();
  });
});

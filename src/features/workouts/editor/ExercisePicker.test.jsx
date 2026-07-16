import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExercisePicker } from './ExercisePicker.jsx';

afterEach(cleanup);

describe('ExercisePicker', () => {
  it('shows recent exercises, searches aliases, and selects one item', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ExercisePicker
      appState={{
        customExercises: [],
        workouts: [{
          status: 'completed',
          completedAt: '2026-07-15T10:00:00.000Z',
          exercises: [{
            id: 'run', name: 'Бег', catalogExerciseId: 'running', structure: 'continuous',
            target: { kind: 'distance', value: 5000, unit: 'meters' },
          }],
        }],
      }}
      onSelect={onSelect}
      onCreateCustom={() => {}}
    />);

    expect(screen.getByRole('heading', { name: 'Недавние' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Найти упражнение'), 'турник');
    await user.click(screen.getByRole('button', { name: /Подтягивания/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'pull-ups' }));
  });

  it('offers custom exercise creation without blocking search', async () => {
    const user = userEvent.setup();
    const onCreateCustom = vi.fn();
    render(<ExercisePicker appState={{}} onSelect={() => {}} onCreateCustom={onCreateCustom} />);
    await user.click(screen.getByRole('button', { name: /Создать своё упражнение/ }));
    expect(onCreateCustom).toHaveBeenCalledOnce();
  });
});

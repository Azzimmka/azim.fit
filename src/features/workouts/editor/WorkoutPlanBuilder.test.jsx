import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkoutPlanBuilder } from './WorkoutPlanBuilder.jsx';

afterEach(cleanup);

describe('WorkoutPlanBuilder', () => {
  it('shows compact target summaries and exposes edit/add actions', async () => {
    const user = userEvent.setup();
    const onAddExercise = vi.fn();
    const onEditExercise = vi.fn();
    render(<WorkoutPlanBuilder
      form={{
        title: 'Отжимания + планка', plannedDate: '2026-07-16', time: '18:00',
        exercises: [
          { id: 'push', name: 'Отжимания', structure: 'sets', sets: 3, target: { kind: 'reps', value: 10, unit: 'count' }, restSeconds: 90 },
          { id: 'plank', name: 'Планка', structure: 'sets', sets: 3, target: { kind: 'duration', value: 180, unit: 'seconds' }, restSeconds: 60 },
        ],
      }}
      onUpdate={() => {}}
      onDateChange={() => {}}
      onAddExercise={onAddExercise}
      onEditExercise={onEditExercise}
      onRemoveExercise={() => {}}
    />);

    expect(screen.getByText(/3 × 10 повторов/)).toBeInTheDocument();
    expect(screen.getByText(/3 × 3 мин/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Добавить' }));
    await user.click(screen.getByRole('button', { name: 'Настроить Планка' }));
    expect(onAddExercise).toHaveBeenCalledOnce();
    expect(onEditExercise).toHaveBeenCalledWith('plank');
  });
});

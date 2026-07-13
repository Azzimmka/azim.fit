import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkoutCard } from './WorkoutCard.jsx';

afterEach(cleanup);

const workout = {
  id: 'workout-1',
  title: 'Ноги',
  type: 'Силовая',
  status: 'planned',
  plannedDate: '2026-07-13',
  time: '18:00',
  durationMinutes: 50,
  intensity: 'Средняя',
  planNotes: '',
  resultNotes: '',
  pointsAwarded: 0,
  exercises: [{
    id: 'exercise-1',
    name: 'Приседания',
    sets: 3,
    plannedReps: '10',
    plannedWeightKg: 60,
    restSeconds: 90,
    completedSets: 0,
    actualWeightKg: null,
    actualReps: null,
    rpe: null,
  }],
};

describe('WorkoutCard', () => {
  it('exposes the draft result note only through its dedicated callback', async () => {
    const user = userEvent.setup();
    const onUpdateResultNotes = vi.fn();

    render(
      <WorkoutCard
        workout={workout}
        today="2026-07-13"
        onUpdateResult={() => {}}
        onUpdateResultNotes={onUpdateResultNotes}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Результат' }));
    const notes = screen.getByLabelText('Итоговая заметка');
    fireEvent.change(notes, { target: { value: 'Легко' } });

    expect(onUpdateResultNotes).toHaveBeenCalledWith('workout-1', 'Легко');
  });
});

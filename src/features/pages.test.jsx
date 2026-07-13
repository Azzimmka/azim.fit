import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlanPage } from './plan/PlanPage.jsx';
import { SettingsPage } from './settings/SettingsPage.jsx';
import { TodayPage } from './today/TodayPage.jsx';

afterEach(cleanup);

describe('feature pages', () => {
  it('uses the explicit tomorrow date when creating from the empty state', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();

    render(
      <MemoryRouter>
        <TodayPage
          today="2026-07-13"
          tomorrow="2026-07-14"
          workouts={[]}
          tomorrowWorkouts={[]}
          missedCount={0}
          points={0}
          streak={0}
          todayPoints={0}
          onAdd={onAdd}
          workoutActions={{}}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /Запланировать тренировку на завтра/i }));
    expect(onAdd).toHaveBeenCalledWith('2026-07-14');
  });

  it('renders a template from template.plan and applies it to the selected date', async () => {
    const user = userEvent.setup();
    const onApplyTemplate = vi.fn();
    const template = {
      id: 'template-1',
      name: 'День ног',
      plan: {
        title: 'Ноги',
        type: 'Силовая',
        time: '18:00',
        durationMinutes: 50,
        intensity: 'Средняя',
        planNotes: '',
        reminder: 15,
        exercises: [
          { id: 'exercise-1', name: 'Приседания', sets: 3, plannedReps: '10', plannedWeightKg: 60, restSeconds: 90 },
          { id: 'exercise-2', name: 'Выпады', sets: 3, plannedReps: '12', plannedWeightKg: null, restSeconds: 60 },
        ],
      },
    };

    render(
      <PlanPage
        today="2026-07-13"
        points={0}
        selectedDate="2026-07-15"
        tab="templates"
        workouts={[]}
        missedWorkouts={[]}
        templates={[template]}
        onSelectDate={() => {}}
        onSelectTab={() => {}}
        onAdd={() => {}}
        onCreateTemplate={() => {}}
        onApplyTemplate={onApplyTemplate}
        onEditTemplate={() => {}}
        onDeleteTemplate={() => {}}
        workoutActions={{}}
      />,
    );

    expect(screen.getByText('Силовая · 50 мин')).toBeInTheDocument();
    expect(screen.getByText('2 упражнения')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Использовать' }));
    expect(onApplyTemplate).toHaveBeenCalledWith(template, '2026-07-15');
  });

  it('writes canonical settings field names', async () => {
    const user = userEvent.setup();
    const onUpdateSettings = vi.fn();

    render(
      <SettingsPage
        points={0}
        settings={{ defaultReminder: 15, includeWorkoutTitleInNotifications: false }}
        onUpdateSettings={onUpdateSettings}
        notificationControl={<div>Уведомления</div>}
        onLoadDemo={() => {}}
        onReset={() => {}}
        storageStatus="unknown"
      />,
    );

    await user.selectOptions(screen.getByLabelText('Напоминать по умолчанию'), '30');
    await user.click(screen.getByLabelText(/Показывать название/));

    expect(onUpdateSettings).toHaveBeenNthCalledWith(1, { defaultReminder: 30 });
    expect(onUpdateSettings).toHaveBeenNthCalledWith(2, { includeWorkoutTitleInNotifications: true });
  });
});

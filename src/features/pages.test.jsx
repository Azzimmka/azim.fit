import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlanPage } from './plan/PlanPage.jsx';
import { ProgressPage } from './progress/ProgressPage.jsx';
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
        intensity: 'Средняя',
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

    expect(screen.getByText('Силовая')).toBeInTheDocument();
    expect(screen.getByText('2 упражнения')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Использовать' }));
    expect(onApplyTemplate).toHaveBeenCalledWith(template, '2026-07-15');
  });

  it('renders settings without reminder controls', () => {
    render(
      <SettingsPage
        points={0}
        onLoadDemo={() => {}}
        onReset={() => {}}
        storageStatus="unknown"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Приложение' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Данные' })).toBeInTheDocument();
    expect(screen.queryByText('Напоминания')).not.toBeInTheDocument();
  });

  it('shows verification and logout actions for an email account', async () => {
    const user = userEvent.setup();
    const onCheckVerification = vi.fn();
    const onResendVerification = vi.fn();
    const onLogout = vi.fn();

    render(
      <SettingsPage
        points={0}
        onLoadDemo={() => {}}
        onReset={() => {}}
        storageStatus="persisted"
        authUser={{ email: 'azim@example.com', emailVerified: false }}
        syncStatus="verify-email"
        onCheckVerification={onCheckVerification}
        onResendVerification={onResendVerification}
        onLogout={onLogout}
      />,
    );

    expect(screen.getByText('Подтвердите email для облачной синхронизации')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Проверить подтверждение' }));
    await user.click(screen.getByRole('button', { name: 'Отправить письмо ещё раз' }));
    await user.click(screen.getByRole('button', { name: 'Выйти из аккаунта' }));
    expect(onCheckVerification).toHaveBeenCalledOnce();
    expect(onResendVerification).toHaveBeenCalledOnce();
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it('changes the account avatar from settings without a blocking dialog', async () => {
    const user = userEvent.setup();
    const onAvatarChange = vi.fn();

    render(
      <SettingsPage
        points={0}
        onLoadDemo={() => {}}
        onReset={() => {}}
        storageStatus="persisted"
        authUser={{ email: 'user@example.com', emailVerified: true }}
        accountAvatar={{ kind: 'generated', src: '/avatars/avatar-01.jpg', avatarId: 'avatar-01' }}
        avatarSettings={{ avatarSource: 'generated', avatarId: 'avatar-01' }}
        syncStatus="synced"
        onAvatarChange={onAvatarChange}
        onLogout={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Изменить аватар' }));
    await user.click(screen.getByRole('button', { name: 'Аватар 4' }));
    expect(onAvatarChange).toHaveBeenCalledWith({ source: 'generated', avatarId: 'avatar-04' });
    expect(screen.getByText('Новый аватар выбран.')).toBeInTheDocument();
  });

  it('locks both verification actions while either request is pending', () => {
    render(
      <SettingsPage
        points={0}
        onLoadDemo={() => {}}
        onReset={() => {}}
        storageStatus="persisted"
        authUser={{ email: 'azim@example.com', emailVerified: false }}
        syncStatus="verify-email"
        verificationPending
        onCheckVerification={() => {}}
        onResendVerification={() => {}}
        onLogout={() => {}}
      />,
    );

    const actions = screen.getByRole('button', { name: 'Проверить подтверждение' }).parentElement;
    expect(actions).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Проверить подтверждение' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Отправить письмо ещё раз' })).toBeDisabled();
  });

  it('shows a compact summary for the selected progress day', async () => {
    const user = userEvent.setup();
    const completed = {
      id: 'late-workout',
      title: 'Поздняя силовая',
      status: 'completed',
      plannedDate: '2026-07-10',
      time: '18:00',
      startedAt: '2026-07-12T15:00:00.000Z',
      completedAt: '2026-07-12T15:38:00.000Z',
      exercises: [{
        sets: 3,
        setResults: [
          { status: 'completed' },
          { status: 'completed' },
          { status: 'skipped' },
        ],
      }],
    };
    const planned = {
      id: 'today-workout',
      title: 'Вечерняя разминка',
      status: 'planned',
      plannedDate: '2026-07-14',
      time: '20:00',
      exercises: [{ sets: 2, setResults: [{ status: 'pending' }, { status: 'pending' }] }],
    };

    render(
      <MemoryRouter>
        <ProgressPage
          today="2026-07-14"
          points={35}
          level={1}
          streak={1}
          completedWorkouts={[completed]}
          workouts={[completed, planned]}
          weekData={[
            { date: '2026-07-12', label: 'вс', points: 35 },
            { date: '2026-07-13', label: 'пн', points: 0 },
            { date: '2026-07-14', label: 'вт', points: 0 },
          ]}
          bodyWeightEntries={[{ date: '2026-07-12', weightKg: 74.2 }]}
          onSaveWeight={() => {}}
          onDeleteWeight={() => {}}
          onAdd={() => {}}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: /14 июля: 0 баллов/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Вечерняя разминка')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /12 июля: 35 баллов/ }));

    expect(screen.getByRole('heading', { name: /12 июля/ })).toBeInTheDocument();
    expect(screen.getByText('Поздняя силовая')).toBeInTheDocument();
    expect(screen.getByText('Подходы: 2/3')).toBeInTheDocument();
    expect(screen.getByText('38 мин')).toBeInTheDocument();
    expect(screen.getByText('74.2 кг', { selector: '.day-summary-weight' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть тренировку «Поздняя силовая»' }))
      .toHaveAttribute('href', '/workouts/late-workout');
    expect(screen.queryByText('Личные рекорды')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /13 июля: 0 баллов/ }));
    expect(screen.getByText('В этот день тренировок не было.')).toBeInTheDocument();
  });
});

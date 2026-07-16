// @vitest-environment jsdom
import { useRef, useState } from 'react';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CalendarDays } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareTimerSound } from '../../features/timer/timerSound.js';
import { ConfirmScopeDialog, EmptyState, Modal, RestTimer, Toast } from '../index.js';

vi.mock('../../features/timer/timerSound.js', () => ({
  prepareTimerSound: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(prepareTimerSound).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Modal', () => {
  it('traps focus, closes on Escape and restores the opener focus', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(false);
      const initialFocusRef = useRef(null);

      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open modal</button>
          <Modal
            open={open}
            title="Новая тренировка"
            onClose={() => setOpen(false)}
            initialFocusRef={initialFocusRef}
          >
            <input ref={initialFocusRef} aria-label="Название" />
            <button type="button">Сохранить</button>
          </Modal>
        </>
      );
    }

    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open modal' });
    await user.click(opener);

    const input = screen.getByRole('textbox', { name: 'Название' });
    await waitFor(() => expect(input).toHaveFocus());

    await user.tab();
    expect(screen.getByRole('button', { name: 'Сохранить' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Закрыть' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Сохранить' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('only closes from a backdrop pointer event when enabled', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal open title="Диалог" onClose={onClose} closeOnBackdrop={false}>
        <p>Содержимое</p>
      </Modal>,
    );

    expect(container).toBeEmptyDOMElement();
    fireEvent.mouseDown(document.querySelector('.modal-backdrop'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByText('Содержимое'));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Toast', () => {
  it('announces a message and exposes Undo and dismiss actions', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    const onDismiss = vi.fn();

    render(
      <Toast
        title="Тренировка удалена"
        message="Изменение можно отменить."
        onUndo={onUndo}
        onDismiss={onDismiss}
      />,
    );

    const toast = screen.getByRole('status');
    expect(toast).toHaveAttribute('aria-live', 'polite');
    expect(toast).toHaveTextContent('Тренировка удалена');

    await user.click(screen.getByRole('button', { name: 'Отменить' }));
    await user.click(screen.getByRole('button', { name: 'Закрыть уведомление' }));
    expect(onUndo).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('dismisses ordinary notifications automatically after three seconds', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast title="Тренировка запланирована" onDismiss={onDismiss} />);

    act(() => vi.advanceTimersByTime(2_999));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('supports the eight-second undo window and resets when the notice changes', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const { rerender } = render(
      <Toast title="Тренировка удалена" onDismiss={onDismiss} autoDismissMs={8_000} />,
    );

    act(() => vi.advanceTimersByTime(7_000));
    expect(onDismiss).not.toHaveBeenCalled();
    rerender(<Toast title="Шаблон удалён" onDismiss={onDismiss} autoDismissMs={8_000} />);
    act(() => vi.advanceTimersByTime(1_000));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(7_000));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

describe('RestTimer', () => {
  it('formats time and calls running timer controls', async () => {
    const user = userEvent.setup();
    const onPause = vi.fn();
    const onAddThirty = vi.fn();
    const onCancel = vi.fn();

    render(
      <RestTimer
        remainingSeconds={90}
        onPause={onPause}
        onAddThirty={onAddThirty}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText('01:30')).toHaveAccessibleName('Осталось 1 минута 30 секунд');
    await user.click(screen.getByRole('button', { name: 'Поставить таймер на паузу' }));
    await user.click(screen.getByRole('button', { name: 'Добавить 30 секунд' }));
    await user.click(screen.getByRole('button', { name: 'Отменить таймер' }));

    expect(onPause).toHaveBeenCalledOnce();
    expect(onAddThirty).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(prepareTimerSound).toHaveBeenCalledOnce();
  });

  it('shows Resume while paused', async () => {
    const user = userEvent.setup();
    const onResume = vi.fn();
    render(<RestTimer remainingSeconds={45} status="paused" onResume={onResume} />);

    expect(screen.getByText('На паузе')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Продолжить таймер' }));
    expect(onResume).toHaveBeenCalledOnce();
    expect(prepareTimerSound).toHaveBeenCalledOnce();
  });
});

describe('EmptyState', () => {
  it('renders custom copy and invokes its action', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();

    render(
      <EmptyState
        icon={CalendarDays}
        title="Свободный день"
        description="На эту дату нет тренировок."
        actionLabel="Добавить"
        onAction={onAction}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Свободный день' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Добавить' }));
    expect(onAction).toHaveBeenCalledOnce();
  });
});

describe('ConfirmScopeDialog', () => {
  it('submits the selected series scope', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(<ConfirmScopeDialog open onClose={vi.fn()} onConfirm={onConfirm} />);

    expect(screen.getByRole('dialog', { name: 'Изменить тренировку из серии?' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Только эта/ })).toBeChecked();

    await user.click(screen.getByRole('radio', { name: /Эта и следующие/ }));
    await user.click(screen.getByRole('button', { name: 'Продолжить' }));

    expect(onConfirm).toHaveBeenCalledWith('following');
  });
});

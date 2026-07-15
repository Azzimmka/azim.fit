import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => ({ value: null }));

vi.mock('./AuthProvider.jsx', () => ({
  useAuth: () => authMock.value,
}));

import { AuthPage } from './AuthPage.jsx';

function makeAuth(overrides = {}) {
  return {
    authAvailable: true,
    authReady: true,
    login: vi.fn().mockResolvedValue({ uid: 'login' }),
    loginWithGoogle: vi.fn().mockResolvedValue({ uid: 'google' }),
    register: vi.fn().mockResolvedValue({ uid: 'register' }),
    resetPassword: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function renderPage(mode, props = {}) {
  return render(
    <MemoryRouter>
      <AuthPage mode={mode} {...props} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authMock.value = makeAuth();
});

afterEach(cleanup);

describe('AuthPage', () => {
  it('logs in with email and exposes the auth routes', async () => {
    const user = userEvent.setup();
    const { container } = renderPage('login');

    expect(container.firstElementChild?.tagName).toBe('DIV');

    await user.type(screen.getByLabelText('Электронная почта'), 'user@example.com');
    await user.type(screen.getByLabelText('Пароль'), 'secret12');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    await waitFor(() => {
      expect(authMock.value.login).toHaveBeenCalledWith('user@example.com', 'secret12');
    });
    expect(screen.getByRole('status')).toHaveTextContent('Вход выполнен.');
    expect(screen.getByRole('link', { name: 'Забыли пароль?' }))
      .toHaveAttribute('href', '/forgot-password');
    expect(screen.getByRole('link', { name: 'Создать' }))
      .toHaveAttribute('href', '/register');
  });

  it('validates registration confirmation before calling Firebase', async () => {
    const user = userEvent.setup();
    renderPage('register');

    expect(screen.getByRole('link', { name: 'Войти' })).toHaveAttribute('href', '/login');

    await user.type(screen.getByLabelText('Электронная почта'), 'new@example.com');
    await user.type(screen.getByLabelText('Пароль'), 'secret12');
    await user.type(screen.getByLabelText('Повторите пароль'), 'different');
    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Пароли не совпадают.');
    expect(screen.getByLabelText('Повторите пароль'))
      .toHaveAttribute('aria-describedby', 'auth-register-feedback');
    expect(screen.getByLabelText('Повторите пароль')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Повторите пароль')).toHaveFocus();
    expect(screen.getByLabelText('Пароль')).not.toHaveAttribute('aria-invalid');
    expect(authMock.value.register).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Повторите пароль'));
    expect(screen.getByLabelText('Повторите пароль')).not.toHaveAttribute('aria-invalid');
    await user.type(screen.getByLabelText('Повторите пароль'), 'secret12');
    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }));

    await waitFor(() => {
      expect(authMock.value.register).toHaveBeenCalledWith(
        'new@example.com',
        'secret12',
        { avatarId: 'avatar-01' },
      );
    });
    expect(screen.getByRole('status')).toHaveTextContent('Проверьте почту');
  });

  it('associates validation feedback with the focused invalid field', async () => {
    const user = userEvent.setup();
    renderPage('login');

    await user.click(screen.getByRole('button', { name: 'Войти' }));

    const emailInput = screen.getByLabelText('Электронная почта');
    const passwordInput = screen.getByLabelText('Пароль');
    expect(emailInput).toHaveFocus();
    expect(emailInput).toHaveAttribute('aria-invalid', 'true');
    expect(emailInput).toHaveAttribute('aria-describedby', 'auth-login-feedback');
    expect(passwordInput).not.toHaveAttribute('aria-invalid');

    await user.type(emailInput, 'user@example.com');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(passwordInput).toHaveFocus();
    expect(passwordInput).toHaveAttribute('aria-invalid', 'true');
    expect(passwordInput).toHaveAttribute('aria-describedby', 'auth-login-feedback');
    expect(emailInput).not.toHaveAttribute('aria-invalid');
  });

  it('sends a reset email without rendering password or Google controls', async () => {
    const user = userEvent.setup();
    renderPage('reset');

    expect(screen.queryByLabelText('Пароль')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Google/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Войти' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Вернуться ко входу' }))
      .toHaveAttribute('href', '/login');
    await user.type(screen.getByLabelText('Электронная почта'), 'user@example.com');
    await user.click(screen.getByRole('button', { name: 'Отправить ссылку' }));

    await waitFor(() => {
      expect(authMock.value.resetPassword).toHaveBeenCalledWith('user@example.com');
    });
    expect(screen.getByRole('status')).toHaveTextContent('Ссылка отправлена');
  });

  it('keeps local mode available when Firebase is not configured', async () => {
    const user = userEvent.setup();
    const onContinueLocal = vi.fn();
    authMock.value = makeAuth({ authAvailable: false });
    renderPage('login', { onContinueLocal });

    expect(screen.getByText(/Облачный вход пока не настроен/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Войти' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Продолжить с Google' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Продолжить без аккаунта' }));
    expect(onContinueLocal).toHaveBeenCalledOnce();
  });
});

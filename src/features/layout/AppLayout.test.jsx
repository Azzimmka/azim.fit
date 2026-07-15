import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { AppLayout } from './AppLayout.jsx';

afterEach(cleanup);

function renderLayout(props = {}) {
  return render(
    <MemoryRouter initialEntries={['/today']}>
      <AppLayout
        points={0}
        level={1}
        levelProgress={0}
        remainingPoints={250}
        missedCount={0}
        {...props}
      >
        <p>Контент</p>
      </AppLayout>
    </MemoryRouter>,
  );
}

describe('AppLayout account summary', () => {
  it('keeps the optional account props backwards compatible in local mode', () => {
    renderLayout();

    expect(screen.getByText('Локальный профиль')).toBeInTheDocument();
    expect(screen.getByText('Локальный режим')).toBeInTheDocument();
    expect(screen.getByRole('link', {
      name: 'Настройки аккаунта: Локальный профиль, Локальный режим',
    })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('link', { name: 'Войти и включить синхронизацию' }))
      .toHaveAttribute('href', '/login');
  });

  it('shows the account name, email, photo and sync tone', () => {
    renderLayout({
      accountUser: {
        displayName: 'Азим Т.',
        email: 'azim@example.com',
        photoURL: 'https://example.com/avatar.png',
      },
      syncStatus: 'syncing',
    });

    expect(screen.getByText('Азим Т.')).toBeInTheDocument();
    expect(screen.getByText('azim@example.com')).toBeInTheDocument();
    expect(document.querySelector('.account-avatar img'))
      .toHaveAttribute('src', 'https://example.com/avatar.png');
    expect(document.querySelector('.profile-sync-indicator.syncing'))
      .toHaveAttribute('title', 'Синхронизация');
  });

  it('uses the resolved generated avatar in desktop and mobile account controls', () => {
    renderLayout({
      accountUser: { email: 'user@example.com', emailVerified: true },
      accountAvatar: { kind: 'generated', src: '/avatars/avatar-08.jpg', avatarId: 'avatar-08' },
      syncStatus: 'synced',
    });

    expect(document.querySelectorAll('img[src="/avatars/avatar-08.jpg"]')).toHaveLength(2);
    expect(document.querySelector('.mobile-account-control .profile-sync-indicator.synced'))
      .toBeInTheDocument();
  });

  it('shows a global settings link for an unverified email account', () => {
    renderLayout({
      accountUser: {
        email: 'azim@example.com',
        emailVerified: false,
      },
      syncStatus: 'verify-email',
    });

    expect(screen.getByRole('status')).toHaveTextContent('Подтвердите email');
    expect(screen.getByRole('link', { name: 'Открыть' })).toHaveAttribute('href', '/settings');
  });

  it('hides the verification banner for verified accounts and immersive pages', () => {
    const verified = renderLayout({
      accountUser: {
        email: 'azim@example.com',
        emailVerified: true,
      },
    });

    expect(screen.queryByText('Подтвердите email')).not.toBeInTheDocument();
    verified.unmount();

    renderLayout({
      immersive: true,
      accountUser: {
        email: 'azim@example.com',
        emailVerified: false,
      },
      syncStatus: 'verify-email',
    });

    expect(screen.queryByText('Подтвердите email')).not.toBeInTheDocument();
  });
});

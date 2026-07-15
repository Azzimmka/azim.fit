import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const firebaseMocks = vi.hoisted(() => ({
  auth: { currentUser: null },
  browserLocalPersistence: { type: 'LOCAL' },
  createUserWithEmailAndPassword: vi.fn(),
  onAuthStateChanged: vi.fn(),
  reload: vi.fn(),
  sendEmailVerification: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  setPersistence: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
  nextUser: null,
  observerError: null,
  googleProvider: null,
}));

vi.mock('../../firebase/client.js', () => ({
  auth: firebaseMocks.auth,
  firebaseConfigured: true,
}));

vi.mock('firebase/auth', () => {
  class GoogleAuthProvider {
    constructor() {
      this.setCustomParameters = vi.fn();
      firebaseMocks.googleProvider = this;
    }
  }

  return {
    GoogleAuthProvider,
    browserLocalPersistence: firebaseMocks.browserLocalPersistence,
    createUserWithEmailAndPassword: firebaseMocks.createUserWithEmailAndPassword,
    onAuthStateChanged: firebaseMocks.onAuthStateChanged,
    reload: firebaseMocks.reload,
    sendEmailVerification: firebaseMocks.sendEmailVerification,
    sendPasswordResetEmail: firebaseMocks.sendPasswordResetEmail,
    setPersistence: firebaseMocks.setPersistence,
    signInWithEmailAndPassword: firebaseMocks.signInWithEmailAndPassword,
    signInWithPopup: firebaseMocks.signInWithPopup,
    signInWithRedirect: firebaseMocks.signInWithRedirect,
    signOut: firebaseMocks.signOut,
  };
});

import { AuthProvider, useAuth } from './AuthProvider.jsx';

function AuthProbe({ onValue }) {
  const value = useAuth();
  onValue(value);
  return (
    <div>
      <span>{value.authReady ? 'ready' : 'waiting'}</span>
      <span>{value.isAuthenticated ? 'authenticated' : 'anonymous'}</span>
      <span>{value.isEmailVerified ? 'verified' : 'unverified'}</span>
    </div>
  );
}

beforeEach(() => {
  firebaseMocks.auth.currentUser = null;
  firebaseMocks.googleProvider = null;
  firebaseMocks.nextUser = null;
  firebaseMocks.observerError = null;
  firebaseMocks.unsubscribe.mockReset();
  firebaseMocks.createUserWithEmailAndPassword.mockReset();
  firebaseMocks.sendEmailVerification.mockReset();
  firebaseMocks.sendPasswordResetEmail.mockReset();
  firebaseMocks.setPersistence.mockReset().mockResolvedValue(undefined);
  firebaseMocks.signInWithEmailAndPassword.mockReset();
  firebaseMocks.signInWithPopup.mockReset();
  firebaseMocks.signInWithRedirect.mockReset();
  firebaseMocks.signOut.mockReset();
  firebaseMocks.onAuthStateChanged.mockReset().mockImplementation((_auth, next, error) => {
    firebaseMocks.nextUser = next;
    firebaseMocks.observerError = error;
    return firebaseMocks.unsubscribe;
  });
  firebaseMocks.reload.mockReset().mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('AuthProvider', () => {
  it('sets local persistence and derives authentication state from the observer', async () => {
    let context;
    const view = render(
      <AuthProvider>
        <AuthProbe onValue={(value) => { context = value; }} />
      </AuthProvider>,
    );

    expect(screen.getByText('waiting')).toBeInTheDocument();
    await waitFor(() => expect(firebaseMocks.onAuthStateChanged).toHaveBeenCalledOnce());
    expect(firebaseMocks.setPersistence).toHaveBeenCalledWith(
      firebaseMocks.auth,
      firebaseMocks.browserLocalPersistence,
    );

    act(() => {
      firebaseMocks.nextUser({ uid: 'user-1', emailVerified: true });
    });

    expect(screen.getByText('ready')).toBeInTheDocument();
    expect(screen.getByText('authenticated')).toBeInTheDocument();
    expect(screen.getByText('verified')).toBeInTheDocument();
    expect(context.authAvailable).toBe(true);
    expect(typeof context.logout).toBe('function');

    view.unmount();
    expect(firebaseMocks.unsubscribe).toHaveBeenCalledOnce();
  });

  it('registers with trimmed email and immediately sends verification', async () => {
    let context;
    const createdUser = { uid: 'created', emailVerified: false };
    firebaseMocks.createUserWithEmailAndPassword.mockResolvedValue({ user: createdUser });
    firebaseMocks.sendEmailVerification.mockResolvedValue(undefined);

    render(
      <AuthProvider>
        <AuthProbe onValue={(value) => { context = value; }} />
      </AuthProvider>,
    );
    await waitFor(() => expect(firebaseMocks.onAuthStateChanged).toHaveBeenCalledOnce());

    await expect(context.register('  user@example.com  ', 'secret12')).resolves.toBe(createdUser);
    expect(firebaseMocks.createUserWithEmailAndPassword).toHaveBeenCalledWith(
      firebaseMocks.auth,
      'user@example.com',
      'secret12',
    );
    expect(firebaseMocks.sendEmailVerification).toHaveBeenCalledWith(createdUser);
  });

  it('opens Google with account selection and exposes the remaining auth actions', async () => {
    let context;
    const googleUser = { uid: 'google' };
    firebaseMocks.signInWithPopup.mockResolvedValue({ user: googleUser });
    firebaseMocks.sendPasswordResetEmail.mockResolvedValue(undefined);
    firebaseMocks.signOut.mockResolvedValue(undefined);

    render(
      <AuthProvider>
        <AuthProbe onValue={(value) => { context = value; }} />
      </AuthProvider>,
    );
    await waitFor(() => expect(firebaseMocks.onAuthStateChanged).toHaveBeenCalledOnce());

    await expect(context.loginWithGoogle()).resolves.toBe(googleUser);
    expect(firebaseMocks.googleProvider.setCustomParameters)
      .toHaveBeenCalledWith({ prompt: 'select_account' });
    expect(firebaseMocks.signInWithPopup).toHaveBeenCalledWith(
      firebaseMocks.auth,
      firebaseMocks.googleProvider,
    );

    await expect(context.resetPassword(' user@example.com ')).resolves.toBe(true);
    expect(firebaseMocks.sendPasswordResetEmail)
      .toHaveBeenCalledWith(firebaseMocks.auth, 'user@example.com');
    await expect(context.logout()).resolves.toBe(true);
    expect(firebaseMocks.signOut).toHaveBeenCalledWith(firebaseMocks.auth);
  });

  it('falls back to redirect when the browser blocks the Google popup', async () => {
    let context;
    firebaseMocks.signInWithPopup.mockRejectedValue({ code: 'auth/popup-blocked' });
    firebaseMocks.signInWithRedirect.mockResolvedValue(undefined);

    render(
      <AuthProvider>
        <AuthProbe onValue={(value) => { context = value; }} />
      </AuthProvider>,
    );
    await waitFor(() => expect(firebaseMocks.onAuthStateChanged).toHaveBeenCalledOnce());

    await expect(context.loginWithGoogle()).resolves.toBeNull();
    expect(firebaseMocks.signInWithRedirect).toHaveBeenCalledWith(
      firebaseMocks.auth,
      firebaseMocks.googleProvider,
    );
  });

  it('refreshes email verification and forces a fresh ID token', async () => {
    let context;
    const currentUser = {
      uid: 'email-user',
      emailVerified: false,
      getIdToken: vi.fn().mockResolvedValue('fresh-token'),
    };
    firebaseMocks.auth.currentUser = currentUser;
    firebaseMocks.reload.mockImplementation(async (target) => {
      target.emailVerified = true;
    });

    render(
      <AuthProvider>
        <AuthProbe onValue={(value) => { context = value; }} />
      </AuthProvider>,
    );
    await waitFor(() => expect(firebaseMocks.onAuthStateChanged).toHaveBeenCalledOnce());

    await expect(context.refreshVerification()).resolves.toBe(true);
    expect(firebaseMocks.reload).toHaveBeenCalledWith(currentUser);
    expect(currentUser.getIdToken).toHaveBeenCalledWith(true);
    await waitFor(() => expect(context.isEmailVerified).toBe(true));
  });

  it('returns a Russian error and does not leak Firebase details', async () => {
    let context;
    firebaseMocks.signInWithEmailAndPassword.mockRejectedValue({
      code: 'auth/invalid-credential',
      message: 'Firebase internal detail',
    });

    render(
      <AuthProvider>
        <AuthProbe onValue={(value) => { context = value; }} />
      </AuthProvider>,
    );
    await waitFor(() => expect(firebaseMocks.onAuthStateChanged).toHaveBeenCalledOnce());

    await expect(context.login('user@example.com', 'wrong'))
      .rejects.toMatchObject({
        name: 'FriendlyAuthError',
        code: 'auth/invalid-credential',
        message: 'Неверная почта или пароль.',
      });
  });
});

import { describe, expect, it } from 'vitest';
import {
  AUTH_UNAVAILABLE_MESSAGE,
  createAuthError,
  getAuthErrorCode,
  getAuthErrorMessage,
  toFriendlyAuthError,
} from './authErrors.js';

describe('auth errors', () => {
  it('maps Firebase codes to safe Russian messages', () => {
    expect(getAuthErrorMessage({ code: 'auth/invalid-credential' }))
      .toBe('Неверная почта или пароль.');
    expect(getAuthErrorMessage({ code: 'auth/network-request-failed' }))
      .toContain('Проверьте сеть');
    expect(getAuthErrorMessage({ code: 'auth/email-already-in-use' }))
      .toContain('уже существует');
    expect(getAuthErrorMessage({ code: 'auth/password-does-not-meet-requirements' }))
      .toContain('требованиям безопасности');
  });

  it('normalizes Firebase-prefixed and unknown errors without exposing internals', () => {
    expect(getAuthErrorCode({ code: 'firebase/auth/too-many-requests' }))
      .toBe('auth/too-many-requests');
    expect(getAuthErrorMessage(new Error('secret backend details')))
      .toBe('Не удалось выполнить действие. Попробуйте ещё раз.');
  });

  it('creates stable friendly errors for local provider guards', () => {
    const unavailable = createAuthError('auth/not-configured');
    expect(unavailable).toMatchObject({
      name: 'FriendlyAuthError',
      code: 'auth/not-configured',
      message: AUTH_UNAVAILABLE_MESSAGE,
    });
    expect(toFriendlyAuthError(unavailable)).toBe(unavailable);
  });
});

import { describe, expect, it } from 'vitest';
import {
  AVATAR_OPTIONS,
  DEFAULT_AVATAR_ID,
  consumePendingRegistrationAvatar,
  normalizeAvatarId,
  resolveProfileAvatar,
  savePendingRegistrationAvatar,
} from './avatars.js';

describe('profile avatars', () => {
  it('exposes ten stable local avatars and normalizes damaged ids', () => {
    expect(AVATAR_OPTIONS).toHaveLength(10);
    expect(normalizeAvatarId('avatar-10')).toBe('avatar-10');
    expect(normalizeAvatarId('../bad')).toBe(DEFAULT_AVATAR_ID);
  });

  it('prefers Google in auto mode and keeps an explicit generated choice', () => {
    const user = { photoURL: 'https://example.com/google.jpg' };
    expect(resolveProfileAvatar(user, {})).toMatchObject({ kind: 'google' });
    expect(resolveProfileAvatar(user, {
      avatarSource: 'generated',
      avatarId: 'avatar-04',
    })).toEqual({
      kind: 'generated',
      src: '/avatars/avatar-04.jpg',
      avatarId: 'avatar-04',
    });
  });

  it('moves the registration choice through scoped session storage once', () => {
    const values = new Map();
    const storage = {
      setItem: (key, value) => values.set(key, value),
      getItem: (key) => values.get(key) ?? null,
      removeItem: (key) => values.delete(key),
    };
    expect(savePendingRegistrationAvatar('user-1', 'avatar-06', storage)).toBe(true);
    expect(consumePendingRegistrationAvatar('user-1', storage)).toBe('avatar-06');
    expect(consumePendingRegistrationAvatar('user-1', storage)).toBeNull();
  });
});

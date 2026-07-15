export const DEFAULT_AVATAR_ID = 'avatar-01';

export const AVATAR_OPTIONS = Object.freeze(Array.from({ length: 10 }, (_, index) => {
  const id = `avatar-${String(index + 1).padStart(2, '0')}`;
  return Object.freeze({
    id,
    src: `/avatars/${id}.jpg`,
    label: `Аватар ${index + 1}`,
  });
}));

const AVATAR_IDS = new Set(AVATAR_OPTIONS.map((avatar) => avatar.id));

export function normalizeAvatarId(value, fallback = DEFAULT_AVATAR_ID) {
  return typeof value === 'string' && AVATAR_IDS.has(value) ? value : fallback;
}

export function getAvatarById(value) {
  const id = normalizeAvatarId(value);
  return AVATAR_OPTIONS.find((avatar) => avatar.id === id) ?? AVATAR_OPTIONS[0];
}

export function resolveProfileAvatar(user, settings = {}) {
  if (!user) return { kind: 'guest', src: '', avatarId: null };

  const googlePhoto = typeof user.photoURL === 'string' ? user.photoURL.trim() : '';
  const source = settings?.avatarSource === 'generated'
    ? 'generated'
    : settings?.avatarSource === 'google'
      ? 'google'
      : 'auto';

  if (googlePhoto && source !== 'generated') {
    return { kind: 'google', src: googlePhoto, avatarId: null };
  }

  const avatar = getAvatarById(settings?.avatarId);
  return { kind: 'generated', src: avatar.src, avatarId: avatar.id };
}

const PENDING_AVATAR_PREFIX = 'keep-at-it-registration-avatar-v1:';

export function savePendingRegistrationAvatar(uid, avatarId, storage = globalThis.sessionStorage) {
  if (!uid || !storage) return false;
  try {
    storage.setItem(`${PENDING_AVATAR_PREFIX}${uid}`, normalizeAvatarId(avatarId));
    return true;
  } catch {
    return false;
  }
}

export function consumePendingRegistrationAvatar(uid, storage = globalThis.sessionStorage) {
  if (!uid || !storage) return null;
  const key = `${PENDING_AVATAR_PREFIX}${uid}`;
  try {
    const value = storage.getItem(key);
    storage.removeItem(key);
    return value ? normalizeAvatarId(value) : null;
  } catch {
    return null;
  }
}

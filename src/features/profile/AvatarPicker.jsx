import { Check } from 'lucide-react';
import { AVATAR_OPTIONS, normalizeAvatarId } from './avatars.js';

export function AvatarPicker({ value, onChange, googlePhotoURL = '', source = 'generated' }) {
  const selectedId = normalizeAvatarId(value);
  const googleSelected = source === 'google' && Boolean(googlePhotoURL);

  return (
    <div className="avatar-picker" role="group" aria-label="Выбор аватара">
      {googlePhotoURL && (
        <button
          type="button"
          className={`avatar-option ${googleSelected ? 'selected' : ''}`}
          aria-pressed={googleSelected}
          aria-label="Использовать фотографию Google"
          onClick={() => onChange({ source: 'google', avatarId: selectedId })}
        >
          <img src={googlePhotoURL} alt="" />
          {googleSelected && <span><Check size={14} aria-hidden="true" /></span>}
          <small>Google</small>
        </button>
      )}
      {AVATAR_OPTIONS.map((avatar) => {
        const selected = !googleSelected && avatar.id === selectedId;
        return (
          <button
            key={avatar.id}
            type="button"
            className={`avatar-option ${selected ? 'selected' : ''}`}
            aria-pressed={selected}
            aria-label={avatar.label}
            onClick={() => onChange({ source: 'generated', avatarId: avatar.id })}
          >
            <img src={avatar.src} alt="" />
            {selected && <span><Check size={14} aria-hidden="true" /></span>}
          </button>
        );
      })}
    </div>
  );
}

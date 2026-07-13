import { useId, useState } from 'react';
import { CalendarClock, Check, Repeat2 } from 'lucide-react';
import { Modal } from './Modal.jsx';

const VALID_SCOPES = new Set(['single', 'following']);

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {import('react').ReactNode} [props.title]
 * @param {import('react').ReactNode} [props.description]
 * @param {string} [props.confirmLabel]
 * @param {'single' | 'following'} [props.defaultScope]
 * @param {(scope: 'single' | 'following') => void} props.onConfirm
 * @param {() => void} props.onClose
 * @param {boolean} [props.busy]
 */
export function ConfirmScopeDialog({
  open,
  title = 'Изменить тренировку из серии?',
  description = 'Выбери, какие тренировки нужно затронуть.',
  confirmLabel = 'Продолжить',
  defaultScope = 'single',
  onConfirm,
  onClose,
  busy = false,
}) {
  const normalizedDefault = VALID_SCOPES.has(defaultScope) ? defaultScope : 'single';

  if (!open) return null;

  return (
    <OpenConfirmScopeDialog
      key={normalizedDefault}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      defaultScope={normalizedDefault}
      onConfirm={onConfirm}
      onClose={onClose}
      busy={busy}
    />
  );
}

function OpenConfirmScopeDialog({
  title,
  description,
  confirmLabel,
  defaultScope,
  onConfirm,
  onClose,
  busy,
}) {
  const [scope, setScope] = useState(defaultScope);
  const formId = `scope-form-${useId()}`;

  const handleSubmit = (event) => {
    event.preventDefault();
    onConfirm(scope);
  };

  return (
    <Modal
      open
      title={title}
      eyebrow="Повторяющийся план"
      description={description}
      onClose={onClose}
      className="scope-dialog"
      closeOnBackdrop={!busy}
      footer={(
        <>
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Отмена</button>
          <button type="submit" className="primary-button" form={formId} disabled={busy}>
            <Check size={18} aria-hidden="true" /> {busy ? 'Сохраняем…' : confirmLabel}
          </button>
        </>
      )}
    >
      <form id={formId} onSubmit={handleSubmit}>
        <fieldset className="scope-options" disabled={busy}>
          <legend className="visually-hidden">Область изменений</legend>
          <label className={`scope-option${scope === 'single' ? ' active' : ''}`}>
            <input
              type="radio"
              name="series-scope"
              value="single"
              checked={scope === 'single'}
              onChange={() => setScope('single')}
            />
            <CalendarClock size={21} aria-hidden="true" />
            <span>
              <strong>Только эта</strong>
              <small>Остальные тренировки серии не изменятся.</small>
            </span>
          </label>
          <label className={`scope-option${scope === 'following' ? ' active' : ''}`}>
            <input
              type="radio"
              name="series-scope"
              value="following"
              checked={scope === 'following'}
              onChange={() => setScope('following')}
            />
            <Repeat2 size={21} aria-hidden="true" />
            <span>
              <strong>Эта и следующие</strong>
              <small>С этой даты будет создана новая часть серии.</small>
            </span>
          </label>
        </fieldset>
      </form>
    </Modal>
  );
}

export default ConfirmScopeDialog;

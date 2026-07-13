import { AlertTriangle, Check, Info, X } from 'lucide-react';

const ICONS = {
  error: AlertTriangle,
  info: Info,
  success: Check,
};

/**
 * @param {object} props
 * @param {import('react').ReactNode} [props.title]
 * @param {import('react').ReactNode} [props.message]
 * @param {'info' | 'success' | 'error'} [props.variant]
 * @param {() => void} [props.onUndo]
 * @param {string} [props.undoLabel]
 * @param {() => void} [props.onDismiss]
 */
export function Toast({
  title,
  message,
  variant = 'info',
  onUndo,
  undoLabel = 'Отменить',
  onDismiss,
}) {
  if (!title && !message) return null;

  const normalizedVariant = ICONS[variant] ? variant : 'info';
  const Icon = ICONS[normalizedVariant];
  const isError = normalizedVariant === 'error';

  return (
    <div
      className={`toast ${normalizedVariant}`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      <span aria-hidden="true"><Icon size={19} /></span>
      <div className="toast-copy">
        {title && <strong>{title}</strong>}
        {message && <small>{message}</small>}
      </div>
      {(onUndo || onDismiss) && (
        <div className="toast-actions">
          {onUndo && (
            <button type="button" className="text-button toast-undo" onClick={onUndo}>
              {undoLabel}
            </button>
          )}
          {onDismiss && (
            <button type="button" className="icon-button toast-dismiss" onClick={onDismiss} aria-label="Закрыть уведомление">
              <X size={17} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default Toast;

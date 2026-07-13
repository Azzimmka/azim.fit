import { Dumbbell, Plus } from 'lucide-react';

/**
 * @param {object} props
 * @param {import('react').ComponentType<{size?: number, 'aria-hidden'?: boolean | string}>} [props.icon]
 * @param {import('react').ReactNode} [props.title]
 * @param {import('react').ReactNode} [props.description]
 * @param {string} [props.actionLabel]
 * @param {() => void} [props.onAction]
 */
export function EmptyState({
  icon: Icon = Dumbbell,
  title = 'Здесь пока пусто',
  description,
  actionLabel,
  onAction,
}) {
  return (
    <div className="empty-state">
      <div aria-hidden="true"><Icon size={28} /></div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {actionLabel && onAction && (
        <button type="button" className="primary-button" onClick={onAction}>
          <Plus size={18} aria-hidden="true" /> {actionLabel}
        </button>
      )}
    </div>
  );
}

export default EmptyState;

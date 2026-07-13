import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(container) {
  if (!container) return [];

  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getAttribute('aria-hidden') !== 'true' && !element.hidden,
  );
}

/**
 * Accessible modal shell with focus trapping and focus restoration.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {import('react').ReactNode} props.title
 * @param {import('react').ReactNode} [props.eyebrow]
 * @param {import('react').ReactNode} [props.description]
 * @param {() => void} props.onClose
 * @param {import('react').ReactNode} props.children
 * @param {import('react').ReactNode} [props.footer]
 * @param {import('react').RefObject<HTMLElement | null>} [props.initialFocusRef]
 * @param {boolean} [props.closeOnBackdrop]
 * @param {string} [props.closeLabel]
 * @param {string} [props.className]
 * @param {string} [props.titleId]
 */
export function Modal({
  open,
  title,
  eyebrow,
  description,
  onClose,
  children,
  footer,
  initialFocusRef,
  closeOnBackdrop = true,
  closeLabel = 'Закрыть',
  className = '',
  titleId,
}) {
  const generatedId = useId();
  const headingId = titleId || `modal-title-${generatedId}`;
  const descriptionId = description ? `modal-description-${generatedId}` : undefined;
  const dialogRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocusedRef.current = document.activeElement;
    const animationFrame = window.requestAnimationFrame(() => {
      const requestedTarget = initialFocusRef?.current;
      const firstFocusable = getFocusableElements(dialogRef.current)[0];
      const target = requestedTarget || firstFocusable || dialogRef.current;

      target?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
      const previous = previouslyFocusedRef.current;
      if (previous instanceof HTMLElement && document.contains(previous)) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [initialFocusRef, open]);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusableElements = getFocusableElements(dialogRef.current);
      if (!focusableElements.length) {
        event.preventDefault();
        dialogRef.current?.focus({ preventScroll: true });
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && (activeElement === first || !dialogRef.current?.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || !dialogRef.current?.contains(activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const modal = (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={`modal${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <div className="modal-head">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2 id={headingId}>{title}</h2>
            {description && <p id={descriptionId} className="modal-description">{description}</p>}
          </div>
          <button type="button" className="icon-button modal-close-button" onClick={onClose} aria-label={closeLabel}>
            <X size={21} aria-hidden="true" />
          </button>
        </div>

        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export default Modal;

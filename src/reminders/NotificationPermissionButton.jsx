import { useState } from 'react';
import { requestNotificationPermission } from './scheduler.js';

const currentPermission = () => globalThis.Notification?.permission ?? 'unsupported';

export function NotificationPermissionButton({ className, onChange }) {
  const [permission, setPermission] = useState(currentPermission);
  const [requesting, setRequesting] = useState(false);

  const request = async () => {
    setRequesting(true);
    const result = await requestNotificationPermission();
    setPermission(result.permission);
    setRequesting(false);
    onChange?.(result);
  };

  if (permission === 'unsupported') {
    return <p role="status">Этот браузер не поддерживает уведомления.</p>;
  }

  return (
    <div className={className}>
      <button
        type="button"
        disabled={requesting || permission === 'granted'}
        onClick={() => void request()}
      >
        {permission === 'granted' ? 'Уведомления включены' : 'Разрешить уведомления'}
      </button>
      {permission === 'denied' && (
        <p role="status">Разрешите уведомления для AZIM.FIT в настройках браузера.</p>
      )}
    </div>
  );
}

import { LocateFixed, MapPinOff, Satellite, Signal, SignalLow } from 'lucide-react';

const STATUS = Object.freeze({
  idle: { label: 'GPS включится после старта', Icon: LocateFixed },
  acquiring: { label: 'Ищем точный GPS-сигнал…', Icon: Satellite },
  good: { label: 'GPS-сигнал хороший', Icon: Signal },
  weak: { label: 'Слабый GPS-сигнал', Icon: SignalLow },
  paused: { label: 'Отслеживание на паузе', Icon: LocateFixed },
  'permission-denied': { label: 'Доступ к геолокации запрещён', Icon: MapPinOff },
  unavailable: { label: 'GPS недоступен на этом устройстве', Icon: MapPinOff },
  'position-error': { label: 'Не удалось получить геопозицию', Icon: SignalLow },
});

export function GpsStatus({ signal = 'idle' }) {
  const item = STATUS[signal] ?? STATUS.idle;
  const Icon = item.Icon;
  return <div className={`gps-status ${signal}`} role="status"><Icon size={17} aria-hidden="true" /><span>{item.label}</span></div>;
}


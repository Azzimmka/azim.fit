export const AUTH_UNAVAILABLE_MESSAGE = 'Облачный вход пока не настроен. Продолжите в локальном режиме.';

const AUTH_ERROR_MESSAGES = Object.freeze({
  'auth/not-configured': AUTH_UNAVAILABLE_MESSAGE,
  'auth/no-current-user': 'Сначала войдите в аккаунт.',
  'auth/invalid-email': 'Проверьте адрес электронной почты.',
  'auth/missing-email': 'Введите адрес электронной почты.',
  'auth/missing-password': 'Введите пароль.',
  'auth/email-already-in-use': 'Аккаунт с этой почтой уже существует.',
  'auth/weak-password': 'Пароль должен содержать минимум 6 символов.',
  'auth/password-does-not-meet-requirements': 'Пароль не соответствует настроенным требованиям безопасности.',
  'auth/invalid-credential': 'Неверная почта или пароль.',
  'auth/user-not-found': 'Неверная почта или пароль.',
  'auth/wrong-password': 'Неверная почта или пароль.',
  'auth/user-disabled': 'Этот аккаунт отключён. Обратитесь в поддержку.',
  'auth/too-many-requests': 'Слишком много попыток. Подождите немного и повторите.',
  'auth/network-request-failed': 'Нет соединения с интернетом. Проверьте сеть и повторите.',
  'auth/popup-closed-by-user': 'Окно Google было закрыто до завершения входа.',
  'auth/popup-blocked': 'Браузер заблокировал окно Google. Разрешите всплывающие окна и повторите.',
  'auth/cancelled-popup-request': 'Уже открыто другое окно входа. Завершите его и повторите.',
  'auth/account-exists-with-different-credential': 'Аккаунт с этой почтой уже использует другой способ входа.',
  'auth/operation-not-allowed': 'Этот способ входа пока недоступен.',
  'auth/unauthorized-domain': 'Вход Google не разрешён для этого адреса приложения.',
  'auth/requires-recent-login': 'Для этого действия войдите в аккаунт ещё раз.',
  'auth/invalid-api-key': AUTH_UNAVAILABLE_MESSAGE,
  'auth/internal-error': 'Сервис входа временно недоступен. Попробуйте ещё раз.',
});

const DEFAULT_AUTH_ERROR_MESSAGE = 'Не удалось выполнить действие. Попробуйте ещё раз.';

export function getAuthErrorCode(error) {
  if (typeof error?.code !== 'string') return '';
  return error.code.startsWith('firebase/') ? error.code.slice('firebase/'.length) : error.code;
}

export function getAuthErrorMessage(error) {
  if (error?.name === 'FriendlyAuthError' && typeof error.message === 'string') {
    return error.message;
  }
  return AUTH_ERROR_MESSAGES[getAuthErrorCode(error)] ?? DEFAULT_AUTH_ERROR_MESSAGE;
}

export function toFriendlyAuthError(error) {
  if (error?.name === 'FriendlyAuthError') return error;
  const friendlyError = new Error(getAuthErrorMessage(error));
  friendlyError.name = 'FriendlyAuthError';
  friendlyError.code = getAuthErrorCode(error) || 'auth/unknown';
  if (error instanceof Error) friendlyError.cause = error;
  return friendlyError;
}

export function createAuthError(code) {
  return toFriendlyAuthError({ code });
}

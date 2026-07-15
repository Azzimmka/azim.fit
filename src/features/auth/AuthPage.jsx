import { ArrowLeft, ArrowRight, Check, Dumbbell, Zap } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AvatarPicker } from '../profile/AvatarPicker.jsx';
import { DEFAULT_AVATAR_ID } from '../profile/avatars.js';
import { useAuth } from './AuthProvider.jsx';
import { AUTH_UNAVAILABLE_MESSAGE, getAuthErrorMessage } from './authErrors.js';
import './auth.css';

const MODE_COPY = Object.freeze({
  login: {
    eyebrow: 'С возвращением',
    title: 'Войти в KEEP AT IT',
    description: 'Продолжите тренировки на своих устройствах.',
    submit: 'Войти',
    pending: 'Входим…',
  },
  register: {
    eyebrow: 'Новый аккаунт',
    title: 'Создать аккаунт',
    description: 'Сохраните свой ритм и будьте готовы к синхронизации.',
    submit: 'Создать аккаунт',
    pending: 'Создаём…',
  },
  reset: {
    eyebrow: 'Восстановление',
    title: 'Сбросить пароль',
    description: 'Отправим ссылку для нового пароля на вашу почту.',
    submit: 'Отправить ссылку',
    pending: 'Отправляем…',
  },
});

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#4285f4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.53h3.24c1.9-1.75 2.98-4.33 2.98-7.39Z" />
      <path fill="#34a853" d="M12 22c2.7 0 4.98-.9 6.63-2.38l-3.24-2.53c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.61A10 10 0 0 0 12 22Z" />
      <path fill="#fbbc05" d="M6.39 13.92A6.02 6.02 0 0 1 6.08 12c0-.67.11-1.32.31-1.92V7.47H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.53l3.35-2.61Z" />
      <path fill="#ea4335" d="M12 5.95c1.47 0 2.79.51 3.83 1.5l2.87-2.88A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.47l3.35 2.61C7.18 7.71 9.39 5.95 12 5.95Z" />
    </svg>
  );
}

function validateForm(mode, email, password, confirmation) {
  if (!email.trim()) return { field: 'email', message: 'Введите адрес электронной почты.' };
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
    return { field: 'email', message: 'Проверьте адрес электронной почты.' };
  }
  if (mode === 'reset') return null;
  if (!password) return { field: 'password', message: 'Введите пароль.' };
  if (mode === 'register' && password.length < 6) {
    return { field: 'password', message: 'Пароль должен содержать минимум 6 символов.' };
  }
  if (mode === 'register' && password !== confirmation) {
    return { field: 'confirmation', message: 'Пароли не совпадают.' };
  }
  return null;
}

export function AuthPage({ mode = 'login', onContinueLocal }) {
  const currentMode = MODE_COPY[mode] ? mode : 'login';
  const copy = MODE_COPY[currentMode];
  const {
    authAvailable,
    authReady,
    login,
    loginWithGoogle,
    register,
    resetPassword,
  } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [avatarId, setAvatarId] = useState(DEFAULT_AVATAR_ID);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '', field: '' });
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmationRef = useRef(null);
  const disabled = pending || !authAvailable || !authReady;
  const feedbackId = `auth-${currentMode}-feedback`;

  const run = async (action, successMessage) => {
    setPending(true);
    setFeedback({ type: '', message: '', field: '' });
    try {
      await action();
      setFeedback({ type: 'success', message: successMessage, field: '' });
    } catch (error) {
      setFeedback({ type: 'error', message: getAuthErrorMessage(error), field: '' });
    } finally {
      setPending(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const validationError = validateForm(currentMode, email, password, confirmation);
    if (validationError) {
      setFeedback({ type: 'error', ...validationError });
      const invalidField = {
        email: emailRef,
        password: passwordRef,
        confirmation: confirmationRef,
      }[validationError.field];
      invalidField?.current?.focus();
      return;
    }
    if (currentMode === 'register') {
      void run(
        () => register(email, password, { avatarId }),
        'Аккаунт создан. Проверьте почту и подтвердите адрес.',
      );
      return;
    }
    if (currentMode === 'reset') {
      void run(
        () => resetPassword(email),
        'Ссылка отправлена. Проверьте входящие и папку «Спам».',
      );
      return;
    }
    void run(() => login(email, password), 'Вход выполнен.');
  };

  const handleFieldChange = (setter) => (event) => {
    setter(event.target.value);
    if (feedback.type) setFeedback({ type: '', message: '', field: '' });
  };

  const handleGoogleLogin = () => {
    void run(
      loginWithGoogle,
      currentMode === 'register' ? 'Аккаунт Google подключён.' : 'Вход через Google выполнен.',
    );
  };

  return (
    <div className="auth-screen">
      <section className="auth-shell" aria-labelledby="auth-page-title">
        <aside className="auth-story" aria-label="KEEP AT IT">
          <Link className="auth-brand" to="/today" aria-label="KEEP AT IT — на главную">
            <span><Zap size={20} fill="currentColor" aria-hidden="true" /></span>
            <strong>KEEP <span>AT IT</span></strong>
          </Link>

          <div className="auth-story-copy">
            <span className="auth-story-icon"><Dumbbell size={22} aria-hidden="true" /></span>
            <p>Личный ритм</p>
            <h2>Тренировка начинается с одного решения.</h2>
            <span>Планируйте, выполняйте и продолжайте с того же места.</span>
          </div>

          <ol className="auth-route" aria-label="Путь тренировки">
            <li><span><Check size={13} aria-hidden="true" /></span><strong>План</strong></li>
            <li><span>2</span><strong>Подход</strong></li>
            <li><span>3</span><strong>Прогресс</strong></li>
          </ol>
        </aside>

        <div className="auth-panel">
          {currentMode === 'reset' && (
            <Link className="auth-back" to="/login">
              <ArrowLeft size={17} aria-hidden="true" /> Войти
            </Link>
          )}
          <header className="auth-heading">
            <p>{copy.eyebrow}</p>
            <h1 id="auth-page-title">{copy.title}</h1>
            <span>{copy.description}</span>
          </header>

          {!authAvailable && (
            <div className="auth-availability" role="status">{AUTH_UNAVAILABLE_MESSAGE}</div>
          )}
          {authAvailable && !authReady && (
            <div className="auth-availability" role="status">Проверяем текущий вход…</div>
          )}

          <form
            className="auth-form"
            onSubmit={handleSubmit}
            noValidate
            aria-busy={pending}
            aria-describedby={feedback.message && !feedback.field ? feedbackId : undefined}
          >
            {currentMode === 'register' && (
              <fieldset className="auth-avatar-fieldset">
                <legend>Ваш аватар</legend>
                <p>Один уже выбран — при желании замените.</p>
                <AvatarPicker
                  value={avatarId}
                  onChange={({ avatarId: nextAvatarId }) => setAvatarId(nextAvatarId)}
                />
              </fieldset>
            )}
            <label>
              <span>Электронная почта</span>
              <input
                ref={emailRef}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                disabled={disabled}
                placeholder="name@example.com"
                aria-invalid={feedback.field === 'email' ? 'true' : undefined}
                aria-describedby={feedback.field === 'email' ? feedbackId : undefined}
                onChange={handleFieldChange(setEmail)}
              />
            </label>

            {currentMode !== 'reset' && (
              <label>
                <span>Пароль</span>
                <input
                  ref={passwordRef}
                  type="password"
                  autoComplete={currentMode === 'register' ? 'new-password' : 'current-password'}
                  value={password}
                  disabled={disabled}
                  placeholder={currentMode === 'register' ? 'Минимум 6 символов' : 'Введите пароль'}
                  aria-invalid={feedback.field === 'password' ? 'true' : undefined}
                  aria-describedby={feedback.field === 'password' ? feedbackId : undefined}
                  onChange={handleFieldChange(setPassword)}
                />
              </label>
            )}

            {currentMode === 'register' && (
              <label>
                <span>Повторите пароль</span>
                <input
                  ref={confirmationRef}
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  disabled={disabled}
                  placeholder="Ещё раз"
                  aria-invalid={feedback.field === 'confirmation' ? 'true' : undefined}
                  aria-describedby={feedback.field === 'confirmation' ? feedbackId : undefined}
                  onChange={handleFieldChange(setConfirmation)}
                />
              </label>
            )}

            {currentMode === 'login' && (
              <Link className="auth-forgot" to="/forgot-password">Забыли пароль?</Link>
            )}

            <div
              id={feedbackId}
              className={`auth-feedback ${feedback.type ? `is-${feedback.type}` : ''}`}
              role={feedback.type === 'error' ? 'alert' : 'status'}
              aria-live={feedback.type === 'error' ? 'assertive' : 'polite'}
              aria-atomic="true"
            >
              {feedback.message}
            </div>

            <button className="auth-primary" type="submit" disabled={disabled}>
              {pending ? copy.pending : copy.submit}
              {!pending && <ArrowRight size={18} aria-hidden="true" />}
            </button>
          </form>

          {currentMode !== 'reset' && (
            <>
              <div className="auth-divider"><span>или</span></div>
              <button className="auth-google" type="button" disabled={disabled} onClick={handleGoogleLogin}>
                <GoogleMark /> Продолжить с Google
              </button>
            </>
          )}

          {onContinueLocal && (
            <button className="auth-local" type="button" disabled={pending} onClick={onContinueLocal}>
              Продолжить без аккаунта
            </button>
          )}

          <p className="auth-switch">
            {currentMode === 'login' && <>Нет аккаунта? <Link to="/register">Создать</Link></>}
            {currentMode === 'register' && <>Уже есть аккаунт? <Link to="/login">Войти</Link></>}
            {currentMode === 'reset' && <><Link to="/login">Вернуться ко входу</Link></>}
          </p>
        </div>
      </section>
    </div>
  );
}

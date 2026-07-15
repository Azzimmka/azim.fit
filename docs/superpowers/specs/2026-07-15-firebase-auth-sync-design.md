# AZIM.FIT — Firebase Authentication и Firestore sync

## Цель

Добавить вход по email/паролю и Google, персональное облачное хранилище и offline-синхронизацию, не ломая текущий local-first режим и не теряя данные из `azim-fit-state-v2`.

## Авторизация

- Публичные маршруты: `/login`, `/register`, `/forgot-password`.
- Пользователь может войти, зарегистрироваться, восстановить пароль, войти через Google или продолжить локально без аккаунта.
- Email-аккаунт получает письмо подтверждения; до подтверждения приложение остаётся доступным локально, но облачные записи не отправляются.
- Состояние Auth определяется только после `onAuthStateChanged`, чтобы исключить показ данных другого аккаунта.

## Локальные данные

- Legacy-ключи V1/V2 сохраняются.
- Гостевые данные пишутся в `azim-fit-state-v2:guest`.
- Данные аккаунта пишутся в `azim-fit-state-v2:<uid>`.
- При первом входе локальные данные безопасно объединяются с облачными по стабильным ID; исходный legacy/guest snapshot не удаляется.

## Firestore

- `users/{uid}` — профиль и метаданные.
- Подколлекции: `workouts`, `series`, `templates`, `bodyWeights`.
- `users/{uid}/meta/app` — `schemaVersion`, `settings`, `activeTimer`.
- Reducer остаётся чистым; отдельный sync-слой вычисляет изменения документов и отправляет batched writes.
- Realtime listeners собирают облачные документы обратно в `AppStateV2` и нормализуют их перед `REPLACE_STATE`.
- Firestore persistent multi-tab cache обеспечивает best-effort offline работу; UI показывает `syncing`, `synced`, `offline` или `error`.

## Безопасность

- Security Rules разрешают доступ только владельцу `uid` с подтверждённым email.
- Все прочие пути запрещены.
- Firebase Web config хранится в Vite environment variables; service-account ключи в клиент не добавляются.
- App Check подключается отдельным production-hardening этапом после проверки метрик.

## PWA и Vercel

- Auth-маршруты получают SPA rewrites.
- Google V1 использует popup по прямому пользовательскому нажатию; redirect не включается без отдельного auth proxy.
- Первый вход требует сети; ранее авторизованный пользователь может читать закэшированные данные offline.

## Проверки

- Unit/component: AuthProvider, формы, scoped storage, merge/diff repository, ошибки и смена аккаунта.
- Rules: пользователь не читает/пишет чужой `uid`, неподтверждённый email не пишет в облако.
- E2E: guest, email login, logout, reload, миграция и offline reload.
- Финальный gate: `npm run check`, `npm run test:e2e`, production build и Firebase emulator rules tests при доступной Java runtime.

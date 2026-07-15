# KEEP AT IT V2

Личный local-first фитнес-трекер на React и Vite. Без аккаунта данные остаются на устройстве; после входа подтверждённый аккаунт синхронизируется через Firebase Cloud Firestore и продолжает работать offline.

## Возможности

- месячный календарь, пропущенные тренировки и маршруты `/today`, `/plan`, `/progress`, `/settings`, `/workouts/:id`;
- создание, редактирование, перенос, дублирование, удаление с отменой и конечные повторяющиеся серии;
- независимые шаблоны тренировок;
- выполненные подходы, фактический вес, повторы, RPE, плановые и итоговые заметки;
- дневник массы тела, недельная статистика и личные рекорды по весу, объёму и повторениям;
- один восстанавливаемый после перезагрузки таймер отдыха;
- PWA-установка, offline app shell, подтверждаемое обновление и активные session-напоминания;
- необязательный вход по email/паролю или Google, восстановление пароля и подтверждение email;
- изолированные локальные профили и realtime/offline-синхронизация с Cloud Firestore;
- корректные русские формы через `Intl.PluralRules('ru-RU')`.

Экспорт и импорт данных не входят в текущую версию.

## Локальный запуск

Требуется Node.js `^20.19.0` или `>=22.12.0`.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Заполните `VITE_FIREBASE_*` в `.env.local` значениями Firebase Web App. Этот файл игнорируется Git. Клиентская Firebase-конфигурация не является service-account ключом, но production-значения всё равно задаются отдельно в Vercel.

Проверки:

```bash
npm run lint
npm test
npm run build
npm run test:e2e
npm run test:firebase
```

Для первого локального E2E-запуска может потребоваться:

```bash
npx playwright install chromium
```

Быстрая проверка без E2E: `npm run check`. Полный gate с Firebase Emulator и Playwright: `npm run check:full`.

## Авторизация, хранение и миграция

Гостевой профиль хранится в `azim-fit-state-v2:guest`, а аккаунты — в `azim-fit-state-v2:<uid>`. Старые ключи `azim-fit-state-v1` и `azim-fit-state-v2` безопасно мигрируют и не удаляются. При первом входе гостевые данные один раз копируются в первый аккаунт этого устройства, затем объединяются с облачными по стабильным ID.

Email-аккаунт может работать локально сразу после регистрации, но Firestore включается только после подтверждения адреса. Google-аккаунт синхронизируется сразу. Firestore хранит данные только внутри `users/{uid}`; правила запрещают анонимный доступ и доступ к чужому UID.

Напоминания работают, пока вкладка или установленная PWA активна. Без отдельного push-scheduler браузер не обязан запускать полностью закрытый service worker по расписанию.

## Firebase

Локальная проверка Security Rules запускает Firestore Emulator:

```bash
npm run test:firebase
```

Для публикации правил и индексов:

```bash
npx firebase login
npx firebase deploy --only firestore:rules,firestore:indexes
```

App Check подключён как production-ready optional bootstrap. После создания reCAPTCHA Enterprise provider укажите `VITE_FIREBASE_APP_CHECK_SITE_KEY`; без ключа bootstrap безопасно ничего не делает.

Перед production-релизом проверьте в Firebase Console:

- Email/Password и Google включены в Authentication → Sign-in method;
- `localhost`, production-домен Vercel и `keepatit.me` добавлены в Authorized domains;
- Firestore Rules и indexes опубликованы командой выше;
- Web App зарегистрировано в App Check с reCAPTCHA Enterprise, его домены разрешены для site key;
- сначала собраны метрики App Check, и только затем включён enforcement для Firestore/Auth.

## Развёртывание

Production-сборка создаётся командой `npm run build`. Конфигурация `vercel.json` содержит SPA rewrites, включая `/login`, `/register` и `/forgot-password`, и cache headers для корневого HTTPS-развёртывания на Vercel.

В Vercel → Project Settings → Environment Variables добавьте все значения из `.env.example` для Production, Preview и Development, затем выполните новый deploy. `VITE_FIREBASE_USE_EMULATORS` в production должен оставаться `false`.

После подключения `keepatit.me` к Vercel добавьте домен также в Firebase Authentication → Settings → Authorized domains и в список разрешённых доменов App Check.

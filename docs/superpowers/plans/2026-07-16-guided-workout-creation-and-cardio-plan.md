# KEEP AT IT — implementation plan: guided creation and cardio

## Objective

Реализовать утверждённую спецификацию `2026-07-16-guided-workout-creation-and-cardio-design.md` без потери текущих V1/V2 данных, без сохранения GPS-координат и с полным production gate.

Работа идёт test-first и тремя крупными gates: V3/editor, timed targets, continuous GPS. После каждого gate выполняются lint, unit/component tests и production build.

## Gate 0 — baseline and safety

### Task 0.1 — зафиксировать baseline

Проверить:

- `git status -sb`;
- `npm run check`;
- `npm run test:e2e`;
- `npm run test:firebase` при доступном emulator runtime.

Новые изменения не смешивать с пользовательскими файлами. `.superpowers/` остаётся ignored.

## Gate 1 — AppStateV3, target model and progressive editor

### Task 1.1 — target domain and formatting

Создать:

- `src/domain/targets.js`;
- `src/domain/targets.test.js`.

Реализовать:

- `TARGET_KINDS`, `EXERCISE_STRUCTURES`, target/unit invariants;
- normalization для reps/duration/distance;
- парсер legacy `plannedReps`: integer, `сек`, `мин`, `mm:ss`, ambiguous text;
- formatters для reps, seconds, meters/km и pace;
- `countExerciseProgressUnits` и target-aware value helpers;
- автоматическое имя тренировки из упражнений.

Тесты: bounds, malformed input, `30 сек`, `3 минуты`, `01:30`, `10–12`, meters/km rounding, pace and Russian forms.

### Task 1.2 — V3 model and runtime migration

Изменить:

- `src/domain/model.js`;
- `src/domain/schema.js`;
- `src/domain/schema.test.js`;
- `src/domain/demo.js` и связанные tests.

Добавить:

- `AppStateV3` и `SCHEMA_VERSION = 3`;
- `customExercises`;
- `activeContinuousSession`;
- `Exercise.structure`, `Exercise.target`, source ids and `legacyTargetText`;
- target-aware `SetResult.actualValue` и `ContinuousResult`;
- сохранение legacy `weightKg`/`rpe` только для исторической совместимости;
- migration V2 reps → V3 target/value;
- migration plan snapshots, series, templates and completed results.

Инварианты: continuous не имеет искусственных setResults; миграция идемпотентна; pointsAwarded и completedAt не пересчитываются у завершённых тренировок.

### Task 1.3 — V3 local storage and cross-tab sync

Изменить:

- `src/store/storage.js`;
- `src/store/storage.test.js`;
- `src/App.jsx` storage listener;
- соответствующие App/component tests.

Добавить `STORAGE_KEY_V3 = 'keep-at-it-state-v3'`, scoped key и чтение в порядке V3 → V2 → V1. Старые keys не удалять. Повреждённый V3 должен безопасно fallback к V2. Все записи идут только в scoped V3.

Обновить E2E storage helper так, чтобы тесты читали V3 key.

### Task 1.4 — Firebase V3 sync and rules

Изменить:

- `src/firebase/syncState.js` и tests;
- `src/firebase/firestoreRepository.js` и tests;
- `src/firebase/confirmedBaseline.js` и tests;
- `src/firebase/useCloudSync.js` и tests;
- `firestore.rules`;
- `tests/firebase/firestore.rules.test.js`.

Добавить `customExercises` Firestore collection, `activeContinuousSession` в meta, V3 baseline key и schema validation `== 3`. Проверить merge/diff/delete, empty-state detection и отсутствие raw coordinates во всех payloads.

### Task 1.5 — exercise catalog and recent defaults

Создать:

- `src/domain/exerciseCatalog.js`;
- `src/domain/exerciseCatalog.test.js`;
- `src/domain/exerciseDefaults.js`;
- `src/domain/exerciseDefaults.test.js`.

Каталог включает минимум: отжимания, подтягивания, приседания, выпады, планка, боковая планка, скручивания, берпи, бег, ходьба, растяжка. Каждый item имеет stable id, aliases, category, icon key and default target.

Селекторы:

- search по нормализованному имени и aliases;
- recent ranking по completedAt, затем планам;
- defaults: completed history → latest plan/template → catalog;
- deep independent copy;
- пользовательские упражнения без конфликтов stable ids.

### Task 1.6 — reducer actions for custom exercises

Изменить:

- `src/store/reducer.js`;
- `src/store/reducer.test.js`;

Добавить idempotent add/update/delete custom exercise. Удаление не меняет workouts/templates/series. Replace-state всегда нормализует V3.

### Task 1.7 — progressive editor components

Создать:

- `src/features/workouts/editor/ExercisePicker.jsx`;
- `src/features/workouts/editor/ExercisePicker.test.jsx`;
- `src/features/workouts/editor/ExerciseTargetEditor.jsx`;
- `src/features/workouts/editor/ExerciseTargetEditor.test.jsx`;
- `src/features/workouts/editor/WorkoutPlanBuilder.jsx`;
- `src/features/workouts/editor/WorkoutPlanBuilder.test.jsx`;
- `src/features/workouts/editor/TargetValueInput.jsx`;
- `src/features/workouts/editor/editorView.js` and tests.

Refactor:

- `src/features/workouts/WorkoutEditor.jsx`;
- `src/features/workouts/WorkoutEditor.test.jsx`.

Create-mode starts in picker. Edit/duplicate/template modes start in prefilled plan builder. Reschedule/result modes keep their focused UI. Picker supports recent/search/categories/custom. Target editor uses progressive disclosure and only relevant fields. Builder auto-generates title until user manually edits it; advanced section is collapsed by default.

### Task 1.8 — App integration and responsive styling

Изменить:

- `src/App.jsx`;
- `src/features/today/TodayPage.jsx` if action semantics need adjustment;
- `src/styles.css`;
- `src/features/pages.test.jsx`;
- `src/features/layout/AppLayout.test.jsx` where modal focus is asserted.

Phone: `100dvh`, safe-area, bottom-sheet/full-screen behavior, sticky CTA, keyboard-safe scroll. Desktop: centered dialog. Preserve focus trap, Escape, focus restoration, live validation, reduced motion and minimum 44px targets.

### Gate 1 validation

- `npm run lint`;
- `npm test -- src/domain/targets.test.js src/domain/schema.test.js src/store/storage.test.js src/firebase src/features/workouts`;
- `npm run build`;
- targeted Playwright create/edit/template/series scenarios.

## Gate 2 — target-aware progress and timed sets

### Task 2.1 — target-aware workout operations

Изменить:

- `src/domain/workouts.js` and tests;
- `src/domain/points.js` and tests;
- `src/domain/records.js` and tests;
- `src/domain/templates.js` and tests;
- `src/domain/recurrence.js` and tests;
- selectors and summary helpers.

Реализовать единицу прогресса: set или one continuous result. Формула `20 + 5 × completed units`. Reps records используют `actualValue`; duration/distance PR игнорируются. Duplicate/template/series deep-copy target fields and reset all results.

### Task 2.2 — phased global timer

Изменить:

- `src/domain/timer.js` and tests;
- `src/store/reducer.js` and tests;
- `src/App.jsx` timer effects;
- timer sound tests.

Добавить `activeTimer.phase = 'work'|'rest'`, target duration, linked set index and deterministic expiry. Reducer prevents concurrent timer/continuous session. Work expiry atomically completes timed set and starts rest only once. Reload, pause/resume, cold expiry and sound behavior remain deterministic.

### Task 2.3 — timed set session UI

Создать:

- `src/features/session/TimedSetSession.jsx`;
- `src/features/session/TimedSetSession.test.jsx`.

Изменить:

- `src/features/session/ActiveWorkoutPage.jsx` and tests;
- `src/features/session/SessionSetFocus.jsx`;
- `src/features/session/SessionRest.jsx`;
- `src/features/session/SessionResultsEditor.jsx`;
- `src/features/session/SessionSummary.jsx`;
- `src/features/session/sessionView.js` and tests;
- `src/styles.css`.

Timed set: start countdown, pause/resume, early-finish confirmation, sound/vibration on expiry, automatic rest. Results editor uses target-aware input and stores actual seconds. Existing reps flow must remain unchanged.

### Gate 2 validation

- domain/reducer timer suites;
- all session component tests;
- E2E `3 × 3 minutes`, reload during work timer, early finish, rest and summary;
- `npm run check`.

## Gate 3 — continuous running and GPS

### Task 3.1 — GPS pure domain

Создать:

- `src/domain/gps.js`;
- `src/domain/gps.test.js`;
- `src/domain/continuousSession.js`;
- `src/domain/continuousSession.test.js`.

Реализовать Haversine, accuracy/timestamp/duplicate/impossible-speed filters, delta aggregation, pace, state machine and manual result validation. Thresholds are exported constants with tests. No domain return value contains raw coordinate history.

### Task 3.2 — privacy-safe browser adapter

Создать:

- `src/features/session/useGpsTracker.js`;
- `src/features/session/useGpsTracker.test.jsx`.

Hook owns `watchId` and `lastAcceptedPoint` in refs/closure. It emits only delta meters, signal status and timestamps. It clears watch on pause, hidden, route exit, error and unmount. Permission request occurs only from direct user action. Tests assert callbacks/store payloads never contain latitude/longitude.

### Task 3.3 — continuous reducer and persistence

Изменить:

- `src/store/reducer.js` and tests;
- `src/domain/schema.js` and tests;
- `src/App.jsx` actions/effects;
- cloud sync tests.

Добавить start/acquire/accept-delta/pause/resume/finish/manual-correct/cancel actions. Persist only accumulated meters, active seconds, status and timestamps. Hidden visibility atomically pauses. Reload resumes from a new baseline without inventing a gap.

### Task 3.4 — running session UI

Создать:

- `src/features/session/ContinuousWorkoutSession.jsx`;
- `src/features/session/ContinuousWorkoutSession.test.jsx`;
- `src/features/session/GpsStatus.jsx`;
- `src/features/session/ContinuousResultEditor.jsx`.

Изменить `ActiveWorkoutPage` to route the current pending exercise to reps, timed or continuous UI. Show acquiring, active, paused, weak-signal, permission-denied, goal-reached and summary states. Goal reached does not auto-finish. Mixed workouts continue to the next exercise.

### Task 3.5 — deployment policy and PWA behavior

Изменить:

- `vercel.json`;
- configuration tests or direct assertions where available;
- PWA E2E setup.

Replace `Permissions-Policy: ... geolocation=()` with same-origin-only permission (`geolocation=(self)`) while camera and microphone remain disabled. Verify HTTPS production headers, offline shell, deep-link reload and Wake Lock fallback.

### Task 3.6 — E2E and privacy acceptance

Изменить:

- `e2e/app.spec.js`;
- Playwright fixtures/helpers if extraction improves clarity.

Mock `navigator.geolocation` before app load and cover:

- distance goal and time goal creation;
- real-time meters, active time and pace;
- invalid GPS jump ignored;
- permission denied/manual fallback;
- pause, visibility loss and reload baseline;
- goal notification without auto-finish;
- mixed workout transition;
- localStorage/Firestore payload contains no coordinate keys;
- offline installed-PWA flow;
- `390×844`, `360px` and `1440×900` overflow.

## Final production gate

Run in order:

1. `npm run check`.
2. `npm run test:firebase`.
3. `npm run test:e2e`.
4. `npm run check:full` when emulator startup is stable.
5. Inspect `git diff --check`, untracked files and secret patterns.
6. Manual smoke-test on installed iPhone/Android PWA:
   - create from recent;
   - timed plan;
   - GPS permission and live distance;
   - screen Wake Lock;
   - hidden-page pause;
   - manual result fallback;
   - offline save and later Firebase sync.

Known non-blocking build warning: current main bundle exceeds Vite's 500 kB advisory threshold. If this feature materially increases it, lazy-load the editor and active session routes before release.

## Completion definition

Implementation is complete only when all automated gates pass, the worktree contains no generated artifacts, the V2 keys remain untouched, Firestore rules accept V3 only for verified owners, and no raw GPS coordinate can be found in persisted state or sync payloads.

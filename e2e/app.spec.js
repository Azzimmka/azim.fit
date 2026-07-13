import { expect, test } from '@playwright/test';

const STORAGE_KEY = 'azim-fit-state-v2';

async function loadDemo(page) {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible();
  await page.getByRole('button', { name: 'Загрузить демо' }).click();
  await expect(page.locator('.toast')).toContainText('Демо загружено');
}

function workoutCard(page, title) {
  return page.locator('article.workout-card').filter({ hasText: title });
}

async function expectNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));

  const details = JSON.stringify(dimensions);
  expect(dimensions.documentWidth, details).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  expect(dimensions.bodyWidth, details).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function waitForServiceWorkerControl(page) {
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service Worker API is unavailable');
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, {
    timeout: 20_000,
  });
}

test('первый запуск пустой; тренировку можно создать, открыть по URL, удалить и восстановить', async ({ page }) => {
  const title = 'Приёмочная силовая';

  await page.goto('/');
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole('heading', { name: 'Сегодня — твой день' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'На сегодня пока пусто' })).toBeVisible();

  await page.getByRole('button', { name: 'Добавить тренировку', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Новая тренировка' });
  await expect(editor).toBeVisible();
  await editor.getByLabel('Название тренировки').fill(title);
  await editor.getByRole('textbox', { name: 'Упражнение', exact: true }).fill('Жим лёжа');
  await editor.getByLabel('Подходы').fill('3');
  await editor.getByLabel('Повторы').fill('8');
  await editor.getByRole('button', { name: 'Запланировать', exact: true }).click();

  const card = workoutCard(page, title);
  await expect(card).toBeVisible();
  await expect(page.locator('.toast')).toContainText('Тренировка запланирована');

  await expect.poll(async () => page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) || '{}');
    return state.workouts?.find((workout) => workout.title === 'Приёмочная силовая')?.id ?? null;
  }, STORAGE_KEY)).not.toBeNull();
  const workoutId = await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key));
    return state.workouts.find((workout) => workout.title === 'Приёмочная силовая').id;
  }, STORAGE_KEY);

  await page.goto(`/workouts/${workoutId}`);
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await expect(workoutCard(page, title)).toBeVisible();

  await workoutCard(page, title).locator(`summary[aria-label="Действия: ${title}"]`).click();
  await workoutCard(page, title).getByRole('button', { name: 'Удалить' }).click();
  await expect(workoutCard(page, title)).toHaveCount(0);
  await expect(page.locator('.toast')).toContainText(`«${title}» удалена`);

  await page.getByRole('button', { name: 'Отменить' }).click();
  await expect(page.locator('.toast')).toContainText('Удаление отменено');
  await page.goto('/today');
  await expect(workoutCard(page, title)).toBeVisible();
});

test('демо-шаблон создаёт независимую тренировку на выбранную дату', async ({ page }) => {
  await loadDemo(page);
  await page.goto('/plan?tab=templates');

  await expect(page.getByRole('tab', { name: /Шаблоны/ })).toHaveAttribute('aria-selected', 'true');
  const template = page.locator('article.template-card').filter({ hasText: 'Короткая тренировка' });
  await expect(template).toBeVisible();
  await template.getByRole('button', { name: 'Использовать' }).click();
  await expect(page.locator('.toast')).toContainText('Тренировка создана из шаблона');

  await page.goto('/today');
  await expect(workoutCard(page, 'Короткая тренировка')).toBeVisible();

  const templateLinkage = await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key));
    const applied = state.workouts.find((workout) => workout.title === 'Короткая тренировка');
    return {
      sourceTemplateId: applied?.sourceTemplateId,
      sameExerciseReferenceIsImpossibleAfterSerialization:
        applied?.exercises?.[0]?.id !== state.templates[0]?.plan?.exercises?.[0]?.id,
    };
  }, STORAGE_KEY);
  expect(templateLinkage.sourceTemplateId).toBeTruthy();
  expect(templateLinkage.sameExerciseReferenceIsImpossibleAfterSerialization).toBe(true);
});

test('можно создать серию и изменить только один её экземпляр', async ({ page }) => {
  await page.goto('/plan');
  await page.getByRole('button', { name: 'Запланировать', exact: true }).click();

  const editor = page.getByRole('dialog', { name: 'Новая тренировка' });
  await editor.getByLabel('Название тренировки').fill('Серия приседаний');
  await editor.getByRole('textbox', { name: 'Упражнение', exact: true }).fill('Приседания');
  await editor.getByRole('checkbox', { name: /Повторять тренировку/ }).check();
  await editor.getByRole('button', { name: 'Запланировать', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('Серия создана');

  const sourceCard = workoutCard(page, 'Серия приседаний').first();
  await expect(sourceCard).toBeVisible();
  await sourceCard.getByRole('button', { name: 'Действия: Серия приседаний' }).click();
  await sourceCard.getByRole('button', { name: 'Редактировать' }).click();

  const editDialog = page.getByRole('dialog', { name: 'Редактировать тренировку' });
  await editDialog.getByLabel('Название тренировки').fill('Приседания — разово');
  await editDialog.getByRole('button', { name: 'Сохранить', exact: true }).click();

  const scopeDialog = page.getByRole('dialog', { name: 'Изменить тренировку из серии?' });
  await expect(scopeDialog.getByRole('radio', { name: /Только эта/ })).toBeChecked();
  await scopeDialog.getByRole('button', { name: 'Применить' }).click();
  await expect(page.locator('.toast')).toContainText('Изменена одна тренировка');
  await expect(workoutCard(page, 'Приседания — разово')).toBeVisible();

  const seriesState = await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key));
    const series = state.series[0];
    const workouts = state.workouts.filter((workout) => workout.seriesId === series.id);
    return {
      count: workouts.length,
      changed: workouts.filter((workout) => workout.title === 'Приседания — разово').length,
      unchanged: workouts.filter((workout) => workout.title === 'Серия приседаний').length,
    };
  }, STORAGE_KEY);
  expect(seriesState.count).toBeGreaterThan(1);
  expect(seriesState.changed).toBe(1);
  expect(seriesState.unchanged).toBeGreaterThan(0);
});

test('результат завершённой тренировки корректируется без изменения плана', async ({ page }) => {
  await loadDemo(page);
  const original = await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key));
    const workout = state.workouts.find((item) => item.id === 'demo-completed');
    return { plannedDate: workout.plannedDate, title: workout.title, time: workout.time };
  }, STORAGE_KEY);

  await page.goto(`/plan?date=${original.plannedDate}`);
  const card = workoutCard(page, original.title);
  await card.getByRole('button', { name: `Действия: ${original.title}` }).click();
  await card.getByRole('button', { name: 'Исправить результат' }).click();

  const editor = page.getByRole('dialog', { name: 'Исправить результат' });
  await editor.getByLabel('Вес, кг').first().fill('30');
  await editor.getByLabel('Итоговая заметка').fill('Исправлено после проверки записей');
  await editor.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('Результат исправлен');

  const corrected = await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key));
    const workout = state.workouts.find((item) => item.id === 'demo-completed');
    return {
      plannedDate: workout.plannedDate,
      time: workout.time,
      actualWeightKg: workout.exercises[0].actualWeightKg,
      resultNotes: workout.resultNotes,
    };
  }, STORAGE_KEY);
  expect(corrected).toEqual({
    plannedDate: original.plannedDate,
    time: original.time,
    actualWeightKg: 30,
    resultNotes: 'Исправлено после проверки записей',
  });

  await page.goto('/progress');
  await expect(page.locator('.records-card')).toContainText('Жим гантелей');
  await expect(page.locator('.records-card')).toContainText('Рабочий вес: 30 кг');
});

test('пропущенную тренировку можно перенести на сегодня', async ({ page }) => {
  await loadDemo(page);
  await page.goto('/plan?tab=missed');

  const missedCard = workoutCard(page, 'Кардио и мобильность');
  await expect(missedCard).toBeVisible();
  await expect(missedCard.getByText('Пропущена · можно выполнить сейчас или перенести')).toBeVisible();
  await missedCard.locator('summary[aria-label="Действия: Кардио и мобильность"]').click();
  await missedCard.getByRole('button', { name: 'Перенести' }).click();

  const editor = page.getByRole('dialog', { name: 'Перенести тренировку' });
  const today = await page.evaluate(() => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  await editor.getByLabel('Новая дата').fill(today);
  await editor.getByRole('button', { name: 'Перенести', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('Тренировка перенесена');
  await expect(workoutCard(page, 'Кардио и мобильность')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Пропусков нет' })).toBeVisible();

  await page.goto('/today');
  await expect(workoutCard(page, 'Кардио и мобильность')).toBeVisible();
});

test('пропущенную тренировку можно выполнить поздно', async ({ page }) => {
  await loadDemo(page);
  await page.goto('/plan?tab=missed');

  const card = workoutCard(page, 'Кардио и мобильность');
  const setButtons = card.locator('button.set-dot');
  const totalSets = await setButtons.count();
  expect(totalSets).toBeGreaterThan(0);
  for (let index = 0; index < totalSets; index += 1) {
    await setButtons.nth(index).click();
  }

  const complete = card.getByRole('button', { name: 'Завершить сейчас' });
  await expect(complete).toBeEnabled();
  await complete.click();
  await expect(page.locator('.toast')).toContainText(/Тренировка завершена|Новый личный рекорд/);
  await expect(workoutCard(page, 'Кардио и мобильность')).toHaveCount(0);

  const completed = await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key));
    const workout = state.workouts.find((item) => item.title === 'Кардио и мобильность');
    return {
      status: workout?.status,
      plannedDate: workout?.plannedDate,
      completedAt: workout?.completedAt,
      pointsAwarded: workout?.pointsAwarded,
    };
  }, STORAGE_KEY);
  expect(completed.status).toBe('completed');
  expect(completed.completedAt).toBeTruthy();
  expect(completed.pointsAwarded).toBeGreaterThan(0);
});

test('дневник веса сохраняет, редактирует и восстанавливает удалённую запись', async ({ page }) => {
  await page.goto('/progress');
  await expect(page.getByRole('heading', { name: 'Твой прогресс' })).toBeVisible();

  const weightInput = page.getByLabel('Вес, кг');
  await weightInput.fill('82.4');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.locator('.weight-history')).toContainText('82.4 кг');

  await page.reload();
  await expect(page.locator('.weight-history')).toContainText('82.4 кг');
  await page.getByRole('button', { name: 'Изменить' }).click();
  await page.getByLabel('Вес, кг').fill('82.1');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.locator('.weight-history')).toContainText('82.1 кг');

  await page.getByRole('button', { name: 'Удалить' }).click();
  await expect(page.locator('.weight-history')).toHaveCount(0);
  await expect(page.locator('.toast')).toContainText('Запись веса удалена');
  await page.getByRole('button', { name: 'Отменить' }).click();
  await expect(page.locator('.weight-history')).toContainText('82.1 кг');
});

test('основные экраны и редактор не создают горизонтальное переполнение в целевых viewport', async ({ page }, testInfo) => {
  const viewport = testInfo.project.name === 'mobile'
    ? { width: 390, height: 844 }
    : { width: 1440, height: 900 };
  await page.setViewportSize(viewport);
  await loadDemo(page);

  for (const path of ['/today', '/plan', '/plan?tab=missed', '/plan?tab=templates', '/progress', '/settings']) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }

  await page.goto('/today');
  await page.getByRole('button', { name: 'Запланировать', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Новая тренировка' });
  await editor.getByLabel('Подходы').fill('20');
  await expectNoHorizontalOverflow(page);
});

test('после первого online-запуска приложение перезагружается и сохраняет данные offline', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'PWA-проверка выполняется один раз в Chromium desktop');
  test.setTimeout(45_000);

  await loadDemo(page);
  await page.goto('/today');
  await waitForServiceWorkerControl(page);
  await expect(workoutCard(page, 'Верх тела')).toBeVisible();

  try {
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Сегодня — твой день' })).toBeVisible();
    await expect(workoutCard(page, 'Верх тела')).toBeVisible();

    await page.goto('/progress', { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Вес, кг').fill('79.3');
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.locator('.weight-history')).toContainText('79.3 кг');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.weight-history')).toContainText('79.3 кг');
  } finally {
    await context.setOffline(false);
  }
});

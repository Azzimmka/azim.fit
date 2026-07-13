const pluralRules = new Intl.PluralRules('ru-RU');

export const RU_FORMS = Object.freeze({
  day: Object.freeze(['день', 'дня', 'дней']),
  week: Object.freeze(['неделя', 'недели', 'недель']),
  workout: Object.freeze(['тренировка', 'тренировки', 'тренировок']),
  exercise: Object.freeze(['упражнение', 'упражнения', 'упражнений']),
  set: Object.freeze(['подход', 'подхода', 'подходов']),
  point: Object.freeze(['балл', 'балла', 'баллов']),
});

/**
 * @param {number} count
 * @param {[string, string, string]|{one: string, few: string, many: string, other?: string}} forms
 */
export function pluralizeRu(count, forms) {
  const category = pluralRules.select(Number(count));
  if (Array.isArray(forms)) {
    if (category === 'one') return forms[0];
    if (category === 'few') return forms[1];
    return forms[2];
  }
  return forms[category] ?? forms.many ?? forms.other ?? '';
}

/** @param {number} count @param {keyof typeof RU_FORMS} unit */
export function formatRuCount(count, unit) {
  const forms = RU_FORMS[unit];
  if (!forms) return String(count);
  return `${count} ${pluralizeRu(count, forms)}`;
}


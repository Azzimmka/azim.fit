import { normalizePlanSnapshot, normalizeTemplate } from './schema.js';
import { applyTemplate, createTemplateFromWorkout } from './workouts.js';

function nowIso(now) {
  const timestamp = new Date(now ?? Date.now()).getTime();
  return new Date(Number.isFinite(timestamp) ? timestamp : Date.now()).toISOString();
}

/**
 * Produces a fresh nested plan object. No exercise object or array is shared.
 * @param {object} plan
 */
export function cloneTemplatePlan(plan) {
  const normalized = normalizePlanSnapshot(plan);
  return {
    ...normalized,
    exercises: normalized.exercises.map((exercise) => ({ ...exercise })),
  };
}

/**
 * Template edits affect the template only; existing workouts are never read or
 * mutated by this helper.
 * @param {import('./model.js').Template} template
 * @param {{name?: string, plan?: object, updatedAt?: Date|number|string}} patch
 */
export function updateTemplate(template, patch = {}) {
  return normalizeTemplate({
    ...template,
    name: patch.name ?? template.name,
    plan: patch.plan ? cloneTemplatePlan(patch.plan) : cloneTemplatePlan(template.plan),
    updatedAt: nowIso(patch.updatedAt),
  });
}

export { applyTemplate, createTemplateFromWorkout };


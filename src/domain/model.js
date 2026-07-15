/**
 * Canonical runtime constants for the local-first V2 model.
 *
 * @typedef {'planned' | 'completed' | 'skipped'} WorkoutStatus
 * @typedef {'pending' | 'completed' | 'skipped'} SetResultStatus
 *
 * @typedef {Object} SetResult
 * @property {number} setNumber One-based position within the exercise.
 * @property {SetResultStatus} status
 * @property {number|null} weightKg
 * @property {number|null} reps
 * @property {number|null} rpe
 * @property {string|null} completedAt
 *
 * @typedef {Object} Exercise
 * @property {string} id
 * @property {string} name
 * @property {number} sets Planned set count (1..20).
 * @property {string} plannedReps
 * @property {number|null} plannedWeightKg
 * @property {number} restSeconds 0 disables rest; otherwise 15..900.
 * @property {number} completedSets
 * @property {number|null} actualWeightKg
 * @property {number|null} actualReps
 * @property {number|null} rpe
 * @property {SetResult[]} setResults
 *
 * @typedef {Object} Workout
 * @property {string} id
 * @property {string} title
 * @property {string} type
 * @property {WorkoutStatus} status
 * @property {string} plannedDate Local calendar date, YYYY-MM-DD.
 * @property {string} occurrenceDate Original occurrence date used for series dedupe.
 * @property {string} time Local HH:mm.
 * @property {string} intensity
 * @property {string} resultNotes
 * @property {string|null} startedAt ISO timestamp of the first active-session opening.
 * @property {string|null} completedAt ISO timestamp; only set when completed.
 * @property {string|null} seriesId
 * @property {string|null} sourceTemplateId
 * @property {number} pointsAwarded Historical awarded points; zero until completion.
 * @property {Exercise[]} exercises
 *
 * @typedef {Object} WorkoutPlanSnapshot
 * @property {string} title
 * @property {string} type
 * @property {string} time
 * @property {string} intensity
 * @property {Array<Pick<Exercise, 'id'|'name'|'sets'|'plannedReps'|'plannedWeightKg'|'restSeconds'>>} exercises
 *
 * @typedef {Object} RecurrenceSeries
 * @property {string} id
 * @property {number[]} weekdays ISO weekdays, Monday=1 through Sunday=7.
 * @property {number} intervalWeeks
 * @property {string} startsOn
 * @property {string} endsOn Inclusive date.
 * @property {string[]} excludedOccurrenceDates
 * @property {WorkoutPlanSnapshot} planSnapshot
 *
 * @typedef {Object} Template
 * @property {string} id
 * @property {string} name
 * @property {WorkoutPlanSnapshot} plan
 * @property {string} createdAt
 * @property {string} updatedAt
 *
 * @typedef {Object} BodyWeightEntry
 * @property {string} date
 * @property {number} weightKg
 * @property {string} updatedAt
 *
 * @typedef {Object} AppSettings
 * @property {'google'|'generated'|undefined} [avatarSource]
 * @property {string|undefined} [avatarId]
 *
 * @typedef {Object} ActiveTimer
 * @property {'running'|'paused'} status
 * @property {string|null} endsAt Absolute ISO timestamp while running.
 * @property {number|null} remainingSeconds Stored remaining time while paused.
 * @property {number} initialSeconds
 * @property {string|null} workoutId
 * @property {string|null} exerciseId
 *
 * @typedef {Object} AppStateV2
 * @property {2} schemaVersion
 * @property {Workout[]} workouts
 * @property {RecurrenceSeries[]} series
 * @property {Template[]} templates
 * @property {BodyWeightEntry[]} bodyWeightEntries
 * @property {AppSettings} settings
 * @property {ActiveTimer|null} activeTimer
 */

export const SCHEMA_VERSION = 2;
export const WORKOUT_STATUSES = Object.freeze(['planned', 'completed', 'skipped']);
export const SET_RESULT_STATUSES = Object.freeze(['pending', 'completed', 'skipped']);
export const DEFAULT_REST_SECONDS = 90;
export const MIN_REST_SECONDS = 15;
export const MAX_REST_SECONDS = 900;
export const MAX_EXERCISE_SETS = 20;
export const DEFAULT_SERIES_WEEKS = 8;
export const MAX_SERIES_WEEKS = 52;

export const DEFAULT_SETTINGS = Object.freeze({});

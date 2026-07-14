import { describe, expect, it } from 'vitest';
import {
  deleteSeriesAndFollowing,
  materializeSeries,
  splitSeriesAndFollowing,
} from './recurrence.js';
import { normalizeSeries } from './schema.js';

function sequentialIds() {
  let next = 0;
  return (prefix) => `${prefix}-${++next}`;
}

function seriesFixture(idFactory = sequentialIds()) {
  return normalizeSeries({
    id: 'series-a',
    weekdays: [1, 3],
    intervalWeeks: 1,
    startsOn: '2026-07-13',
    endsOn: '2026-07-26',
    planSnapshot: {
      title: 'База',
      time: '18:00',
      exercises: [{ id: 'plan-e', name: 'Присед', sets: 3, plannedReps: '10' }],
    },
  }, { idFactory, today: '2026-07-13' });
}

describe('recurrence materialization', () => {
  it('generates selected weekdays with an inclusive end date', () => {
    const workouts = materializeSeries(seriesFixture(), { idFactory: sequentialIds() });
    expect(workouts.map((workout) => workout.plannedDate)).toEqual([
      '2026-07-13',
      '2026-07-15',
      '2026-07-20',
      '2026-07-22',
    ]);
    expect(workouts.every((workout) => (
      workout.seriesId === 'series-a' && workout.status === 'planned'
    ))).toBe(true);
  });

  it('deduplicates by occurrence identity after reschedule', () => {
    const series = seriesFixture();
    const [moved, ...rest] = materializeSeries(series, { idFactory: sequentialIds() });
    moved.plannedDate = '2026-07-14';
    const generated = materializeSeries(series, {
      existingWorkouts: [moved, ...rest],
      idFactory: sequentialIds(),
    });
    expect(generated).toEqual([]);
  });

  it('splits this-and-following without mutating completed history', () => {
    const series = seriesFixture();
    const workouts = materializeSeries(series, { idFactory: sequentialIds() });
    const completed = {
      ...workouts[1],
      status: 'completed',
      completedAt: '2026-07-16T07:00:00.000Z',
      pointsAwarded: 35,
    };
    const source = [workouts[0], completed, workouts[2], workouts[3]];
    const split = splitSeriesAndFollowing(
      series,
      source,
      '2026-07-15',
      { id: 'series-b', planSnapshot: { title: 'Новая база' } },
      { idFactory: sequentialIds() },
    );

    expect(split.oldSeries.endsOn).toBe('2026-07-14');
    expect(split.newSeries).toMatchObject({ id: 'series-b', startsOn: '2026-07-15' });
    expect(split.workouts.find((workout) => workout.id === completed.id)).toBe(completed);
    expect(split.workouts.filter((workout) => workout.seriesId === 'series-b').map((workout) => workout.occurrenceDate)).toEqual([
      '2026-07-20',
      '2026-07-22',
    ]);
    expect(split.workouts.filter((workout) => workout.seriesId === 'series-b').every((workout) => (
      workout.title === 'Новая база'
    ))).toBe(true);
  });

  it('can move this-and-following to a new recurrence anchor', () => {
    const series = seriesFixture();
    const workouts = materializeSeries(series, { idFactory: sequentialIds() });
    const split = splitSeriesAndFollowing(
      series,
      workouts,
      '2026-07-15',
      { id: 'series-shifted', startsOn: '2026-07-17', weekdays: [5] },
      { idFactory: sequentialIds() },
    );

    expect(split.oldSeries.endsOn).toBe('2026-07-14');
    expect(split.newSeries).toMatchObject({
      id: 'series-shifted',
      startsOn: '2026-07-17',
      weekdays: [5],
    });
    expect(split.workouts
      .filter((workout) => workout.seriesId === 'series-shifted')
      .map((workout) => workout.plannedDate))
      .toEqual(['2026-07-17', '2026-07-24']);
  });

  it('preserves started planned occurrences while replacing untouched following ones', () => {
    const series = seriesFixture();
    const workouts = materializeSeries(series, { idFactory: sequentialIds() });
    const started = {
      ...workouts[1],
      startedAt: '2026-07-15T10:00:00.000Z',
      exercises: workouts[1].exercises.map((exercise) => ({
        ...exercise,
        completedSets: 1,
        setResults: exercise.setResults.map((result, index) => index === 0
          ? { ...result, status: 'completed', completedAt: '2026-07-15T10:01:00.000Z' }
          : result),
      })),
    };
    const split = splitSeriesAndFollowing(
      series,
      [workouts[0], started, workouts[2], workouts[3]],
      '2026-07-15',
      { id: 'series-b', planSnapshot: { title: 'Новая база' } },
      { idFactory: sequentialIds() },
    );

    expect(split.workouts.find((workout) => workout.id === started.id)).toEqual({
      ...started,
      seriesId: null,
    });
    expect(split.newSeries.excludedOccurrenceDates).toContain('2026-07-15');
    expect(split.workouts.filter((workout) => (
      workout.occurrenceDate === '2026-07-15'
    ))).toHaveLength(1);
  });

  it('detaches a protected started occurrence when deleting following instances', () => {
    const series = seriesFixture();
    const workouts = materializeSeries(series, { idFactory: sequentialIds() });
    const started = { ...workouts[1], startedAt: '2026-07-15T10:00:00.000Z' };
    const result = deleteSeriesAndFollowing(
      series,
      [workouts[0], started, workouts[2], workouts[3]],
      '2026-07-15',
    );

    expect(result.series.endsOn).toBe('2026-07-14');
    expect(result.workouts).toContainEqual({ ...started, seriesId: null });
    expect(result.workouts.some((workout) => (
      workout.seriesId === 'series-a'
      && workout.occurrenceDate >= '2026-07-15'
    ))).toBe(false);
  });
});

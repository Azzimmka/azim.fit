import { useMemo, useState } from 'react';
import { ChevronRight, Plus, Search, Sparkles } from 'lucide-react';
import {
  EXERCISE_CATEGORIES,
  searchExerciseLibrary,
} from '../../../domain/exerciseCatalog.js';
import { selectRecentExercises } from '../../../domain/exerciseDefaults.js';

export function ExercisePicker({ appState = {}, onSelect, onCreateCustom, inputRef }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const recent = useMemo(() => selectRecentExercises(appState, 6), [appState]);
  const results = useMemo(() => searchExerciseLibrary(
    query,
    appState.customExercises ?? [],
    { category },
  ), [appState.customExercises, category, query]);

  return (
    <div className="exercise-picker">
      <label className="exercise-search">
        <span className="visually-hidden">Найти упражнение</span>
        <Search size={19} aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Найти упражнение"
          autoComplete="off"
        />
      </label>

      {!query && recent.length > 0 && (
        <section className="exercise-picker-section" aria-labelledby="recent-exercises-title">
          <div className="picker-section-heading">
            <Sparkles size={17} aria-hidden="true" />
            <h3 id="recent-exercises-title">Недавние</h3>
          </div>
          <div className="recent-exercise-list">
            {recent.map((item) => (
              <button type="button" key={item.key} onClick={() => onSelect(item)}>
                <span>{item.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="exercise-category-list" role="group" aria-label="Категории упражнений">
        <button type="button" className={!category ? 'active' : ''} aria-pressed={!category} onClick={() => setCategory('')}>Все</button>
        {EXERCISE_CATEGORIES.map((item) => (
          <button
            type="button"
            key={item.id}
            className={category === item.id ? 'active' : ''}
            aria-pressed={category === item.id}
            onClick={() => setCategory(item.id)}
          >
            {item.label}
          </button>
        ))}
        {(appState.customExercises?.length ?? 0) > 0 && (
          <button type="button" className={category === 'custom' ? 'active' : ''} aria-pressed={category === 'custom'} onClick={() => setCategory('custom')}>Свои</button>
        )}
      </div>

      <div className="exercise-library-list" aria-live="polite">
        {results.map((item) => (
          <button type="button" className="exercise-library-item" key={item.key} onClick={() => onSelect(item)}>
            <span className={`exercise-library-icon ${item.category}`} aria-hidden="true">
              {item.name.slice(0, 1)}
            </span>
            <span>
              <strong>{item.name}</strong>
              <small>{item.structure === 'continuous' ? 'Непрерывно' : 'Подходы'}</small>
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        ))}
        {results.length === 0 && (
          <p className="picker-empty">Ничего не найдено. Можно создать своё упражнение.</p>
        )}
      </div>

      <button type="button" className="create-custom-exercise" onClick={onCreateCustom}>
        <Plus size={19} aria-hidden="true" />
        <span><strong>Создать своё упражнение</strong><small>Оно останется в твоей библиотеке</small></span>
      </button>
    </div>
  );
}

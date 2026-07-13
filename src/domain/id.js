let fallbackCounter = 0;

/** @returns {string} */
export function createId(prefix = 'id') {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  fallbackCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackCounter.toString(36)}`;
}

/**
 * Wraps an optional id factory while keeping prefixes consistent.
 * @param {((prefix?: string) => string)|undefined} idFactory
 * @param {string} prefix
 */
export function makeId(idFactory, prefix) {
  const id = idFactory ? idFactory(prefix) : createId(prefix);
  return String(id || createId(prefix));
}


const PERSIST_ATTEMPT_KEY = 'azim-fit-persistence-requested-v2';

const readAttemptFlag = (storage) => {
  try {
    return storage?.getItem(PERSIST_ATTEMPT_KEY) === '1';
  } catch {
    return false;
  }
};

const writeAttemptFlag = (storage) => {
  try {
    storage?.setItem(PERSIST_ATTEMPT_KEY, '1');
  } catch {
    // Storage can be unavailable in private or restricted browsing contexts.
  }
};

/**
 * Best-effort request for persistent browser storage.
 * Call after a successful install or the first saved local change.
 *
 * @param {{ force?: boolean, storageManager?: StorageManager, storage?: Storage }} options
 */
export async function requestPersistentStorage(options = {}) {
  const storageManager = options.storageManager ?? globalThis.navigator?.storage;
  const storage = options.storage ?? globalThis.localStorage;

  if (!storageManager?.persist || !storageManager?.persisted) {
    return { supported: false, persisted: false, requested: false };
  }

  try {
    if (await storageManager.persisted()) {
      return { supported: true, persisted: true, requested: false };
    }

    if (!options.force && readAttemptFlag(storage)) {
      return { supported: true, persisted: false, requested: false };
    }

    writeAttemptFlag(storage);
    const persisted = await storageManager.persist();
    return { supported: true, persisted, requested: true };
  } catch (error) {
    return { supported: true, persisted: false, requested: false, error };
  }
}

export { PERSIST_ATTEMPT_KEY };

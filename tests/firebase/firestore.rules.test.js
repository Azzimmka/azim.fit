import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const projectId = 'azim-fit-rules-test';
let testEnvironment;

before(async () => {
  const rules = await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8');
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: { rules },
  });
});

beforeEach(async () => {
  await testEnvironment.clearFirestore();
});

after(async () => {
  await testEnvironment.cleanup();
});

test('verified user can read and write only their own tree', async () => {
  const alice = testEnvironment.authenticatedContext('alice', {
    email: 'alice@example.com',
    email_verified: true,
  }).firestore();
  const bob = testEnvironment.authenticatedContext('bob', {
    email: 'bob@example.com',
    email_verified: true,
  }).firestore();

  await assertSucceeds(setDoc(doc(alice, 'users/alice'), {
    uid: 'alice',
    email: 'alice@example.com',
    schemaVersion: 3,
    avatarId: 'avatar-04',
    avatarSource: 'generated',
    googlePhotoURL: null,
  }));
  await assertSucceeds(setDoc(doc(alice, 'users/alice/workouts/workout-1'), {
    id: 'workout-1',
    title: 'Силовая',
  }));
  await assertSucceeds(setDoc(doc(alice, 'users/alice/customExercises/run'), {
    id: 'run',
    name: 'Бег',
    structure: 'continuous',
    target: { kind: 'distance', value: 3000, unit: 'meters' },
  }));
  await assertSucceeds(setDoc(doc(alice, 'users/alice/meta/app'), {
    schemaVersion: 3,
    settings: {},
    activeTimer: null,
    activeContinuousSession: null,
  }));
  await assertFails(getDoc(doc(bob, 'users/alice/workouts/workout-1')));
  await assertFails(setDoc(doc(bob, 'users/alice/workouts/intruder'), {
    id: 'intruder',
    title: 'Чужая запись',
  }));
  await assertFails(setDoc(doc(alice, 'users/alice/workouts/path-id'), {
    id: 'different-id',
    title: 'Несовпадающий ID',
  }));
  await assertFails(setDoc(doc(alice, 'users/alice'), {
    uid: 'bob',
    email: 'alice@example.com',
    schemaVersion: 3,
  }));
  await assertFails(setDoc(doc(alice, 'users/alice'), {
    uid: 'alice',
    email: 'alice@example.com',
    schemaVersion: 3,
    role: 'admin',
  }));
  await assertFails(setDoc(doc(alice, 'users/alice/customExercises/path-id'), {
    id: 'different-id',
    name: 'Неверный ID',
  }));
  await assertFails(setDoc(doc(alice, 'users/alice/meta/app'), {
    schemaVersion: 2,
    settings: {},
    activeTimer: null,
    activeContinuousSession: null,
  }));
  await assertFails(setDoc(doc(alice, 'public/config'), { enabled: true }));
  assert.equal((await getDoc(doc(alice, 'users/alice/workouts/workout-1'))).data().title, 'Силовая');
});

test('anonymous and unverified users cannot access cloud data', async () => {
  const anonymous = testEnvironment.unauthenticatedContext().firestore();
  const unverified = testEnvironment.authenticatedContext('alice', {
    email: 'alice@example.com',
    email_verified: false,
  }).firestore();

  await assertFails(getDoc(doc(anonymous, 'users/alice')));
  await assertFails(setDoc(doc(unverified, 'users/alice'), {
    uid: 'alice',
    email: 'alice@example.com',
  }));
  await assertFails(setDoc(doc(unverified, 'users/alice/workouts/workout-1'), {
    id: 'workout-1',
    title: 'Без подтверждения',
  }));
});

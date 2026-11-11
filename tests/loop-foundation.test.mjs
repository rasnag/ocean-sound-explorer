import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveLoopConfig} from '../lib/loop/environment.mjs';
import {isSyntheticPreviewEnabled} from '../lib/loop/client-mode.mjs';

const local = {LOOP_ENV: 'local-synthetic'};

test('exact local mode returns disconnected adapters and does not mutate input', () => {
  const input = Object.freeze({...local});
  assert.deepEqual(resolveLoopConfig(input), {
    mode: 'local-synthetic',
    external: {ai: false, email: false, database: false, storage: false},
  });
  const changed = resolveLoopConfig(input);
  changed.external.ai = true;
  assert.equal(resolveLoopConfig(input).external.ai, false);
});

test('missing, unknown, preview and production environments fail closed', () => {
  for (const input of [undefined, null, [], {}, {LOOP_ENV: 'production'},
    {LOOP_ENV: 'preview'}, {LOOP_ENV: 'development'},
    {LOOP_ENV: 'LOCAL-SYNTHETIC'}, {LOOP_ENV: 'local-synthetic '}]) {
    assert.throws(() => resolveLoopConfig(input));
  }
});

test('connections, private browser variables and enabled adapters are refused', () => {
  const forbidden = [
    {LOOP_DB_URL: 'postgres://remote.invalid/db'},
    {LOOP_RECOVERY_DB_URL: 'postgres://remote.invalid/recovery'},
    {DATABASE_URL: 'postgres://remote.invalid/db'},
    {LOOP_STORAGE_BUCKET: 'remote-bucket'},
    {LOOP_AUTH_PROJECT: 'remote-project'},
    {LOOP_WORKER_CREDENTIAL: 'invented-test-credential'},
    {VITE_LOOP_WORKER_CREDENTIAL: 'invented-test-credential'},
    {VITE_DATABASE_URL: 'https://remote.invalid'},
    {SMTP_URL: 'smtp://remote.invalid'},
    {LOOP_AI_ALLOWED: 'true'}, {LOOP_AI_ALLOWED: true},
    {LOOP_AI_ALLOWED: '1'}, {LOOP_AI_ALLOWED: 'yes'},
    {LOOP_SMTP_ALLOWED: 'true'}, {LOOP_SMTP_ALLOWED: true},
    {LOOP_SMTP_ALLOWED: '1'},
  ];
  for (const settings of forbidden) {
    assert.throws(() => resolveLoopConfig({...local, ...settings}));
  }
  assert.doesNotThrow(() => resolveLoopConfig({
    ...local, LOOP_AI_ALLOWED: 'false', LOOP_SMTP_ALLOWED: '0',
  }));
});

test('configuration rejection never includes the rejected value', () => {
  const invented = 'invented-private-value-for-negative-test';
  assert.throws(() => resolveLoopConfig({...local, LOOP_DB_URL: invented}),
    error => !error.message.includes(invented));
});

test('preview requires every exact flag and remains off in production', () => {
  assert.equal(isSyntheticPreviewEnabled({DEV: true, MODE: 'development', VITE_LOOP_PREVIEW: '1'}), true);
  for (const input of [undefined, {},
    {DEV: true, MODE: 'development'},
    {DEV: 'true', MODE: 'development', VITE_LOOP_PREVIEW: '1'},
    {DEV: false, MODE: 'development', VITE_LOOP_PREVIEW: '1'},
    {DEV: true, MODE: 'production', VITE_LOOP_PREVIEW: '1'},
    {DEV: false, MODE: 'production', VITE_LOOP_PREVIEW: '1'},
    {DEV: true, MODE: 'preview', VITE_LOOP_PREVIEW: '1'},
    {DEV: true, MODE: 'development', VITE_LOOP_PREVIEW: true},
    {DEV: true, MODE: 'development', VITE_LOOP_PREVIEW: '0'},
  ]) assert.equal(isSyntheticPreviewEnabled(input), false);
});

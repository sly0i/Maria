import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidUrl,
  normalizeHexColor,
  buildPanelPayload,
  validatePanelPayload,
  ALLOWED_INTERVALS_MINUTES,
  createPanelSchedule,
  listPanelSchedules,
  stopPanelSchedule,
  processDuePanelSchedules,
} from '../../src/services/panelScheduleService.js';

function createMemoryClient(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    db: {
      async get(key, defaultValue = null) {
        if (!store.has(key)) return defaultValue;
        return structuredClone(store.get(key));
      },
      async set(key, value) {
        store.set(key, structuredClone(value));
        return true;
      },
    },
    guilds: { cache: new Map() },
    _store: store,
  };
}

test('normalizeHexColor accepts #RRGGBB and RRGGBB', () => {
  assert.equal(normalizeHexColor('#5865F2'), '#5865F2');
  assert.equal(normalizeHexColor('57F287'), '#57F287');
  assert.equal(normalizeHexColor('red'), null);
});

test('isValidUrl accepts http/https only', () => {
  assert.equal(isValidUrl('https://cdn.discordapp.com/image.png'), true);
  assert.equal(isValidUrl('ftp://example.com/a.jpg'), false);
});

test('buildPanelPayload converts escaped newlines', () => {
  const payload = buildPanelPayload({ description: 'Line 1\\nLine 2', title: 'Hi' });
  assert.equal(payload.description, 'Line 1\nLine 2');
  assert.equal(validatePanelPayload(payload), null);
});

test('validatePanelPayload rejects empty and bad urls', () => {
  assert.match(validatePanelPayload({}), /at least one/i);
  assert.match(
    validatePanelPayload(buildPanelPayload({ title: 'x', image: 'not-a-url' })),
    /image/i
  );
});

test('allowed intervals are only 5 and 10 minutes', () => {
  assert.deepEqual(ALLOWED_INTERVALS_MINUTES, [5, 10]);
});

test('create/list/stop panel schedules', async () => {
  const client = createMemoryClient();
  const schedule = await createPanelSchedule(client, {
    guildId: 'g1',
    channelId: 'c1',
    createdBy: 'u1',
    intervalMinutes: 5,
    payload: buildPanelPayload({ title: 'Rules', description: 'Read me' }),
  });

  assert.equal(schedule.intervalMinutes, 5);
  assert.equal((await listPanelSchedules(client, 'g1')).length, 1);

  const stopped = await stopPanelSchedule(client, 'g1', schedule.id);
  assert.equal(stopped, schedule.id);
  assert.equal((await listPanelSchedules(client, 'g1')).length, 0);
});

test('processDuePanelSchedules is a no-op without due guild schedules', async () => {
  const client = createMemoryClient();
  const result = await processDuePanelSchedules(client);
  assert.deepEqual(result, { processed: 0, sent: 0, failed: 0 });
});

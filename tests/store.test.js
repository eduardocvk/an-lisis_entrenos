import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { localLoad, localSave, client, cloudNotes } from '../src/store.js';

test('IndexedDB conserva el diario al guardar y permite recuperar la biblioteca', async () => {
  const activity = { id: 'run-20260101100000', notes: 'Buena sesión', rpe: 6, points: [{ t: 0, d: 0 }] };
  await localSave([activity]);
  const loaded = await localLoad();
  assert.equal(loaded[0].notes, activity.notes);
  await localSave([{ ...activity, notes: 'Actualizada' }]);
  assert.equal((await localLoad()).length, 1);
  assert.equal((await localLoad())[0].notes, 'Actualizada');
});
test('El navegador rechaza claves administrativas y URLs sin HTTPS', () => {
  assert.throws(() => client({ url: 'https://example.supabase.co', key: 'sb_secret_test' }), /secreta/);
  const jwt = `x.${btoa(JSON.stringify({ role: 'service_role' }))}.x`;
  assert.throws(() => client({ url: 'https://example.supabase.co', key: jwt }), /service_role/);
  assert.throws(() => client({ url: 'http://example.supabase.co', key: 'test' }), /HTTPS/);
});
test('El guardado de diario solo envía campos del diario y propaga fallos', async () => {
  let sent;
  const mock = {
    rpc: async (name, args) => {
      sent = { name, args };
      return { data: null, error: null };
    },
  };
  await cloudNotes(mock, { id: 'run-20260101100000', rpe: 5, tags: 'Rodaje', notes: 'Bien', distance: 9999 });
  assert.equal(sent.name, 'save_activity_diary');
  assert.deepEqual(Object.keys(sent.args).sort(), ['p_id', 'p_notes', 'p_rpe', 'p_tags']);
  await assert.rejects(
    () => cloudNotes({ rpc: async () => ({ error: new Error('Sin permiso') }) }, {}),
    /Sin permiso/,
  );
});

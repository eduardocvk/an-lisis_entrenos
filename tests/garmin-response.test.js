import test from 'node:test';
import assert from 'node:assert/strict';
import { readGarminToken, readGarminJson } from '../scripts/garmin-response.js';

const jwt = (exp) =>
  ['synthetic', Buffer.from(JSON.stringify({ exp })).toString('base64url'), 'signature'].join('.');
test('El endpoint de token devuelve texto JWT, no un objeto JSON', async () => {
  const token = jwt(2000);
  assert.equal(await readGarminToken(new Response(` ${token}\n`), 1000000), token);
});
test('Rechaza tokens inválidos o caducados sin revelar su contenido', async () => {
  for (const body of ['CONFIDENTIAL-RESPONSE', jwt(1), 'header.notjson.signature']) {
    await assert.rejects(
      () => readGarminToken(new Response(body), 1000000),
      (error) => {
        assert.equal(error.message, 'Garmin no devolvió un token de acceso válido y vigente.');
        assert.ok(!error.message.includes(body));
        return true;
      },
    );
  }
});
test('Un error de JSON no incluye fragmentos de datos personales', async () => {
  await assert.rejects(
    () => readGarminJson(new Response('PRIVATE-HEALTH-DATA')),
    (error) => {
      assert.ok(!error.message.includes('PRIVATE-HEALTH-DATA'));
      return true;
    },
  );
  assert.deepEqual(await readGarminJson(new Response('[]')), []);
});

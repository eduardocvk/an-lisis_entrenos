import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceGroups, chartSessions } from '../src/chart-sessions.js';
const runs = [
  { id: 'a', start: '2025-12-31T12:00:00Z', distance: 3000, avgHr: 140 },
  { id: 'b', start: '2026-01-01T12:00:00Z', distance: 7000, avgHr: null },
  { id: 'c', start: '2026-03-01T12:00:00Z', distance: 5000, avgHr: 150 },
];
test('La distancia semanal suma cada sesión una vez, también entre años', () => {
  const weeks = distanceGroups(runs, 'week');
  assert.equal(weeks[0].key, '2025-12-29');
  assert.equal(weeks[0].distance, 10000);
  assert.deepEqual(
    weeks[0].sessions.map((a) => a.id),
    ['a', 'b'],
  );
  assert.equal(
    weeks.reduce((s, g) => s + g.distance, 0),
    15000,
  );
});
test('Cambiar mes/año conserva el total y los meses sin actividad', () => {
  const months = distanceGroups(runs, 'month');
  assert.deepEqual(
    months.map((g) => g.key),
    ['2025-12', '2026-01', '2026-02', '2026-03'],
  );
  assert.equal(months[2].distance, 0);
  assert.equal(months[2].sessions.length, 0);
  assert.deepEqual(
    distanceGroups(runs, 'year').map((g) => g.distance),
    [3000, 12000],
  );
  assert.deepEqual(distanceGroups([]), []);
});
test('Un punto de rendimiento no confunde sesiones sin pulso; un día agrupa sus carreras', () => {
  assert.deepEqual(
    chartSessions('efficiency', { dataIndex: 1 }, runs, []).map((a) => a.id),
    ['c'],
  );
  assert.deepEqual(
    chartSessions('recovery-training', { name: '2026-01-01' }, runs, []).map((a) => a.id),
    ['b'],
  );
  assert.deepEqual(
    chartSessions('weekly', { dataIndex: 0 }, runs, []).map((a) => a.id),
    ['a', 'b'],
  );
});

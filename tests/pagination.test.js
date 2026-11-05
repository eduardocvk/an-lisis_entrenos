import test from 'node:test';
import assert from 'node:assert/strict';
import { paginate } from '../src/pagination.js';
import { periodLabel } from '../src/chart-sessions.js';
test('La tabla presenta como máximo 50 sesiones sin saltos ni duplicados', () => {
  const items = Array.from({ length: 123 }, (_, i) => i);
  assert.deepEqual(
    [0, 1, 2].flatMap((p) => paginate(items, p).items),
    items,
  );
  assert.equal(paginate(items).items.length, 50);
  assert.equal(paginate(items, 2).items.length, 23);
  assert.equal(paginate(items, 20).page, 2);
  assert.equal(paginate([], 5).first, 0);
  assert.equal(paginate(items.slice(0, 3), 2).page, 0);
});
test('Los periodos semanales indican el año ISO correcto al cambiar de año', () => {
  assert.equal(periodLabel('2025-12-29', 'week'), 'Semana 1 · 2026');
  assert.equal(periodLabel('2020-12-28', 'week'), 'Semana 53 · 2020');
  assert.equal(periodLabel('2026-02', 'month'), 'febrero de 2026');
  assert.equal(periodLabel('2026', 'year'), '2026');
});

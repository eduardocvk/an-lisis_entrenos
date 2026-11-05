import test from 'node:test';
import assert from 'node:assert/strict';
import { Encoder, Profile } from '@garmin/fitsdk';
import {
  pace,
  dayKey,
  weekly,
  zoneSeconds,
  drift,
  bestEffort,
  routeSegments,
  terrain,
} from '../src/analysis.js';
import { normalize, parseFit, parseFile } from '../src/import.js';

// All data below is synthetic and isolated from the application/production data.
const points = Array.from({ length: 1201 }, (_, t) => ({
  t,
  d: t * 3,
  hr: 150,
  alt: 100,
  segment: 0,
  lat: 40 + t * 0.00001,
  lon: -3,
  moving: true,
}));
test('El cambio de día se calcula en Madrid, también en verano', () => {
  assert.equal(dayKey('2026-06-01T22:30:00Z'), '2026-06-02');
  assert.equal(dayKey('2026-01-01T22:30:00Z'), '2026-01-01');
});
test('Ritmo redondea sin producir segundos 60 y respeta ausencias', () => {
  assert.equal(pace(299.6), '5:00');
  assert.equal(pace(null), '—');
});
test('Las semanas son de lunes y las semanas vacías no desaparecen', () => {
  const rows = weekly([
    { start: '2026-01-04T10:00Z', distance: 5000, duration: 1500, ascent: 0, rpe: 5 },
    { start: '2026-01-19T10:00Z', distance: 6000, duration: 1800 },
  ]);
  assert.deepEqual(
    rows.map((r) => r.date),
    ['2025-12-29', '2026-01-05', '2026-01-12', '2026-01-19'],
  );
  assert.equal(rows[0].load, 125);
  assert.equal(rows[1].count, 0);
});
test('Las zonas ponderan por tiempo y excluyen pausas y huecos', () => {
  const input = [
    { t: 0, hr: 120 },
    { t: 10, hr: 150 },
    { t: 20, hr: 170, moving: false },
    { t: 30, hr: 180 },
    { t: 100, hr: 180 },
    { t: 110, hr: 180 },
  ];
  assert.deepEqual(zoneSeconds(input, [130, 145, 160, 175]), [10, 0, 0, 0, 10]);
});
test('Deriva cero a esfuerzo estable; detecta una pérdida de eficiencia', () => {
  assert.equal(drift(points), 0);
  const changed = points.map((p) => ({ ...p, hr: p.t >= 600 ? 165 : 150 }));
  assert.ok(drift(changed) > 8);
  assert.equal(drift(points.slice(0, 100)), null);
});
test('Mejor esfuerzo interpola la distancia y no inventa marcas largas', () => {
  assert.ok(Math.abs(bestEffort(points, 1000) - 1000 / 3) < 0.01);
  assert.equal(bestEffort(points, 5000), null);
});
test('El mapa corta huecos, puntos sin GPS y saltos', () => {
  const input = [
    { t: 0, lat: 40, lon: -3 },
    { t: 1, lat: 40.0001, lon: -3 },
    { t: 400, lat: 41, lon: -3 },
    { t: 401, lat: 41.0001, lon: -3 },
    { t: 402, lat: null, lon: null },
  ];
  assert.deepEqual(
    routeSegments(input).map((s) => s.length),
    [2, 2],
  );
});
test('El terreno separa sesiones en lugar de conectar sus altitudes', () => {
  const groups = terrain([
    ...points.slice(0, 200),
    ...points.slice(0, 200).map((p) => ({ ...p, segment: 1, alt: 500 })),
  ]);
  assert.equal(groups[2].meters, 0);
  assert.ok(groups[1].meters > 0);
});
test('Identidad estable entre formatos y sin coordenadas nulas convertidas a cero', () => {
  const a = normalize({
    name: 'A',
    start: '2026-01-01T10:00Z',
    points: [
      { t: 0, d: 0 },
      { t: 100, d: 300 },
    ],
  });
  const b = normalize({
    name: 'B',
    start: '2026-01-01T10:00Z',
    points: [
      { t: 0, d: 0 },
      { t: 100, d: 300 },
    ],
  });
  assert.equal(a.id, b.id);
  assert.equal(a.avgHr, null);
  assert.equal(a.ascent, null);
  assert.throws(() => normalize({ start: 'invalid', points: [] }), /fecha/);
  assert.throws(() => normalize({ start: '2026-01-01', sport: 'cycling', points: [] }), /carrera/);
});
export function makeFit() {
  const encoder = new Encoder(),
    start = new Date('2026-01-01T10:00:00Z');
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.FILE_ID,
    type: 'activity',
    manufacturer: 'development',
    timeCreated: start,
  });
  for (let i = 0; i <= 120; i++)
    encoder.writeMesg({
      mesgNum: Profile.MesgNum.RECORD,
      timestamp: new Date(+start + i * 10 * 1000),
      distance: i * 30,
      heartRate: 150,
      cadence: 85,
      positionLat: Math.round(((40 + i * 0.00001) * 2147483648) / 180),
      positionLong: Math.round((-3 * 2147483648) / 180),
      altitude: 100,
    });
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.LAP,
    startTime: start,
    timestamp: new Date(+start + 1200000),
    totalDistance: 3600,
    totalTimerTime: 1200,
    avgHeartRate: 150,
    intensity: 'active',
  });
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.SESSION,
    startTime: start,
    timestamp: new Date(+start + 1200000),
    sport: 'running',
    totalDistance: 3600,
    totalTimerTime: 1200,
    totalAscent: 10,
    avgHeartRate: 150,
  });
  return encoder.close();
}
test('FIT real codificado con SDK: fecha, unidades, cadencia y vueltas', () => {
  const run = parseFit(makeFit(), 'Prueba sintética');
  assert.equal(run.distance, 3600);
  assert.equal(run.duration, 1200);
  assert.equal(run.avgHr, 150);
  assert.equal(run.points[0].cadence, 170);
  assert.ok(Math.abs(run.points[0].lat - 40) < 0.0001);
  assert.equal(run.laps.length, 1);
  assert.equal(run.start, '2026-01-01T10:00:00.000Z');
});
test('Rechaza FIT dañado', () => {
  const bytes = makeFit();
  bytes[20] ^= 255;
  assert.throws(() => parseFit(bytes), /incompleto/);
});
test('Copia JSON conserva diario y valida formato', async () => {
  const run = normalize({
    start: '2026-01-01T10:00Z',
    points: [
      { t: 0, d: 0 },
      { t: 100, d: 300 },
    ],
  });
  run.rpe = 7;
  run.notes = 'Sensaciones';
  const file = new File(
    [JSON.stringify({ format: 'rastro-backup', version: 1, activities: [run] })],
    'backup.json',
  );
  const result = await parseFile(file);
  assert.equal(result[0].notes, 'Sensaciones');
  assert.equal(result[0].rpe, 7);
  assert.equal(result[0].distance, 300);
  await assert.rejects(() => parseFile(new File(['{}'], 'bad.json')), /copia/);
});

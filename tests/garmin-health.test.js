import test from 'node:test';
import assert from 'node:assert/strict';
import { healthMetrics } from '../scripts/garmin-health.js';

test('La Personal API entrega sueño sin wrapper y pulso dentro de heartRate', () => {
  assert.deepEqual(
    healthMetrics({
      sleep: { sleepTimeSeconds: 27000 },
      hrv: { hrvSummary: { lastNightAvg: 42 } },
      daily: { data: [{ heartRate: { restingValue: 52 } }] },
    }),
    { sleep_hours: 7.5, hrv: 42, resting_hr: 52 },
  );
});
test('Mantiene compatibilidad con DTO y excluye ausencias o valores inválidos', () => {
  assert.deepEqual(
    healthMetrics({
      sleep: { dailySleepDTO: { sleepTimeSeconds: 3600 } },
      daily: { data: [{ restingHeartRate: 60 }] },
    }),
    { sleep_hours: 1, resting_hr: 60 },
  );
  assert.deepEqual(healthMetrics({}), {});
  assert.deepEqual(
    healthMetrics({
      sleep: { sleepTimeSeconds: -1 },
      hrv: { hrvSummary: { lastNightAvg: 0 } },
      daily: { data: [{ heartRate: { restingValue: NaN } }] },
    }),
    {},
  );
});

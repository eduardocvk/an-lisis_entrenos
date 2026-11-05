import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { parseGpx } from '../src/import.js';
import { routeSegments, intervalStats } from '../src/analysis.js';
globalThis.DOMParser = new JSDOM('').window.DOMParser;
const xml = `<gpx xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><trk><name>Prueba sintética</name><trkseg><trkpt lat="40" lon="-3"><time>2026-01-01T10:00:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>145</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt><trkpt lat="40.001" lon="-3"><time>2026-01-01T10:01:00Z</time></trkpt></trkseg><trkseg><trkpt lat="41" lon="-3"><time>2026-01-01T10:03:00Z</time></trkpt><trkpt lat="41.001" lon="-3"><time>2026-01-01T10:04:00Z</time></trkpt></trkseg></trk></gpx>`;
test('GPX con namespaces conserva pulso y separa segmentos sin sumar el salto', () => {
  const a = parseGpx(xml, 'test.gpx');
  assert.equal(a.name, 'Prueba sintética');
  assert.equal(a.points[0].hr, 145);
  assert.equal(a.points[1].hr, null);
  assert.equal(a.points[1].alt, null);
  assert.ok(a.distance > 220 && a.distance < 225);
  assert.equal(a.duration, 240);
  assert.equal(routeSegments(a.points).length, 2);
});
test('GPX sin tiempos y XML roto dan errores explícitos', () => {
  assert.throws(
    () => parseGpx('<gpx><trk><trkseg><trkpt lat="40" lon="-3"/></trkseg></trk></gpx>', 'test.gpx'),
    /fecha y hora/,
  );
  assert.throws(() => parseGpx('<gpx>', 'bad.gpx'), /XML/);
});
test('Intervalos solo comparan repeticiones activas de distancia equivalente', () => {
  const equal = [
    { kind: 'active', distance: 400, duration: 100 },
    { kind: 'rest', distance: 100, duration: 90 },
    { kind: 'active', distance: 400, duration: 110 },
  ];
  assert.equal(intervalStats(equal).count, 2);
  assert.ok(Math.abs(intervalStats(equal).change - 10) < 1e-8);
  assert.equal(intervalStats([{ ...equal[0], distance: 100 }, equal[2]]), null);
});

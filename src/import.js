import { Decoder, Stream } from '@garmin/fitsdk';
import { unzipSync } from 'fflate';
import { finite, mean, haversine, hasGPS } from './analysis.js';

const number = (value) =>
  value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const degrees = (value) => (finite(value) ? (value * 180) / 2147483648 : null);
export function normalize({ name, start, points, laps = [], summary = {}, sport = 'running' }) {
  const stamp = new Date(start).getTime();
  if (!Number.isFinite(stamp)) throw new Error('La actividad no tiene una fecha válida.');
  if (!['running', 'trail', 'trailRunning', 'treadmill'].includes(sport))
    throw new Error('Solo se admiten actividades de carrera.');
  points = points.filter((p) => finite(p.t)).sort((a, b) => a.t - b.t);
  let distance = 0,
    previous = null;
  points = points.map((p) => {
    if (!finite(p.d)) {
      if (
        previous &&
        hasGPS(p) &&
        hasGPS(previous) &&
        p.segment === previous.segment &&
        p.t - previous.t <= 120
      ) {
        const dd = haversine(previous, p);
        if (dd < 500) distance += dd;
      }
    } else distance = Math.max(distance, p.d);
    previous = p;
    return { ...p, d: distance };
  });
  const total = number(summary.distance) ?? points.at(-1)?.d ?? 0;
  const elapsed = points.length > 1 ? points.at(-1).t - points[0].t : 0;
  const seconds = number(summary.duration) ?? elapsed;
  if (total <= 0 || seconds <= 0)
    throw new Error('No hay distancia y duración suficientes para analizar esta actividad.');
  // Stable across FIT/GPX imports and Garmin downloads; avoids duplicate copies of a run.
  const id = `run-${new Date(stamp)
    .toISOString()
    .replace(/[^0-9]/g, '')
    .slice(0, 14)}`;
  return {
    id,
    name: String(name || 'Carrera').slice(0, 200),
    start: new Date(stamp).toISOString(),
    sport,
    distance: total,
    duration: seconds,
    ascent: number(summary.ascent),
    avgHr: number(summary.avgHr) ?? mean(points.map((p) => p.hr)),
    points,
    laps,
    source: summary.source || 'archivo',
    rpe: null,
    notes: '',
    tags: '',
    schemaVersion: 1,
  };
}
export function parseFit(bytes, name = 'Carrera') {
  const decoder = new Decoder(Stream.fromByteArray(bytes));
  if (!decoder.isFIT() || !decoder.checkIntegrity())
    throw new Error('El archivo FIT no es válido o está incompleto.');
  const { messages, errors } = decoder.read();
  if (errors.length) throw new Error('No se ha podido decodificar el FIT completo.');
  const sessions = messages.sessionMesgs || [];
  if (sessions.length !== 1)
    throw new Error('Se admite una sesión de carrera por FIT; separa los archivos multideporte.');
  const session = sessions[0];
  const start = session.startTime;
  const origin = new Date(start).getTime();
  const timer = (messages.eventMesgs || [])
    .filter((e) => e.event === 'timer')
    .sort((a, b) => +a.timestamp - +b.timestamp);
  let eventIndex = 0,
    moving = true;
  const points = (messages.recordMesgs || []).map((p) => {
    while (eventIndex < timer.length && +timer[eventIndex].timestamp <= +p.timestamp) {
      moving = timer[eventIndex].eventType === 'start';
      eventIndex++;
    }
    return {
      t: (+p.timestamp - origin) / 1000,
      d: number(p.distance),
      lat: degrees(p.positionLat),
      lon: degrees(p.positionLong),
      hr: number(p.heartRate),
      alt: number(p.enhancedAltitude ?? p.altitude),
      speed: number(p.enhancedSpeed ?? p.speed),
      cadence: finite(p.cadence) ? p.cadence * 2 : null,
      power: number(p.power),
      moving,
      segment: 0,
    };
  });
  const sport =
    session.sport === 'running' && session.subSport === 'trail'
      ? 'trailRunning'
      : session.sport === 'running' && session.subSport === 'treadmill'
        ? 'treadmill'
        : session.sport;
  return normalize({
    name,
    start,
    points,
    sport,
    summary: {
      distance: session.totalDistance,
      duration: session.totalTimerTime,
      ascent: session.totalAscent,
      avgHr: session.avgHeartRate,
      source: 'FIT',
    },
    laps: (messages.lapMesgs || []).map((l, i) => ({
      number: i + 1,
      distance: l.totalDistance,
      duration: l.totalTimerTime,
      avgHr: l.avgHeartRate ?? null,
      kind: l.intensity || 'lap',
    })),
  });
}
export function parseGpx(text, filename) {
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('El GPX contiene XML inválido.');
  const get = (el, tag) => [...el.getElementsByTagName('*')].find((n) => n.localName === tag)?.textContent;
  const segments = [...xml.getElementsByTagNameNS('*', 'trkseg')];
  let origin = null;
  const points = [];
  segments.forEach((segment, index) =>
    [...segment.getElementsByTagNameNS('*', 'trkpt')].forEach((el) => {
      const raw = get(el, 'time');
      const timestamp = raw ? Date.parse(raw) : NaN;
      if (!Number.isFinite(timestamp))
        throw new Error('El GPX necesita fecha y hora en todos los puntos para analizar el entrenamiento.');
      origin ??= timestamp;
      points.push({
        t: (timestamp - origin) / 1000,
        lat: number(el.getAttribute('lat')),
        lon: number(el.getAttribute('lon')),
        alt: number(get(el, 'ele')),
        hr: number(get(el, 'hr')),
        cadence: null,
        power: null,
        segment: index,
      });
    }),
  );
  if (origin === null) throw new Error('El GPX no contiene una traza de entrenamiento con tiempos.');
  return normalize({ name: get(xml.querySelector('trk') || xml, 'name') || filename, start: origin, points });
}
export async function parseFile(file) {
  if (file.size > 60 * 1024 * 1024)
    throw new Error('El archivo supera 60 MB. Importa las actividades por separado.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (/\.fit$/i.test(file.name)) return [parseFit(bytes, file.name.replace(/\.fit$/i, ''))];
  if (/\.gpx$/i.test(file.name)) return [parseGpx(new TextDecoder().decode(bytes), file.name)];
  if (/\.zip$/i.test(file.name)) {
    let size = 0;
    const files = unzipSync(bytes, {
      filter: (f) => {
        size += f.originalSize;
        if (size > 200 * 1024 * 1024) throw new Error('El ZIP descomprimido supera 200 MB.');
        return /\.fit$/i.test(f.name);
      },
    });
    const runs = Object.entries(files).map(([name, data]) => parseFit(data, name));
    if (!runs.length) throw new Error('El ZIP no contiene archivos FIT.');
    return runs;
  }
  if (/\.json$/i.test(file.name)) {
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (data.format !== 'rastro-backup' || data.version !== 1 || !Array.isArray(data.activities))
      throw new Error('Utiliza una copia exportada desde Rastro.');
    return data.activities.map((a) => {
      const normalized = normalize({
        ...a,
        summary: {
          distance: a.distance,
          duration: a.duration,
          ascent: a.ascent,
          avgHr: a.avgHr,
          source: a.source,
        },
      });
      return {
        ...normalized,
        rpe: finite(a.rpe) && a.rpe >= 1 && a.rpe <= 10 ? a.rpe : null,
        notes: String(a.notes || ''),
        tags: String(a.tags || ''),
      };
    });
  }
  throw new Error('Formato no admitido. Selecciona FIT, GPX, ZIP de FIT o una copia JSON de Rastro.');
}

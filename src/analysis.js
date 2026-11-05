export const finite = (v) => typeof v === 'number' && Number.isFinite(v);
export const mean = (xs) => {
  const a = xs.filter(finite);
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
};
export const dayKey = (value) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date(value));
export function pace(secondsPerKm) {
  if (!finite(secondsPerKm) || secondsPerKm <= 0) return '—';
  const s = Math.round(secondsPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function duration(s) {
  return finite(s)
    ? `${Math.floor(s / 3600) ? Math.floor(s / 3600) + ' h ' : ''}${Math.floor((s % 3600) / 60)} min`
    : '—';
}
export const activityPace = (a) =>
  a.distance > 0 && a.duration > 0 ? a.duration / (a.distance / 1000) : null;
export function haversine(a, b) {
  const rad = (x) => (x * Math.PI) / 180;
  const x =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)));
}
export const hasGPS = (p) =>
  finite(p.lat) && finite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
export function routeSegments(points) {
  const segments = [];
  let part = [];
  let prev;
  for (const p of points) {
    const gap =
      prev && (p.t - prev.t > 120 || p.segment !== prev.segment || (hasGPS(p) && haversine(prev, p) > 500));
    if (!hasGPS(p) || gap) {
      if (part.length > 1) segments.push(part);
      part = [];
    }
    if (hasGPS(p)) {
      part.push(p);
      prev = p;
    } else prev = null;
  }
  if (part.length > 1) segments.push(part);
  return segments;
}
export function weekly(activities) {
  const groups = new Map();
  for (const a of activities) {
    const date = new Date(`${dayKey(a.start)}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const key = date.toISOString().slice(0, 10);
    const row = groups.get(key) || {
      date: key,
      distance: 0,
      duration: 0,
      ascent: 0,
      count: 0,
      load: 0,
      rated: 0,
    };
    row.distance += a.distance;
    row.duration += a.duration;
    row.ascent += a.ascent || 0;
    row.count++;
    if (finite(a.rpe)) {
      row.load += (a.duration / 60) * a.rpe;
      row.rated++;
    }
    groups.set(key, row);
  }
  const rows = [...groups.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) return [];
  const result = [];
  const end = new Date(rows.at(-1).date);
  const date = new Date(rows[0].date);
  while (date <= end) {
    const key = date.toISOString().slice(0, 10);
    result.push(
      groups.get(key) || { date: key, distance: 0, duration: 0, ascent: 0, count: 0, load: 0, rated: 0 },
    );
    date.setUTCDate(date.getUTCDate() + 7);
  }
  return result;
}
// Integrate actual sample intervals; gaps and pauses never count as zone time.
export function zoneSeconds(points, boundaries) {
  const result = Array(boundaries.length + 1).fill(0);
  for (let i = 1; i < points.length; i++) {
    const p = points[i],
      prev = points[i - 1],
      dt = p.t - prev.t;
    if (!finite(prev.hr) || dt <= 0 || dt > 30 || p.moving === false || prev.moving === false) continue;
    const zone = boundaries.findIndex((b) => prev.hr < b);
    result[zone < 0 ? boundaries.length : zone] += dt;
  }
  return result;
}
export function efficiency(points) {
  let time = 0,
    meters = 0,
    heart = 0;
  for (let i = 1; i < points.length; i++) {
    const p = points[i],
      prev = points[i - 1],
      dt = p.t - prev.t,
      dd = p.d - prev.d;
    if (
      dt <= 0 ||
      dt > 30 ||
      dd <= 0 ||
      dd / dt > 12 ||
      !finite(prev.hr) ||
      prev.hr < 30 ||
      p.moving === false ||
      prev.moving === false
    )
      continue;
    time += dt;
    meters += dd;
    heart += prev.hr * dt;
  }
  return time >= 300 && heart > 0
    ? { speed: meters / time, hr: heart / time, ratio: meters / heart, seconds: time }
    : null;
}
export function drift(points) {
  if (points.length < 2) return null;
  const cutoff = (points[0].t + points.at(-1).t) / 2;
  const first = efficiency(points.filter((p) => p.t <= cutoff)),
    second = efficiency(points.filter((p) => p.t >= cutoff));
  return first && second ? (1 - second.ratio / first.ratio) * 100 : null;
}
export function bestEffort(points, target) {
  let best = Infinity,
    j = 0;
  for (let i = 0; i < points.length; i++) {
    j = Math.max(j, i + 1);
    while (j < points.length && points[j].d - points[i].d < target) j++;
    if (j >= points.length) break;
    const prev = points[j - 1],
      end = points[j],
      gap = end.t - prev.t;
    if (gap <= 0 || gap > 30 || end.d <= prev.d) continue;
    const t = prev.t + ((target + points[i].d - prev.d) / (end.d - prev.d)) * gap - points[i].t;
    if (t > 0) best = Math.min(best, t);
  }
  return Number.isFinite(best) ? best : null;
}
export function terrain(points) {
  const groups = [
    { name: 'Bajada (< −2%)', meters: 0, seconds: 0 },
    { name: 'Llano (±2%)', meters: 0, seconds: 0 },
    { name: 'Subida (> 2%)', meters: 0, seconds: 0 },
  ];
  // Aggregate ~100 m before calculating grade to reduce elevation noise.
  let anchor = points[0];
  for (const p of points.slice(1)) {
    if (!anchor) {
      anchor = p;
      continue;
    }
    if (p.t - anchor.t > 120 || p.segment !== anchor.segment) {
      anchor = p;
      continue;
    }
    const dd = p.d - anchor.d,
      dt = p.t - anchor.t;
    if (dd < 100) continue;
    if (finite(p.alt) && finite(anchor.alt) && dt > 0) {
      const grade = ((p.alt - anchor.alt) / dd) * 100,
        group = groups[grade < -2 ? 0 : grade > 2 ? 2 : 1];
      group.meters += dd;
      group.seconds += dt;
    }
    anchor = p;
  }
  return groups;
}
export function intervalStats(laps) {
  const active = laps.filter((l) => l.kind === 'active' && l.distance > 0 && l.duration > 0);
  if (active.length < 2) return null;
  const reference = mean(active.map((l) => l.distance));
  // Do not compare e.g. 200 m repetitions against 2 km blocks.
  if (active.some((l) => Math.abs(l.distance - reference) > reference * 0.1)) return null;
  const paces = active.map((l) => (l.duration / l.distance) * 1000),
    average = mean(paces);
  return {
    count: active.length,
    variation: (Math.sqrt(mean(paces.map((p) => (p - average) ** 2))) / average) * 100,
    change: (paces.at(-1) / paces[0] - 1) * 100,
  };
}

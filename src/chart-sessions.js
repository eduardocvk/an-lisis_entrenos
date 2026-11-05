import { dayKey, weekly, finite, zoneSeconds } from './analysis.js';

export function distanceGroups(activities, grouping = 'week') {
  const keyFor = (a) => {
    const day = dayKey(a.start);
    if (grouping === 'year') return day.slice(0, 4);
    if (grouping === 'month') return day.slice(0, 7);
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  };
  const groups = new Map();
  for (const a of activities) {
    const key = keyFor(a);
    const group = groups.get(key) || { key, distance: 0, sessions: [] };
    group.distance += a.distance;
    group.sessions.push(a);
    groups.set(key, group);
  }
  const keys = [...groups.keys()].sort();
  if (!keys.length) return [];
  const result = [];
  let key = keys[0];
  while (key <= keys.at(-1)) {
    result.push(groups.get(key) || { key, distance: 0, sessions: [] });
    const d = new Date(
      `${key}${grouping === 'year' ? '-01-01' : grouping === 'month' ? '-01' : ''}T12:00:00Z`,
    );
    if (grouping === 'year') d.setUTCFullYear(d.getUTCFullYear() + 1);
    else if (grouping === 'month') d.setUTCMonth(d.getUTCMonth() + 1);
    else d.setUTCDate(d.getUTCDate() + 7);
    key = d.toISOString().slice(0, grouping === 'year' ? 4 : grouping === 'month' ? 7 : 10);
  }
  return result;
}

export function chartSessions(id, point, activities, zones) {
  const index = point.dataIndex;
  const chronological = [...activities].sort((a, b) => a.start.localeCompare(b.start));
  if (['weekly', 'volume', 'load'].includes(id)) {
    const week = weekly(activities)[index]?.date;
    if (!week) return [];
    const end = new Date(`${week}T12:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 7);
    const until = end.toISOString().slice(0, 10);
    return activities.filter(
      (a) => dayKey(a.start) >= week && dayKey(a.start) < until && (id !== 'load' || finite(a.rpe)),
    );
  }
  if (id === 'monthly') {
    const month = [...new Set(activities.map((a) => dayKey(a.start).slice(0, 7)))].sort()[index];
    return activities.filter((a) => dayKey(a.start).slice(0, 7) === month);
  }
  if (id === 'weekdays')
    return activities.filter((a) => (new Date(`${dayKey(a.start)}T12:00:00Z`).getUTCDay() + 6) % 7 === index);
  if (id === 'zones') return activities.filter((a) => zoneSeconds(a.points, zones)[index] > 0);
  if (id === 'efficiency') return chronological.filter((a) => finite(a.avgHr)).filter((_, i) => i === index);
  if (['pace', 'session-duration', 'elevation'].includes(id))
    return chronological.filter((_, i) => i === index);
  if (id.startsWith('comparison')) return activities.filter((_, i) => i === point.seriesIndex);
  if (['sleep', 'hrv', 'recovery-rhr', 'recovery-training'].includes(id))
    return activities.filter((a) => dayKey(a.start) === point.name);
  return [];
}

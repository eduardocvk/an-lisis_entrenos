import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { routeSegments, haversine } from './analysis.js';

export function drawMap(container, activities, mode = 'coverage', onSelect = () => {}, privacyKm = 0) {
  const map = L.map(container, { preferCanvas: true }).setView([40.2, -3.7], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);
  const bounds = L.latLngBounds([]),
    grid = new Map();
  for (const activity of activities) {
    const original = routeSegments(activity.points || []),
      first = original[0]?.[0],
      last = original.at(-1)?.at(-1);
    const parts =
      privacyKm > 0 && first
        ? original.flatMap((part) =>
            routeSegments(
              part.map((p) =>
                haversine(first, p) < privacyKm * 1000 || haversine(last, p) < privacyKm * 1000
                  ? { ...p, lat: null, lon: null }
                  : p,
              ),
            ),
          )
        : original;
    if (mode === 'heat') {
      const visited = new Set();
      for (const part of parts)
        for (let i = 1; i < part.length; i++) {
          const a = part[i - 1],
            b = part[i],
            n = Math.max(1, Math.ceil(haversine(a, b) / 25));
          for (let j = 0; j <= n; j++) {
            const lat = a.lat + ((b.lat - a.lat) * j) / n,
              lon = a.lon + ((b.lon - a.lon) * j) / n;
            const key = `${Math.round(lat / 0.00035)},${Math.round(lon / 0.00045)}`;
            if (visited.has(key)) continue;
            visited.add(key);
            const cell = grid.get(key) || { lat, lon, count: 0 };
            cell.count++;
            grid.set(key, cell);
          }
        }
    } else
      for (const part of parts) {
        const line = L.polyline(
          part.map((p) => [p.lat, p.lon]),
          { color: '#087f79', weight: 3, opacity: 0.55 },
        ).addTo(map);
        const label = document.createElement('span');
        label.textContent = `${new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Madrid' }).format(new Date(activity.start))} · ${activity.name}`;
        line.bindTooltip(label);
        line.on('click', () => onSelect(activity.id));
        bounds.extend(line.getBounds());
      }
  }
  if (mode === 'heat')
    for (const cell of grid.values()) {
      const intensity = Math.min(1, Math.log2(cell.count + 1) / 4);
      L.circleMarker([cell.lat, cell.lon], {
        radius: 5 + intensity * 4,
        stroke: false,
        fillColor: intensity > 0.65 ? '#e45b36' : intensity > 0.3 ? '#e3a632' : '#168f8a',
        fillOpacity: 0.35 + intensity * 0.45,
        interactive: false,
      }).addTo(map);
      bounds.extend([cell.lat, cell.lon]);
    }
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
  const observer = new ResizeObserver(() => map.invalidateSize());
  observer.observe(container);
  return {
    map,
    destroy() {
      observer.disconnect();
      map.remove();
    },
  };
}

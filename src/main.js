import './style.css';
import {
  activityPace,
  pace,
  duration,
  mean,
  finite,
  weekly,
  dayKey,
  zoneSeconds,
  drift,
  bestEffort,
  terrain,
  efficiency,
  intervalStats,
} from './analysis.js';
import { parseFile } from './import.js';
import {
  localLoad,
  localSave,
  cloudConfig,
  client,
  cloudLoad,
  cloudSave,
  cloudNotes,
  healthLoad,
} from './store.js';
import { drawMap } from './maps.js';
import { chart } from './charts.js';
import { chartSessions, distanceGroups, periodLabel } from './chart-sessions.js';
import { paginate } from './pagination.js';

const app = document.querySelector('#app');
const views = [
  ['overview', 'Vista general', 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z'],
  ['activities', 'Entrenamientos', 'M3 12h4l3-8 4 16 3-8h4'],
  ['performance', 'Rendimiento', 'M3 20V4 M3 20h18 M6 16l5-5 4 2 6-9'],
  ['intervals', 'Series e intervalos', 'M4 20V9h3v11 M11 20V4h3v16 M18 20V12h3v8'],
  ['load', 'Carga y constancia', 'M4 5h16v16H4z M8 2v6 M16 2v6 M4 11h16'],
  ['recovery', 'Recuperación', 'M20 13a8 8 0 0 1-9-10 9 9 0 1 0 9 10'],
  ['map', 'Mapa histórico', 'M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2z M9 3v16 M15 5v16'],
  ['compare', 'Comparador', 'M5 4v16 M19 4v16 M2 8h6 M16 16h6 M9 8h6 M9 16h6'],
  ['terrain', 'Terreno', 'M2 20l7-14 5 8 3-5 5 11z'],
  ['journal', 'Diario', 'M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h5'],
];
const icon = (path) =>
  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const num = (n, d = 0) =>
  finite(n) ? n.toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—';
const date = (s) =>
  new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Madrid',
  }).format(new Date(s));
const state = {
  view: 'overview',
  activities: [],
  health: [],
  from: '',
  to: '',
  search: '',
  sport: 'all',
  mapMode: 'coverage',
  grouping: 'week',
  activityPage: 0,
  privacy: 0,
  selected: new Set(),
  detail: null,
  cloud: null,
  user: null,
  busy: false,
  zones: JSON.parse(localStorage.getItem('rastro-zones') || '[130,145,160,175]'),
};
let resources = [];
function cleanup() {
  resources.forEach((r) => r.destroy());
  resources = [];
}
function filtered() {
  return state.activities
    .filter(
      (a) =>
        (!state.from || dayKey(a.start) >= state.from) &&
        (!state.to || dayKey(a.start) <= state.to) &&
        (!state.search || `${a.name} ${a.tags}`.toLowerCase().includes(state.search.toLowerCase())) &&
        (state.sport === 'all' ||
          (state.sport === 'trail' ? /trail/i.test(a.sport) : !/trail/i.test(a.sport))),
    )
    .sort((a, b) => b.start.localeCompare(a.start));
}
function toast(message, error = false) {
  const node = document.querySelector('#notice');
  node.className = `notice ${error ? 'error' : ''}`;
  node.textContent = message;
  node.hidden = false;
}
function empty(message = 'Importa tus primeras carreras para empezar a encontrar patrones.') {
  return `<div class="empty"><span class="empty-symbol">↗</span><h3>Aquí empieza tu historia</h3><p>${esc(message)}</p><button class="primary" data-import>Importar entrenamientos</button><small>FIT · GPX · ZIP de FIT · Copia de Rastro</small></div>`;
}
const metric = (label, value, unit, foot) =>
  `<article class="metric"><span>${label}</span><div>${value}<small>${unit}</small></div><p>${foot}</p></article>`;
const panel = (title, subtitle, body, cls = '') =>
  `<section class="panel ${cls}"><div class="panel-heading"><div><h2>${title}</h2>${subtitle ? `<details class="chart-help"><summary aria-label="Información de ${esc(title)}">ⓘ</summary><p>${subtitle}</p></details>` : ''}</div></div>${body}</section>`;
const plot = (id, description) =>
  `<div id="${id}" class="chart" role="img" aria-label="${esc(description)}"></div>`;
function addChart(id, options) {
  const el = document.getElementById(id);
  const list = filtered().filter((a) => !id.startsWith('comparison') || state.selected.has(a.id));
  if (el)
    resources.push(
      chart(el, {
        ...options,
        sessionsForPoint: (p) =>
          id === 'weekly'
            ? distanceGroups(list, state.grouping)[p.dataIndex]?.sessions || []
            : chartSessions(id, p, list, state.zones),
        onOpenSession: openDetail,
        sessionsTrigger: id === 'weekdays' ? 'none' : id === 'weekly' ? 'click' : 'hover',
        onPointSelect:
          id === 'weekly'
            ? (p) => {
                const group = distanceGroups(list, state.grouping)[p.dataIndex];
                if (group)
                  showDialog(
                    `<h2>${esc(periodLabel(group.key, state.grouping))}</h2>${group.sessions.length ? rows(group.sessions.slice().sort((a, b) => b.start.localeCompare(a.start))) : '<p>Sin entrenamientos en este periodo.</p>'}`,
                  );
              }
            : undefined,
      }),
    );
}
function rows(list, select = false) {
  return `<div class="table-wrap"><table><thead><tr>${select ? '<th>Comparar</th>' : ''}<th>Entrenamiento</th><th>Distancia</th><th>Tiempo</th><th>Ritmo</th><th>Pulso</th><th>Desnivel +</th></tr></thead><tbody>${list.map((a) => `<tr>${select ? `<td><input type="checkbox" data-compare="${esc(a.id)}" aria-label="Comparar ${esc(a.name)}" ${state.selected.has(a.id) ? 'checked' : ''}></td>` : ''}<td><button class="activity-link" data-detail="${esc(a.id)}">${esc(a.name)}</button><small>${date(a.start)} · ${/trail/i.test(a.sport) ? 'Trail' : 'Carrera'}</small></td><td>${num(a.distance / 1000, 2)} km</td><td>${duration(a.duration)}</td><td>${pace(activityPace(a))}<small>/km</small></td><td>${num(a.avgHr)}<small>ppm</small></td><td>${num(a.ascent)} m</td></tr>`).join('')}</tbody></table></div>`;
}

function shell() {
  app.innerHTML = `<aside class="sidebar"><a href="#overview" class="brand"><span class="brand-mark">r.</span> rastro<span class="brand-dot">●</span></a><p class="nav-caption">TU CUADERNO DE CARRERA</p><nav aria-label="Secciones">${views.map(([id, label, path]) => `<button data-view="${id}">${icon(path)}<span>${label}</span></button>`).join('')}</nav><div class="sidebar-bottom"><div class="privacy-note">${icon('M12 3l8 4v5c0 5-8 9-8 9s-8-4-8-9V7z')}<span>Tus datos, tu recorrido<small id="storage-label">Almacenamiento en este navegador</small></span></div><button data-settings>${icon('M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3')}<span>Conexión y ajustes</span></button></div></aside><div class="workspace"><header><span class="breadcrumb">ENTRENAMIENTO <span>/</span> CARRERA</span><div class="header-actions"><button data-settings class="icon-button" aria-label="Conexión y ajustes" title="Conexión y ajustes">⚙</button><button id="account" data-settings class="status-pill">Iniciar sesión</button><button data-refresh class="secondary">Actualizar datos</button><button data-import class="primary">+ Importar</button></div></header><main><div id="notice" class="notice" role="status" aria-live="polite" hidden></div><div class="page-heading"><div><p class="eyebrow">CADA CARRERA CUENTA</p><h1 id="page-title"></h1><p id="page-subtitle"></p></div><button class="secondary" data-export>Exportar copia</button></div><div class="filters"><label>Desde<input type="date" id="from"></label><label>Hasta<input type="date" id="to"></label><label>Modalidad<select id="sport"><option value="all">Toda la carrera</option><option value="road">Carrera</option><option value="trail">Trail</option></select></label><label class="search">Buscar<input type="search" id="search" placeholder="Nombre o etiqueta…"></label><button class="text-button" id="reset">Todo el histórico</button></div><div id="content"></div><footer>RASTRO <span>Tu progreso, con perspectiva.</span><span id="count"></span></footer></main></div><input id="files" type="file" accept=".fit,.gpx,.zip,.json" multiple hidden><dialog id="dialog"></dialog>`;
  const refreshButton = document.querySelector('[data-refresh]');
  refreshButton.before(document.querySelector('header [data-import]'));
  const refreshControls = document.createElement('div');
  refreshControls.className = 'refresh-controls';
  refreshButton.before(refreshControls);
  refreshControls.append(refreshButton, document.querySelector('#notice'));
  app.addEventListener('click', onClick);
  app.addEventListener('change', onChange);
  document.querySelector('#search').addEventListener('input', (e) => {
    state.activityPage = 0;
    state.search = e.target.value;
    renderContent();
  });
  document.querySelector('#dialog').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.close();
  });
  document.querySelector('#files').addEventListener('change', importFiles);
}
const subtitles = {
  overview: 'La perspectiva que una sola actividad no te da.',
  activities: 'Cada sesión, con todo su contexto.',
  performance: 'Observa cómo cambia tu rendimiento a lo largo del tiempo.',
  intervals: 'Regularidad, esfuerzo y recuperación entre repeticiones.',
  load: 'El trabajo que acumulas y cómo lo distribuyes.',
  recovery: 'Pon tu entrenamiento en contexto con el descanso.',
  map: 'Todos los caminos que ya forman parte de ti.',
  compare: 'Pon tus sesiones en paralelo y encuentra las diferencias.',
  terrain: 'Descubre cómo respondes al perfil del recorrido.',
  journal: 'Las sensaciones también son datos.',
};
function render() {
  document.querySelectorAll('[data-view]').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === state.view);
    b.setAttribute('aria-current', b.dataset.view === state.view ? 'page' : 'false');
  });
  document.querySelector('#page-title').textContent = views.find((v) => v[0] === state.view)[1];
  document.querySelector('#page-subtitle').textContent = subtitles[state.view];
  document.querySelector('#account').textContent = state.user
    ? '● Nube privada'
    : state.cloud
      ? 'Iniciar sesión'
      : '● Local';
  document.querySelector('#storage-label').textContent = state.user
    ? 'Sesión privada en Supabase'
    : 'Almacenamiento en este navegador';
  renderContent();
}
function renderContent() {
  cleanup();
  const list = filtered(),
    content = document.querySelector('#content');
  document.querySelector('#count').textContent = `${list.length} de ${state.activities.length} sesiones`;
  if (!list.length) {
    content.innerHTML = state.activities.length
      ? panel(
          'Sin coincidencias',
          'Prueba otro periodo, modalidad o búsqueda.',
          '<button class="secondary" id="reset">Restablecer filtros</button>',
        )
      : `<section class="welcome"><div><span class="tag">TU ESPACIO PARA CORRER</span><h2>Entiende el esfuerzo.<br><em>Descubre tu progreso.</em></h2><p>Reúne tus carreras, compara sesiones y vuelve a recorrer cada kilómetro desde otra perspectiva.</p><div class="welcome-features"><span>↗ Rendimiento</span><span>◉ Recuperación</span><span>⌁ Territorio</span></div></div><div class="contour" aria-hidden="true"><svg viewBox="0 0 400 300"><g fill="none" stroke="currentColor">${Array.from({ length: 12 }, (_, i) => `<ellipse cx="210" cy="150" rx="${40 + i * 16}" ry="${25 + i * 12}" transform="rotate(-27 210 150)"/>`).join('')}</g><path d="M70 230Q100 50 175 135T325 60" fill="none" stroke="#e6ba76" stroke-width="4" stroke-dasharray="6 6"/><circle cx="70" cy="230" r="7" fill="#e6ba76"/></svg></div></section>${empty()}<div class="info-strip">Empieza con archivos reales. Puedes conectar Supabase en «Conexión y ajustes» para consultar tus datos desde otros dispositivos.</div>`;
    return;
  }
  if (state.view === 'overview') {
    const distance = list.reduce((s, a) => s + a.distance, 0),
      seconds = list.reduce((s, a) => s + a.duration, 0),
      weeks = weekly(list);
    content.innerHTML = `<div class="metrics">${metric('DISTANCIA', num(distance / 1000, 1), 'km', `${list.length} sesiones en el periodo`)}${metric('TIEMPO DE CARRERA', num(seconds / 3600, 1), 'h', 'Tiempo registrado de entrenamiento')}${metric('RITMO GLOBAL', pace(seconds / (distance / 1000)), '/km', 'Ponderado por distancia')}${metric('DESNIVEL POSITIVO', list.some((a) => finite(a.ascent)) ? num(list.reduce((s, a) => s + (a.ascent || 0), 0)) : '—', 'm', `${list.filter((a) => finite(a.ascent)).length} sesiones con dato de ascenso`)}</div><div class="two-col">${panel('Distancia por periodo', 'Suma de las distancias de las sesiones. Las semanas van de lunes a domingo.', '<label class="grouping-control">Agrupar por<select id="distance-grouping"><option value="week">Semana</option><option value="month">Mes</option><option value="year">Año</option></select></label>' + plot('weekly', 'Distancia agrupada por periodo'))}${panel('Tu territorio', 'Recorridos del periodo seleccionado', '<div id="mini-map" class="mini-map"></div>')}</div>${panel('Últimas carreras', 'Abre una sesión para explorar sus datos', rows(list.slice(0, 6)))}<div class="info-strip">La comparación gana valor con sesiones de terreno, duración y condiciones similares. Los datos ausentes se muestran con «—».</div>`;
    const groups = distanceGroups(list, state.grouping);
    document.querySelector('#distance-grouping').value = state.grouping;
    addChart('weekly', {
      labels: groups.map((g) => periodLabel(g.key, state.grouping)),
      yName: 'km',
      zoom: true,
      series: [{ name: 'Distancia', type: 'bar', data: groups.map((g) => +(g.distance / 1000).toFixed(2)) }],
    });
    const weekdays = Array(7).fill(0);
    list.forEach((a) => weekdays[(new Date(dayKey(a.start) + 'T12:00:00Z').getUTCDay() + 6) % 7]++);
    document
      .querySelector('#weekly')
      .closest('.two-col')
      .insertAdjacentHTML(
        'afterend',
        '<div class="analytics-grid">' +
          panel(
            'Cuándo corres',
            'Número de sesiones por día de la semana',
            plot('weekdays', 'Sesiones por día de la semana'),
          ) +
          panel(
            'Duración de las sesiones',
            'Minutos por entrenamiento',
            plot('session-duration', 'Duración por sesión'),
          ) +
          '</div>',
      );
    addChart('weekdays', {
      labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
      yName: 'sesiones',
      series: [{ name: 'Sesiones', type: 'bar', data: weekdays }],
    });
    addChart('session-duration', {
      labels: [...list].reverse().map((a) => date(a.start)),
      yName: 'min',
      zoom: true,
      series: [{ name: 'Duración', data: [...list].reverse().map((a) => +(a.duration / 60).toFixed(1)) }],
    });
    resources.push(drawMap(document.querySelector('#mini-map'), list, 'coverage', openDetail));
  } else if (state.view === 'activities') {
    const page = paginate(list, state.activityPage);
    state.activityPage = page.page;
    content.innerHTML =
      panel('Entrenamientos', 'Marca hasta cuatro actividades para compararlas', rows(page.items, true)) +
      `<nav class="pagination" aria-label="Páginas de entrenamientos"><button class="secondary" data-activity-page="${page.page - 1}" ${page.page === 0 ? 'disabled' : ''}>Anterior</button><span>${page.first}–${page.last} de ${page.total} · Página ${page.page + 1} de ${page.pages}</span><button class="secondary" data-activity-page="${page.page + 1}" ${page.page + 1 === page.pages ? 'disabled' : ''}>Siguiente</button></nav>` +
      `<button class="primary" data-view="compare">Abrir comparador (${state.selected.size})</button>`;
  } else if (state.view === 'map') {
    content.innerHTML = panel(
      'Un mapa de tus kilómetros',
      'Cobertura muestra cada recorrido. Frecuencia cuenta actividades por celda (~40 m); no es una identificación exacta de calles.',
      `<div class="map-toolbar"><label>Visualización<select id="map-mode"><option value="coverage">Por dónde he corrido</option><option value="heat">Frecuencia de paso</option></select></label><label>Ocultar alrededor de inicio y final<select id="privacy"><option value="0">Mostrar todo</option><option value="0.3">300 m</option><option value="0.5">500 m</option><option value="1">1 km</option></select></label><span>${list.filter((a) => a.points.some((p) => finite(p.lat))).length} sesiones con GPS</span></div><div id="history-map" class="history-map"></div><p class="hint">Pulsa una traza en modo cobertura para abrir el entrenamiento. La ocultación es visual; no elimina coordenadas de los datos guardados. Los mapas base se descargan de OpenStreetMap.</p>`,
    );
    document.querySelector('#map-mode').value = state.mapMode;
    document.querySelector('#privacy').value = String(state.privacy);
    resources.push(
      drawMap(document.querySelector('#history-map'), list, state.mapMode, openDetail, state.privacy),
    );
  } else if (state.view === 'performance') {
    const chronological = [...list].reverse(),
      withHr = chronological.filter((a) => finite(a.avgHr));
    content.innerHTML = `<div class="two-col">${panel('Ritmo y pulso', 'Cada punto es una sesión. Filtra recorridos similares antes de comparar.', plot('efficiency', 'Dispersión de pulso medio y ritmo'))}${panel('Evolución del ritmo', 'Minutos por km · menor es más rápido', plot('pace', 'Ritmo medio de cada entrenamiento'))}</div>${panel(
      'Mejores esfuerzos registrados',
      'Estimación sobre muestras de distancia y tiempo transcurrido, con interpolación. No equivale a una marca homologada.',
      `<div class="metrics">${[1000, 5000, 10000, 21097.5]
        .map((target) => {
          const values = list
            .map((a) => ({ a, t: bestEffort(a.points, target) }))
            .filter((v) => finite(v.t))
            .sort((a, b) => a.t - b.t);
          return metric(
            `${num(target / 1000, target === 21097.5 ? 1 : 0)} KM`,
            values.length ? pace(values[0].t) : '—',
            '',
            values.length ? esc(values[0].a.name) : 'Distancia insuficiente',
          );
        })
        .join('')}</div>`,
    )}${panel(
      'Eficiencia y resistencia',
      'Velocidad/pulso integrado sobre muestras válidas. La variación entre mitades también depende de pendientes, calor y cambios de ritmo.',
      `<div class="table-wrap"><table><thead><tr><th>Sesión</th><th>Pulso válido</th><th>Velocidad a ese pulso</th><th>Caída de eficiencia entre mitades</th></tr></thead><tbody>${list
        .slice(0, 30)
        .map((a) => {
          const e = efficiency(a.points),
            d = drift(a.points);
          return `<tr><td><button class="activity-link" data-detail="${a.id}">${esc(a.name)}</button></td><td>${num(e?.hr)} ppm</td><td>${e ? num(e.speed * 3.6, 1) : '—'} km/h</td><td>${num(d, 1)} ${finite(d) ? '%' : ''}</td></tr>`;
        })
        .join(
          '',
        )}</tbody></table></div><p class="hint">Se necesitan al menos 5 minutos válidos en cada mitad para calcular la variación.</p>`,
    )} `;
    addChart('efficiency', {
      scatter: true,
      yName: 'min/km',
      inverse: true,
      series: [{ name: 'Sesiones', data: withHr.map((a) => [a.avgHr, activityPace(a) / 60]) }],
    });
    addChart('pace', {
      labels: chronological.map((a) => date(a.start)),
      yName: 'min/km',
      inverse: true,
      series: [{ name: 'Ritmo', data: chronological.map((a) => activityPace(a) / 60) }],
    });
  } else if (state.view === 'load') {
    const weeks = weekly(list),
      zones = Array(5).fill(0);
    list.forEach((a) => zoneSeconds(a.points, state.zones).forEach((s, i) => (zones[i] += s)));
    content.innerHTML = `<div class="two-col">${panel('Volumen semanal', 'Compara bloques usando los filtros de fecha', plot('volume', 'Minutos y desnivel semanal'))}${panel('Distribución por pulso', 'Tiempo de muestras válidas en tus zonas configuradas', plot('zones', 'Minutos por zona de frecuencia cardiaca'))}</div>${panel('Carga percibida', 'Minutos × esfuerzo percibido (RPE). Solo incluye sesiones valoradas en el diario.', plot('load', 'Carga percibida por semana'))}<div class="info-strip">${list.filter((a) => finite(a.rpe)).length}/${list.length} sesiones con RPE. Límites actuales: ${state.zones.join(' / ')} ppm. Configúralos en ajustes; no se infieren de tu edad. Las zonas excluyen pausas FIT y huecos de más de 30 s.</div>`;
    addChart('volume', {
      labels: weeks.map((w) => w.date),
      yName: 'min',
      series: [{ name: 'Tiempo', type: 'bar', data: weeks.map((w) => Math.round(w.duration / 60)) }],
    });
    addChart('zones', {
      labels: ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'],
      yName: 'min',
      series: [{ name: 'Tiempo', type: 'bar', data: zones.map((s) => +(s / 60).toFixed(1)) }],
    });
    addChart('load', {
      labels: weeks.map((w) => w.date),
      yName: 'u.a.',
      series: [{ name: 'Carga RPE', type: 'bar', data: weeks.map((w) => (w.rated ? w.load : null)) }],
    });
  } else if (state.view === 'intervals') {
    content.innerHTML = panel(
      'Vueltas y repeticiones',
      'Se muestran las vueltas que contiene cada FIT. GPX no conserva la estructura de series.',
      list.some((a) => a.laps.length)
        ? list
            .filter((a) => a.laps.length)
            .slice(0, 20)
            .map(
              (a) =>
                `<details class="lap-group"><summary>${esc(a.name)} <span>${date(a.start)} · ${a.laps.length} vueltas</span></summary>${lapTable(a)}</details>`,
            )
            .join('')
        : '<p class="no-data">Las sesiones actuales no incluyen vueltas. Importa los FIT originales para consultar sus intervalos.</p>',
    );
  } else if (state.view === 'compare') {
    const selected = list.filter((a) => state.selected.has(a.id));
    content.innerHTML =
      panel(
        'Elige hasta cuatro sesiones',
        'Compara por distancia acumulada y revisa también el perfil del recorrido.',
        rows(list, true),
      ) +
      (selected.length
        ? panel(
            'Sesiones en paralelo',
            'Ritmo calculado entre muestras separadas al menos 100 m. Pulso y altitud conservan las muestras originales.',
            `<div class="metrics">${selected.map((a) => metric(esc(a.name), pace(activityPace(a)), '/km', `${num(a.distance / 1000, 2)} km · ${num(a.avgHr)} ppm`)).join('')}</div>${plot('comparison', 'Ritmo de sesiones seleccionadas por distancia')}${plot('comparison-hr', 'Pulso por distancia')}${plot('comparison-alt', 'Perfil de altitud por distancia')}`,
          )
        : '<p class="info-strip">Selecciona dos o más sesiones para verlas en paralelo.</p>');
    if (selected.length) {
      for (const [id, field, label] of [
        ['comparison', 'pace', 'min/km'],
        ['comparison-hr', 'hr', 'ppm'],
        ['comparison-alt', 'alt', 'm'],
      ])
        addChart(id, {
          scatter: true,
          yName: label,
          zoom: true,
          series: selected.map((a) => ({
            name: a.name,
            type: 'line',
            showSymbol: false,
            data: sampleSeries(a.points, field),
          })),
        });
      // Override scatter axis caption for distance comparisons.
      resources.slice(-3).forEach((r) => r.instance.setOption({ xAxis: { name: 'Distancia (km)' } }));
    }
  } else if (state.view === 'terrain') {
    const groups = terrain(
      list.flatMap((a, i) => a.points.map((p) => ({ ...p, segment: `${i}-${p.segment}` }))),
    );
    content.innerHTML =
      panel(
        'Rendimiento por pendiente',
        'Tramos de al menos 100 m para reducir ruido de altitud. Ritmo sobre tiempo transcurrido.',
        `<div class="metrics">${groups.map((g) => metric(g.name, pace(g.meters ? g.seconds / (g.meters / 1000) : null), '/km', `${num(g.meters / 1000, 1)} km con altitud válida`)).join('')}</div><p class="hint">No corrige el ritmo por pendiente. Las diferencias de terreno, firme y dificultad técnica siguen influyendo.</p>`,
      ) +
      panel(
        'Ascenso registrado por sesión',
        'Solo valores de ascenso presentes en el FIT; no se inventa desnivel para GPX.',
        plot('elevation', 'Desnivel positivo por entrenamiento'),
      );
    addChart('elevation', {
      labels: [...list].reverse().map((a) => date(a.start)),
      yName: 'm+',
      series: [{ name: 'Ascenso', type: 'bar', data: [...list].reverse().map((a) => a.ascent) }],
    });
  } else if (state.view === 'recovery') {
    const health = state.health
      .filter((h) => (!state.from || h.day >= state.from) && (!state.to || h.day <= state.to))
      .sort((a, b) => a.day.localeCompare(b.day));
    content.innerHTML = health.length
      ? `<div class="metrics">${metric('SUEÑO MEDIO', num(mean(health.map((h) => h.sleep_hours)), 1), 'h', 'Solo noches con dato')}${metric('HRV MEDIA', num(mean(health.map((h) => h.hrv)), 1), 'ms', 'Solo días con dato')}${metric('PULSO EN REPOSO', num(mean(health.map((h) => h.resting_hr))), 'ppm', 'Solo días con dato')}</div>${panel('Descanso y entrenamiento', 'Datos diarios de Garmin; las asociaciones no demuestran causalidad.', '<div class="recovery-grid">' + panel('Sueño', '', plot('sleep', 'Horas de sueño por día')) + panel('HRV', '', plot('hrv', 'HRV por día')) + panel('Pulso en reposo', '', plot('recovery-rhr', 'Pulso en reposo por día')) + panel('Carrera diaria', '', plot('recovery-training', 'Kilómetros por día')) + '</div>')}<p class="info-strip">${health.length} días consultados · Sueño: ${health.filter((h) => finite(h.sleep_hours)).length} · HRV: ${health.filter((h) => finite(h.hrv)).length} · Pulso en reposo: ${health.filter((h) => finite(h.resting_hr)).length}. Los huecos indican datos no disponibles.</p>`
      : panel(
          'Conecta el descanso con tus carreras',
          'Sueño, HRV y pulso en reposo',
          '<p class="no-data">Todavía no hay datos diarios de recuperación. Se obtienen mediante la sincronización privada de Garmin con Supabase; importar FIT o GPX no los proporciona.</p><button class="secondary" data-settings>Configurar conexión</button>',
        );
    if (health.length) {
      for (const [id, field, label] of [
        ['sleep', 'sleep_hours', 'Horas'],
        ['hrv', 'hrv', 'ms'],
        ['recovery-rhr', 'resting_hr', 'ppm'],
      ])
        addChart(id, {
          labels: health.map((h) => h.day),
          yName: label,
          series: [{ name: label, data: health.map((h) => h[field]) }],
        });
      addChart('recovery-training', {
        labels: health.map((h) => h.day),
        yName: 'km',
        series: [
          {
            name: 'Distancia',
            type: 'bar',
            data: health.map((h) =>
              list.filter((a) => dayKey(a.start) === h.day).reduce((s, a) => s + a.distance / 1000, 0),
            ),
          },
        ],
      });
    }
  } else if (state.view === 'journal')
    content.innerHTML = panel(
      'Cómo te sentiste',
      'Abre la sesión para registrar RPE (1–10), sensaciones y etiquetas.',
      `<div class="journal-grid">${list.map((a) => `<article class="journal-card"><small>${date(a.start)}</small><h3><button class="activity-link" data-detail="${a.id}">${esc(a.name)}</button></h3><p>${num(a.distance / 1000, 2)} km · ${pace(activityPace(a))}/km</p><span class="tag">RPE ${a.rpe ?? 'sin registrar'}</span><p class="notes">${esc(a.notes || 'Añade tus sensaciones al abrir la sesión.')}</p><small>${esc(a.tags)}</small></article>`).join('')}</div>`,
    );
}
function sampleSeries(points, field) {
  let previous = points[0];
  const result = [];
  for (const p of points) {
    if (field === 'pace') {
      if (p.d - previous.d < 100) continue;
      const speed = (p.d - previous.d) / (p.t - previous.t);
      result.push([p.d / 1000, speed > 0 && speed < 12 ? 1000 / speed / 60 : null]);
      previous = p;
    } else if (finite(p[field])) result.push([p.d / 1000, p[field]]);
  }
  return result;
}
function lapTable(a) {
  const stats = intervalStats(a.laps);
  return `${stats ? `<p class="info-strip">${stats.count} repeticiones activas de distancia similar · Variación de ritmo: ${num(stats.variation, 1)}% · Cambio de la última frente a la primera: ${num(stats.change, 1)}% (positivo = más lenta).</p>` : ``}<div class="table-wrap"><table><thead><tr><th>Vuelta</th><th>Tipo FIT</th><th>Distancia</th><th>Tiempo</th><th>Ritmo</th><th>Pulso</th></tr></thead><tbody>${a.laps.map((l) => `<tr><td>${l.number}</td><td>${esc(l.kind)}</td><td>${num(l.distance / 1000, 2)} km</td><td>${duration(l.duration)}</td><td>${pace(l.distance > 0 ? l.duration / (l.distance / 1000) : null)}/km</td><td>${num(l.avgHr)} ppm</td></tr>`).join('')}</tbody></table></div>`;
}

let detailResources = [];
function showDialog(html) {
  const dialog = document.querySelector('#dialog');
  detailResources.forEach((r) => r.destroy());
  detailResources = [];
  dialog.innerHTML = `<button class="close" data-close aria-label="Cerrar">×</button>${html}`;
  if (!dialog.open) dialog.showModal();
  dialog.onclose = () => {
    detailResources.forEach((r) => r.destroy());
    detailResources = [];
    state.detail = null;
  };
}
function openDetail(id) {
  const a = state.activities.find((a) => a.id === id);
  if (!a) return;
  state.detail = id;
  showDialog(
    `<p class="eyebrow">${date(a.start)} · ${esc(a.source)}</p><h2>${esc(a.name)}</h2><div class="metrics">${metric('DISTANCIA', num(a.distance / 1000, 2), 'km', '')}${metric('RITMO', pace(activityPace(a)), '/km', '')}${metric('TIEMPO', duration(a.duration), '', '')}${metric('PULSO', num(a.avgHr), 'ppm', '')}</div><div id="detail-map" class="mini-map"></div><p class="hint">Selecciona un intervalo de distancia en el gráfico para resaltarlo en el mapa.</p>${plot('detail-chart', 'Pulso y selección de tramo por distancia')}${plot('detail-pace', 'Ritmo por distancia')}${plot('detail-alt', 'Altitud por distancia')}${a.points.some((p) => finite(p.cadence)) ? plot('detail-cadence', 'Cadencia por distancia') : ''}${a.points.some((p) => finite(p.power)) ? plot('detail-power', 'Potencia por distancia') : ''}${a.laps.length ? lapTable(a) : '<p class="hint">Este archivo no contiene vueltas.</p>'}<form id="notes-form"><h3>Tu parte de la historia</h3><label>Esfuerzo percibido (1–10)<input name="rpe" type="number" min="1" max="10" step="1" value="${a.rpe ?? ''}"></label><label>Etiquetas (separadas por comas)<input name="tags" maxlength="300" value="${esc(a.tags)}" placeholder="Rodaje, calor, zapatillas…"></label><label>Sensaciones y contexto<textarea name="notes" maxlength="10000" rows="3">${esc(a.notes)}</textarea></label><button class="primary">Guardar diario</button><p id="save-state" role="status"></p></form>`,
  );
  const map = drawMap(document.querySelector('#detail-map'), [a]);
  detailResources.push(map);
  for (const [id, field, label] of [
    ['detail-chart', 'hr', 'ppm'],
    ['detail-pace', 'pace', 'min/km'],
    ['detail-alt', 'alt', 'm'],
    ['detail-cadence', 'cadence', 'pasos/min'],
    ['detail-power', 'power', 'W'],
  ]) {
    const el = document.getElementById(id);
    if (el)
      detailResources.push(
        chart(el, {
          scatter: true,
          yName: label,
          zoom: true,
          series: [{ name: label, type: 'line', showSymbol: false, data: sampleSeries(a.points, field) }],
        }),
      );
  }
  const plots = detailResources.filter((r) => r.instance);
  plots.forEach((r) => r.instance.setOption({ xAxis: { name: 'Distancia (km)' } }));
  let highlight;
  plots[0]?.instance.on('datazoom', (event) => {
    const range = event.batch?.[0] || event,
      from = ((range.start ?? 0) / 100) * a.distance,
      to = ((range.end ?? 100) / 100) * a.distance;
    if (highlight) map.map.removeLayer(highlight);
    import('leaflet').then(({ default: L }) => {
      if (!document.querySelector('#detail-map')) return;
      highlight = L.featureGroup(
        a.points
          .filter((p) => p.d >= from && p.d <= to && finite(p.lat) && finite(p.lon))
          .map((p) => L.circleMarker([p.lat, p.lon], { radius: 3, color: '#e9a04c', weight: 1 })),
      ).addTo(map.map);
    });
  });
  document.querySelector('#notes-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget,
      values = new FormData(form),
      rpe = values.get('rpe');
    const updated = {
      ...a,
      rpe: rpe === '' ? null : Number(rpe),
      tags: values.get('tags'),
      notes: values.get('notes'),
    };
    const status = document.querySelector('#save-state');
    status.textContent = 'Guardando…';
    form.querySelector('button').disabled = true;
    try {
      if (state.user) await cloudNotes(state.cloud, updated);
      else await localSave([updated]);
      Object.assign(a, updated);
      status.textContent = 'Guardado';
      renderContent();
    } catch (e) {
      status.textContent = `No se ha guardado: ${e.message}. Puedes reintentar.`;
    } finally {
      form.querySelector('button').disabled = false;
    }
  });
}

async function importFiles(event) {
  if (state.busy) return;
  const files = [...event.target.files];
  if (!files.length) return;
  state.busy = true;
  try {
    const imported = [],
      failures = [];
    for (const file of files) {
      toast(`Leyendo ${file.name}…`);
      try {
        imported.push(...(await parseFile(file)));
      } catch (e) {
        failures.push(`${file.name}: ${e.message}`);
      }
    }
    const existing = new Map(state.activities.map((a) => [a.id, a]));
    let added = 0;
    const updates = [];
    for (const a of imported) {
      const old = existing.get(a.id);
      if (old) {
        a.rpe = old.rpe;
        a.notes = old.notes;
        a.tags = old.tags;
        if (a.points.length < old.points.length) continue;
      } else added++;
      existing.set(a.id, a);
      updates.push(a);
    }
    if (updates.length) {
      if (state.user) await cloudSave(state.cloud, updates);
      else await localSave(updates);
      state.activities = [...existing.values()];
    }
    render();
    toast(
      `${added} sesiones nuevas; ${updates.length - added} actualizadas.${failures.length ? ' Errores: ' + failures.join(' · ') : ' Guardadas ' + (state.user ? 'en tu nube privada.' : 'en este navegador. Exporta una copia para conservarlas.')}`,
      !!failures.length,
    );
  } catch (e) {
    toast(
      `La importación no se completó: ${e.message}. Las sesiones ya guardadas pueden recuperarse al actualizar.`,
      true,
    );
  } finally {
    state.busy = false;
    event.target.value = '';
  }
}
function exportBackup() {
  const blob = new Blob(
    [JSON.stringify({ format: 'rastro-backup', version: 1, activities: state.activities })],
    { type: 'application/json' },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = `rastro-${dayKey(Date.now())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function settings() {
  const config = cloudConfig() || {};
  showDialog(
    `<p class="eyebrow">TU ESPACIO PRIVADO</p><h2>Conexión y ajustes</h2><p>El modo local guarda las actividades en este navegador. La nube usa tu proyecto de Supabase con permisos privados.</p><form id="cloud-form"><details ${config.url ? '' : 'open'}><summary>Configuración de la conexión</summary><label>URL de Supabase<input name="url" type="url" required value="${esc(config.url)}" placeholder="https://tu-proyecto.supabase.co"></label><label>Clave publicable (sb_publishable_… o anon)<input name="key" required autocomplete="off" value="${esc(config.key)}"></label></details><label>Correo de acceso a Rastro<input name="email" type="email" autocomplete="username" required></label><label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label><button class="primary">Iniciar sesión</button><p id="auth-state" role="status"></p></form><p class="hint">Utiliza tu correo y la contraseña de Rastro. Los archivos y métricas de tu cuenta requieren iniciar sesión.</p>${state.user ? '<button class="secondary" id="logout">Cerrar sesión y volver a datos locales</button>' : ''}<hr><form id="zones-form"><h3>Zonas de frecuencia cardiaca</h3><p>Cuatro límites crecientes en ppm. Son valores iniciales editables; ajústalos a tus zonas personales.</p><div class="zone-inputs">${state.zones.map((z, i) => `<label>Límite Z${i + 1}/Z${i + 2}<input name="z${i}" type="number" min="30" max="250" required value="${z}"></label>`).join('')}</div><button class="secondary">Guardar zonas</button><p id="zones-state" role="status"></p></form>`,
  );
  document.querySelector('#cloud-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget,
      values = new FormData(f),
      status = document.querySelector('#auth-state');
    status.textContent = 'Conectando…';
    f.querySelector('button').disabled = true;
    try {
      const config = { url: values.get('url').trim(), key: values.get('key').trim() },
        supabase = client(config);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: values.get('email'),
        password: values.get('password'),
      });
      if (error) throw error;
      localStorage.setItem('rastro-cloud', JSON.stringify(config));
      state.cloud = supabase;
      state.user = data.user;
      state.activities = [];
      state.health = [];
      render();
      await refresh();
      document.querySelector('#dialog').close();
    } catch (error) {
      status.textContent = `No se pudo conectar: ${error.message}`;
    } finally {
      f.querySelector('button').disabled = false;
    }
  });
  document.querySelector('#zones-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const values = new FormData(e.currentTarget),
      zones = [0, 1, 2, 3].map((i) => Number(values.get('z' + i)));
    if (zones.some((z, i) => z < 30 || z > 250 || (i && z <= zones[i - 1]))) {
      document.querySelector('#zones-state').textContent =
        'Los límites deben estar entre 30 y 250 y ser crecientes.';
      return;
    }
    state.zones = zones;
    localStorage.setItem('rastro-zones', JSON.stringify(zones));
    document.querySelector('#zones-state').textContent = 'Zonas guardadas en este dispositivo.';
    renderContent();
  });
  document.querySelector('#logout')?.addEventListener('click', async () => {
    await state.cloud.auth.signOut();
    state.user = null;
    state.health = [];
    state.activities = await localLoad();
    state.selected.clear();
    document.querySelector('#dialog').close();
    render();
  });
}
async function refresh() {
  if (state.busy) return;
  state.busy = true;
  try {
    toast('Cargando actividades…');
    if (state.user) {
      state.activities = await cloudLoad(state.cloud);
      try {
        state.health = await healthLoad(state.cloud);
      } catch (e) {
        toast(`Actividades cargadas. No se pudo leer recuperación: ${e.message}`, true);
        render();
        return;
      }
    } else state.activities = await localLoad();
    render();
    toast(state.user ? 'Datos actualizados' : 'Datos locales actualizados.');
  } catch (e) {
    toast(`No se pudieron actualizar los datos: ${e.message}`, true);
    throw e;
  } finally {
    state.busy = false;
  }
}
async function onClick(event) {
  const target = event.target.closest('button');
  if (!target) return;
  try {
    if (target.hasAttribute('data-activity-page')) {
      state.activityPage = Number(target.dataset.activityPage);
      renderContent();
      document.querySelector('[data-activity-page]:not(:disabled)')?.focus({ preventScroll: true });
    } else if (target.dataset.view) {
      if (state.detail) document.querySelector('#dialog').close();
      state.view = target.dataset.view;
      history.replaceState(null, '', `#${state.view}`);
      render();
    } else if (target.hasAttribute('data-import')) document.querySelector('#files').click();
    else if (target.dataset.detail) openDetail(target.dataset.detail);
    else if (target.hasAttribute('data-export')) exportBackup();
    else if (target.hasAttribute('data-settings')) settings();
    else if (target.hasAttribute('data-close')) document.querySelector('#dialog').close();
    else if (target.hasAttribute('data-refresh')) await refresh();
    else if (target.id === 'reset') {
      state.activityPage = 0;
      state.from = '';
      state.to = '';
      state.search = '';
      state.sport = 'all';
      document.querySelector('#from').value = '';
      document.querySelector('#to').value = '';
      document.querySelector('#search').value = '';
      document.querySelector('#sport').value = 'all';
      renderContent();
    }
  } catch (e) {
    toast(e.message, true);
  }
}
function onChange(event) {
  const e = event.target;
  if (e.id === 'distance-grouping') {
    state.grouping = e.value;
    renderContent();
    return;
  }
  if (['from', 'to', 'sport'].includes(e.id)) {
    state.activityPage = 0;
    state[e.id] = e.value;
    renderContent();
  } else if (e.id === 'map-mode') {
    state.mapMode = e.value;
    renderContent();
  } else if (e.id === 'privacy') {
    state.privacy = Number(e.value);
    renderContent();
  } else if (e.dataset.compare) {
    if (e.checked && state.selected.size >= 4) {
      e.checked = false;
      toast('Selecciona un máximo de cuatro sesiones.', true);
      return;
    }
    if (e.checked) state.selected.add(e.dataset.compare);
    else state.selected.delete(e.dataset.compare);
    if (state.view === 'compare') renderContent();
    else renderContent();
  }
}
async function start() {
  shell();
  if (views.some((v) => v[0] === location.hash.slice(1))) state.view = location.hash.slice(1);
  try {
    state.cloud = client();
    if (state.cloud) {
      const { data, error } = await state.cloud.auth.getSession();
      if (error) throw error;
      state.user = data.session?.user || null;
    }
    state.activities = state.user ? await cloudLoad(state.cloud) : await localLoad();
    if (state.user) state.health = await healthLoad(state.cloud);
  } catch (e) {
    toast(`No se pudieron cargar los datos: ${e.message}`, true);
  }
  render();
}
start();

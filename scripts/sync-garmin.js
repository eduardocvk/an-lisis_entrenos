// Runs only in Node/GitHub Actions. Never import this module from the frontend.
import { createClient } from '@supabase/supabase-js';
import { unzipSync } from 'fflate';
import { parseFit } from '../src/import.js';

const required = ['GARMIN_PERSONAL_API_KEY', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_USER_ID'];
for (const key of required)
  if (!process.env[key]) throw new Error(`Falta el secreto ${key}. Consulta README.md.`);
const userId = process.env.SUPABASE_USER_ID;
if (!/^[0-9a-f-]{36}$/i.test(userId))
  throw new Error('SUPABASE_USER_ID debe ser el UUID del usuario de Auth.');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const base = 'https://personal.connectapi.garmin.com';
const check = (r) => {
  if (r.error) throw new Error(`Supabase: ${r.error.code || r.error.statusCode || 'operación rechazada'}`);
  return r.data;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function request(path, options = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(base + path, { ...options, signal: AbortSignal.timeout(60000) });
    if (response.ok) return response;
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    // Actions logs are public: report the service, never activity IDs or dates.
    const service = path.split('/').filter(Boolean)[0];
    throw new Error(`Garmin HTTP ${response.status} en ${service}.`);
  }
}
let imported = 0;
const issues = [];
try {
  // Validate target identity before writing any personal data.
  const target = check(await supabase.auth.admin.getUserById(userId));
  if (target.user.id !== userId) throw new Error('No se pudo verificar el usuario de destino.');
  const token = await (
    await request('/personalapitoken-service/personal-api/personal-api-key/token', {
      method: 'POST',
      headers: { Authorization: `ApiKey ${process.env.GARMIN_PERSONAL_API_KEY}` },
    })
  ).json();
  if (!token.access_token) throw new Error('Garmin no devolvió un token de acceso.');
  const headers = { Authorization: `Bearer ${token.access_token}` };
  const json = async (path) => (await request(path, { headers })).json();
  const known = new Map();
  let offset = 0;
  while (true) {
    const rows = check(
      await supabase
        .from('activities')
        .select('id,summary')
        .eq('user_id', userId)
        .order('id')
        .range(offset, offset + 499),
    );
    rows.forEach((r) => known.set(String(r.summary.garminId || ''), r));
    if (rows.length < 500) break;
    offset += 500;
  }
  const full = process.env.FULL_HISTORY === 'true' || known.size === 0;
  const startDate =
    process.env.START_DATE || (full ? '' : new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10));
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate))
    throw new Error('START_DATE debe tener formato YYYY-MM-DD.');
  const limit = Math.min(500, Math.max(1, Number(process.env.MAX_ACTIVITIES) || 100));
  let start = 0,
    reachedLimit = false;
  while (!reachedLimit) {
    const params = new URLSearchParams({ start: String(start), limit: '50', activityType: 'running' });
    if (startDate) params.set('startDate', startDate);
    const batch = await json(`/activitylist-service/activities/search/activities?${params}`);
    if (!Array.isArray(batch)) throw new Error('Formato inesperado en el listado de Garmin.');
    for (const item of batch) {
      const garminId = String(item.activityId);
      if (!/^\d+$/.test(garminId)) throw new Error('Identificador de actividad de Garmin inválido.');
      if (known.has(garminId)) continue;
      if (imported >= limit) {
        reachedLimit = true;
        break;
      }
      try {
        const zip = new Uint8Array(
          await (await request(`/download-service/files/activity/${garminId}`, { headers })).arrayBuffer(),
        );
        let size = 0;
        const files = unzipSync(zip, {
          filter: (f) => {
            size += f.originalSize;
            if (size > 200 * 1024 * 1024) throw new Error('Original demasiado grande.');
            return /\.fit$/i.test(f.name);
          },
        });
        const fits = Object.values(files);
        if (fits.length !== 1) throw new Error('Se esperaba un único FIT de carrera.');
        const run = parseFit(fits[0], item.activityName || 'Carrera');
        run.garminId = garminId;
        run.source = 'Garmin Personal API';
        const old = check(
          await supabase
            .from('activities')
            .select('summary')
            .eq('user_id', userId)
            .eq('id', run.id)
            .maybeSingle(),
        );
        if (old) {
          run.rpe = old.summary.rpe;
          run.notes = old.summary.notes;
          run.tags = old.summary.tags;
        }
        const { points, laps, ...summary } = run;
        check(
          await supabase.storage.from('activity-files').upload(`${userId}/${run.id}.original.zip`, zip, {
            upsert: true,
            contentType: 'application/zip',
          }),
        );
        check(
          await supabase.storage
            .from('activity-files')
            .upload(`${userId}/${run.id}.json`, JSON.stringify({ points, laps }), {
              upsert: true,
              contentType: 'application/json',
            }),
        );
        check(
          await supabase
            .from('activities')
            .upsert({ user_id: userId, id: run.id, summary }, { onConflict: 'user_id,id' }),
        );
        imported++;
      } catch (e) {
        issues.push(e.message);
        console.error(`Una actividad no se ha importado: ${e.message}`);
      }
      await sleep(250);
    }
    if (batch.length < 50) break;
    start += 50;
  }
  // Health is imported by calendar date. Unknown fields remain null; raw is retained.
  const days = Math.min(31, Math.max(1, Number(process.env.HEALTH_DAYS) || 7));
  for (let i = 0; i < days; i++) {
    const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(
      new Date(Date.now() - i * 86400000),
    );
    const raw = {};
    for (const [key, path] of Object.entries({
      sleep: `/sleep-service/sleep/dailySleep?date=${day}`,
      hrv: `/hrv-service/hrv/${day}`,
      daily: `/usersummary-service/v2/dailysummaries?startDate=${day}&endDate=${day}`,
    })) {
      try {
        raw[key] = await json(path);
      } catch (e) {
        issues.push(e.message);
      }
      await sleep(200);
    }
    const sleepDto = raw.sleep?.dailySleepDTO,
      hrv = raw.hrv?.hrvSummary;
    const daily = Array.isArray(raw.daily?.data) ? raw.daily.data[0] : null;
    const value = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : null);
    const sleepSeconds = value(sleepDto?.sleepTimeSeconds),
      hrvValue = value(hrv?.lastNightAvg),
      resting = value(daily?.restingHeartRate);
    const health = { user_id: userId, day, raw };
    // A failed or empty endpoint must not erase previously collected values.
    if (sleepSeconds !== null) health.sleep_hours = sleepSeconds / 3600;
    if (hrvValue !== null && hrvValue > 0) health.hrv = hrvValue;
    if (resting !== null) health.resting_hr = resting;
    check(
      await supabase.from('daily_health').upsert(health, { onConflict: 'user_id,day', defaultToNull: false }),
    );
  }
  const message = `${imported} actividades importadas. ${issues.length} incidencias.${reachedLimit ? ' Límite del lote alcanzado; vuelve a ejecutar con full_history=true para continuar.' : ''}`;
  check(
    await supabase
      .from('sync_runs')
      .insert({ user_id: userId, status: issues.length ? 'partial' : 'success', imported, message }),
  );
  console.log(message);
  if (issues.length) process.exitCode = 1;
} catch (e) {
  await supabase.from('sync_runs').insert({ user_id: userId, status: 'error', imported, message: e.message });
  console.error(`Sincronización interrumpida: ${e.message}`);
  process.exitCode = 1;
}

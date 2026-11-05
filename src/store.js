import { createClient } from '@supabase/supabase-js';
let dbPromise;
function db() {
  return (dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('rastro', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('activities', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}
async function transaction(mode, action) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('activities', mode),
      request = action(tx.objectStore('activities'));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('No se pudo guardar.'));
  });
}
export const localLoad = () => transaction('readonly', (s) => s.getAll());
export const localSave = (activities) =>
  transaction('readwrite', (s) => {
    for (const a of activities) s.put(a);
  });
export function cloudConfig() {
  try {
    return JSON.parse(localStorage.getItem('rastro-cloud') || 'null');
  } catch {
    return null;
  }
}
export function client(config = cloudConfig()) {
  if (!config?.url || !config?.key) return null;
  const url = new URL(config.url);
  if (url.protocol !== 'https:') throw new Error('La URL de Supabase debe utilizar HTTPS.');
  if (config.key.startsWith('sb_secret_'))
    throw new Error('Utiliza la clave publicable, nunca una clave secreta.');
  try {
    const body = JSON.parse(atob(config.key.split('.')[1]));
    if (body.role === 'service_role')
      throw new Error('La clave service_role no puede usarse en el navegador.');
  } catch (e) {
    if (e.message.includes('service_role')) throw e;
  }
  return createClient(config.url, config.key);
}
const check = (result) => {
  if (result.error) throw result.error;
  return result.data;
};
export async function cloudLoad(supabase) {
  const session = check(await supabase.auth.getUser());
  const activities = [];
  let offset = 0;
  while (true) {
    const page = check(
      await supabase
        .from('activities')
        .select('id,summary')
        .order('id')
        .range(offset, offset + 199),
    );
    for (let i = 0; i < page.length; i += 6) {
      const batch = await Promise.all(
        page.slice(i, i + 6).map(async (row) => {
          const blob = check(
            await supabase.storage.from('activity-files').download(`${session.user.id}/${row.id}.json`),
          );
          const data = JSON.parse(await blob.text());
          return { ...data, ...row.summary, id: row.id };
        }),
      );
      activities.push(...batch);
    }
    if (page.length < 200) break;
    offset += 200;
  }
  return activities;
}
export async function cloudSave(supabase, activities) {
  const { user } = check(await supabase.auth.getUser());
  if (!user) throw new Error('Inicia sesión antes de guardar en la nube.');
  for (const activity of activities) {
    const { points, laps, ...summary } = activity;
    check(
      await supabase.storage
        .from('activity-files')
        .upload(
          `${user.id}/${activity.id}.json`,
          new Blob([JSON.stringify({ points, laps })], { type: 'application/json' }),
          { upsert: true, contentType: 'application/json' },
        ),
    );
    check(
      await supabase
        .from('activities')
        .upsert({ user_id: user.id, id: activity.id, summary }, { onConflict: 'user_id,id' }),
    );
  }
}
export async function cloudNotes(supabase, activity) {
  check(
    await supabase.rpc('save_activity_diary', {
      p_id: activity.id,
      p_rpe: activity.rpe,
      p_tags: activity.tags,
      p_notes: activity.notes,
    }),
  );
}
export async function healthLoad(supabase) {
  return check(
    await supabase
      .from('daily_health')
      .select('day,sleep_hours,hrv,resting_hr')
      .order('day', { ascending: false })
      .limit(366),
  );
}

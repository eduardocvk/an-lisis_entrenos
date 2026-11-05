// Credential check only. Never print tokens, response bodies or activity details.
const base = 'https://personal.connectapi.garmin.com';
const key = process.env.GARMIN_PERSONAL_API_KEY;
async function check() {
  if (!key) throw new Error('Falta el secreto GARMIN_PERSONAL_API_KEY.');
  const auth = await fetch(`${base}/personalapitoken-service/personal-api/personal-api-key/token`, {
    method: 'POST',
    headers: { Authorization: `ApiKey ${key}` },
    signal: AbortSignal.timeout(60000),
  });
  if (!auth.ok) throw new Error(`Garmin rechazó la autenticación: HTTP ${auth.status}.`);
  const token = await auth.json();
  if (typeof token.access_token !== 'string' || !token.access_token)
    throw new Error('La autenticación no devolvió un token válido.');
  const response = await fetch(
    `${base}/activitylist-service/activities/search/activities?start=0&limit=1&activityType=running`,
    { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(60000) },
  );
  if (!response.ok) throw new Error(`No se pudo consultar la lista de carreras: HTTP ${response.status}.`);
  const activities = await response.json();
  if (!Array.isArray(activities)) throw new Error('El listado de carreras tiene un formato inesperado.');
  console.log('Clave de Garmin válida. Autenticación y consulta de actividades correctas.');
  console.log('No se han publicado ni guardado datos de actividades en GitHub.');
}
check().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

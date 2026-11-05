// Keep response bodies out of errors: these can contain credentials or health data.
export async function readGarminToken(response, now = Date.now()) {
  const token = (await response.text()).trim();
  const invalid = () => new Error('Garmin no devolvió un token de acceso válido y vigente.');
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw invalid();
  let claims;
  try {
    claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    throw invalid();
  }
  if (!Number.isFinite(claims.exp) || claims.exp * 1000 <= now) throw invalid();
  return token;
}
export async function readGarminJson(response) {
  if (response.status === 204) return null;
  try {
    return await response.json();
  } catch {
    throw new Error('Garmin devolvió una respuesta de datos que no es JSON válido.');
  }
}

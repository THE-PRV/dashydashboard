export function asAssociateId(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

export function asToolId(value) {
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

export function asToolIdKey(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

export function routePart(value) {
  return encodeURIComponent(String(value ?? ''));
}

export function displayUserName(user) {
  if (!user || typeof user !== 'object') return '';
  return user.userName ?? user.windowsId ?? '';
}

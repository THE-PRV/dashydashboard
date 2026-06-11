function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function resolveApiBase() {
  const configuredBase = import.meta.env.VITE_API_URL ?? '';
  if (!configuredBase) return '';

  if (typeof window === 'undefined') return configuredBase;

  const { hostname, pathname } = window.location;
  if (isLocalHost(hostname) && !pathname.startsWith('/dashydashboard')) {
    return '';
  }

  return configuredBase;
}

export const API_BASE = resolveApiBase();

const AUTH_KEY = "tivo_auth_v1";
const ACTIVITY_KEY = "tivo_last_activity_v1";
export const INACTIVITY_LIMIT_MS = 30 * 60 * 1000;

export function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getStoredAuth(): boolean {
  if (!isBrowser()) return false;
  try {
    return localStorage.getItem(AUTH_KEY) === "1";
  } catch {
    return false;
  }
}

export function getLastActivity(): number {
  if (!isBrowser()) return 0;
  try {
    const v = localStorage.getItem(ACTIVITY_KEY);
    return v ? parseInt(v, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

export function setAuthenticated(): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(AUTH_KEY, "1");
    localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function touchActivity(): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function clearAuth(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(ACTIVITY_KEY);
  } catch {
    /* ignore */
  }
}

export function isSessionValid(): boolean {
  if (!getStoredAuth()) return false;
  const last = getLastActivity();
  if (!last) return false;
  return Date.now() - last <= INACTIVITY_LIMIT_MS;
}
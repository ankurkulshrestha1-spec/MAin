import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL_KEY = 'fundtracker.baseUrl';

/**
 * The API runs on the machine the user starts the server on, so the address
 * is a setting rather than a constant. localhost only works for the iOS
 * simulator and web; a physical phone needs the host's LAN IP.
 */
export const DEFAULT_BASE_URL = 'http://localhost:4000';

let cachedBaseUrl: string | null = null;

export async function getBaseUrl(): Promise<string> {
  if (cachedBaseUrl) return cachedBaseUrl;
  const stored = await AsyncStorage.getItem(BASE_URL_KEY);
  cachedBaseUrl = stored?.trim() || DEFAULT_BASE_URL;
  return cachedBaseUrl;
}

export async function setBaseUrl(url: string): Promise<void> {
  const trimmed = url.trim().replace(/\/+$/, '');
  cachedBaseUrl = trimmed || DEFAULT_BASE_URL;
  await AsyncStorage.setItem(BASE_URL_KEY, cachedBaseUrl);
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = await getBaseUrl();
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    // A network-level failure here almost always means the server address is
    // wrong or the server is not running — say so rather than surfacing a
    // bare "Network request failed".
    throw new ApiError(
      `Can't reach the tracker API at ${base}. Check the server address in Settings and that the server is running.`,
      0,
    );
  }

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body?.error) detail = typeof body.error === 'string' ? body.error : detail;
    } catch {
      // Response had no JSON body; the status line is the best we have.
    }
    throw new ApiError(detail, response.status);
  }
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
};

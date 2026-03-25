const API_URL = process.env.KAST_API_URL ?? 'http://localhost:3001';
const API_KEY = process.env.KAST_API_KEY ?? '';

export { API_URL, API_KEY };

export async function request(path: string, options?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
      ...options?.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = (body as any).message ?? res.statusText;
    throw new Error(`${res.status} ${options?.method ?? 'GET'} ${path}: ${msg}`);
  }
  return res.json();
}

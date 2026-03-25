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
    console.error(`Error ${res.status}: ${(body as any).message ?? res.statusText}`);
    process.exit(1);
  }
  return res.json();
}

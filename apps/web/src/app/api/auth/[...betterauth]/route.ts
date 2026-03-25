import { NextRequest } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function proxyToBackend(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const backendUrl = `${BACKEND_URL}${url.pathname}${url.search}`;

  const headers = new Headers();
  const FORWARDED_HEADERS = new Set([
    "cookie", "content-type", "accept", "user-agent",
    "x-forwarded-for", "origin", "referer",
  ]);
  request.headers.forEach((value, key) => {
    if (FORWARDED_HEADERS.has(key)) {
      headers.set(key, value);
    }
  });

  const body =
    request.method !== "GET" && request.method !== "HEAD"
      ? await request.arrayBuffer()
      : undefined;

  const backendResponse = await fetch(backendUrl, {
    method: request.method,
    headers,
    body,
    redirect: "manual",
  });

  // Build response headers, handling Set-Cookie separately to avoid corruption.
  // Headers.entries() joins multiple Set-Cookie values with ", " which breaks
  // cookies containing dates (e.g. Expires=Thu, 01 Jan 2025...).
  const responseHeaders = new Headers();
  backendResponse.headers.forEach((value, key) => {
    if (key === "set-cookie") return; // handled below
    responseHeaders.append(key, value);
  });

  // Forward each Set-Cookie header individually
  const setCookies = backendResponse.headers.getSetCookie();
  for (const cookie of setCookies) {
    responseHeaders.append("set-cookie", cookie);
  }

  // Handle redirects — rewrite backend URL to frontend URL
  if (backendResponse.status >= 300 && backendResponse.status < 400) {
    const location = backendResponse.headers.get("location");
    if (location) {
      const frontendUrl = location.replace(BACKEND_URL, url.origin);
      responseHeaders.set("location", frontendUrl);
    }
  }

  return new Response(backendResponse.body, {
    status: backendResponse.status,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest) {
  return proxyToBackend(request);
}

export async function POST(request: NextRequest) {
  return proxyToBackend(request);
}

export const dynamic = "force-dynamic";

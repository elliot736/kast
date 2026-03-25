import { lookup } from 'dns/promises';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
]);

function isPrivateIP(ip: string): boolean {
  // IPv4 private/reserved ranges
  if (/^127\./.test(ip)) return true;
  if (/^10\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true; // link-local / cloud metadata
  if (ip === '0.0.0.0') return true;

  // IPv6 loopback and private
  if (ip === '::1' || ip === '::' || ip === '0:0:0:0:0:0:0:1') return true;
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // unique local
  if (ip.startsWith('fe80')) return true; // link-local

  return false;
}

/**
 * Validates that a URL is safe to make outbound HTTP requests to.
 * Blocks private IPs, localhost, and cloud metadata endpoints.
 * Throws an error if the URL is not allowed.
 */
export async function validateOutboundUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Blocked URL: only http/https allowed`);
  }

  const hostname = parsed.hostname;

  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) {
    throw new Error(`Blocked URL: ${hostname} is not allowed`);
  }

  // Check if hostname is a raw IP
  if (isPrivateIP(hostname)) {
    throw new Error(`Blocked URL: private/reserved IP address`);
  }

  // Resolve hostname and check resolved IPs
  try {
    const { address } = await lookup(hostname);
    if (isPrivateIP(address)) {
      throw new Error(`Blocked URL: ${hostname} resolves to private IP`);
    }
  } catch (err: any) {
    if (err.message?.startsWith('Blocked URL:')) throw err;
    // DNS resolution failure — let the actual fetch handle it
  }
}

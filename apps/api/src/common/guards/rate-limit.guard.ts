import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 300; // 300 pings per minute per IP

const ipCounts = new Map<string, { count: number; resetAt: number }>();

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipCounts) {
    if (entry.resetAt < now) ipCounts.delete(ip);
  }
}, 300_000);

@Injectable()
export class RateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip ?? request.connection?.remoteAddress ?? 'unknown';
    const now = Date.now();

    let entry = ipCounts.get(ip);
    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + WINDOW_MS };
      ipCounts.set(ip, entry);
    }

    entry.count++;

    if (entry.count > MAX_REQUESTS) {
      throw new HttpException(
        'Rate limit exceeded — max 300 pings per minute',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}

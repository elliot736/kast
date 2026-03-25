import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './auth.decorator';
import { AuthService } from './auth.service';
import { auth } from './better-auth';
import { fromNodeHeaders } from 'better-auth/node';

@Injectable()
export class UnifiedAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();

    // Try API key first (for programmatic access)
    const apiKey = request.headers['x-api-key'] as string;
    if (apiKey) {
      const valid = await this.authService.validateApiKey(apiKey);
      if (valid) return true;
      throw new UnauthorizedException('Invalid API key');
    }

    // Try session cookie (for dashboard/browser access)
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });
      if (session?.user) {
        request.user = session.user;
        return true;
      }
    } catch {
      // Session check failed, fall through
    }

    throw new UnauthorizedException('Authentication required — provide x-api-key header or sign in');
  }
}

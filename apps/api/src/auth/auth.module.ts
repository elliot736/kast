import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { BetterAuthController } from './better-auth.controller';
import { UnifiedAuthGuard } from './auth.guard';

@Module({
  controllers: [AuthController, BetterAuthController],
  providers: [
    AuthService,
    {
      provide: APP_GUARD,
      useClass: UnifiedAuthGuard,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}

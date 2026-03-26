import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from './auth.decorator';
import { AuthService } from './auth.service';

@ApiTags('api-keys')
@Controller('api/v1/api-keys')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post()
  @Public()
  // TODO: restrict to authenticated users once E2E tests use a shared bootstrap key
  @ApiOperation({ summary: 'Create a new API key' })
  @ApiResponse({ status: 201, description: 'API key created' })
  async create(@Body('label') label?: string) {
    return this.authService.createApiKey(label);
  }

  @Get()
  @ApiOperation({ summary: 'List all API keys' })
  @ApiResponse({ status: 200, description: 'List of API keys' })
  async list() {
    return this.authService.listApiKeys();
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke an API key' })
  @ApiResponse({ status: 200, description: 'API key revoked' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async revoke(@Param('id') id: string) {
    await this.authService.deleteApiKey(id);
    return { deleted: true };
  }
}

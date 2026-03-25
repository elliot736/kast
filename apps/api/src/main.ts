import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { json, urlencoded, raw, text } from 'express';
import { AppModule } from './app.module';
import { PinoLoggerService } from './common/logger/pino-logger.service';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const logger = new PinoLoggerService();
  app.useLogger(logger);
  app.useGlobalFilters(new GlobalExceptionFilter());

  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));
  app.use(text({ limit: '1mb', type: 'text/*' }));
  app.use(raw({ limit: '1mb', type: 'application/octet-stream' }));

  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const port = config.get<number>('API_PORT', 3001);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Kast API')
    .setDescription('Event-driven job & pipeline monitor')
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const corsOrigin = config.get<string>('CORS_ORIGIN', '*');
  app.enableCors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(','),
    credentials: true,
  });

  await app.listen(port);
  logger.log(`Kast API running on http://localhost:${port}`);
  logger.log(`Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();

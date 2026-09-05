import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './realtime/adapters/redis-io.adapter';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // ─── Security ──────────────────────────────────────
  app.use(helmet());
  app.enableCors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  });

  // ─── Global Prefix ─────────────────────────────────
  app.setGlobalPrefix('api', { exclude: ['health'] });

  // ─── Global pipes ──────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ─── Global filters ───────────────────────────────
  app.useGlobalFilters(new AllExceptionsFilter());

  // ─── WebSocket adapter ─────────────────────────────
  const redisIoAdapter = new RedisIoAdapter(app);
  try {
    await redisIoAdapter.connectToRedis();
    app.useWebSocketAdapter(redisIoAdapter);
    logger.log('Redis WebSocket adapter connected');
  } catch (err) {
    logger.warn('Redis adapter failed — falling back to default adapter', err);
  }

  // ─── Start ─────────────────────────────────────────
  const port = process.env.API_PORT || 3000;
  await app.listen(port);
  logger.log(`🚀 FriendMap API listening on port ${port}`);
}

bootstrap();

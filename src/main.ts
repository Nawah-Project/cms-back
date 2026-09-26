import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import cookieParser from 'cookie-parser';
import { validateEnvironment } from './config/env.validation';

async function bootstrap() {
  validateEnvironment();
  const { AppModule } = await import('./app.module.js');
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.disable('x-powered-by');
  const trustProxy = Number(process.env.TRUST_PROXY || 0);
  if (trustProxy > 0) expressApp.set('trust proxy', trustProxy);
  app.use(helmet());
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: false, limit: '1mb' }));
  app.enableCors({
    origin: (
      process.env.FRONTEND_ORIGIN ||
      'http://localhost:5173,http://localhost:5174'
    )
      .split(',')
      .map((value) => value.trim()),
    credentials: true,
  });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}
void bootstrap().catch((error: unknown) => {
  const message =
    error instanceof Error && error.message.startsWith('Configuration error:')
      ? error.message
      : 'Server startup failed. Check environment configuration and database connectivity.';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

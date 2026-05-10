// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { ValidationPipe } from '@nestjs/common'; // 🔥 IMPORTED VALIDATION PIPE
import { json, urlencoded } from 'express'; // 🔥 1. Add this import

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // Serve static files from the 'uploads' directory at the /uploads route
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  // 🔥 ENABLE CORS
  app.enableCors({
    origin: 'http://localhost:3001', 
    credentials: true,
  });

  // 🔥 2. Add these two lines to increase the payload limit to 50 Megabytes
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // 🔥 NEW: Enable strict validation globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Automatically strip away any extra fields hackers try to send
      forbidNonWhitelisted: true, // Throw an error if they send unrecognized fields
      transform: true, // Automatically transform payloads to match our DTO classes
    }),
  );

  await app.listen(3000); 
}
bootstrap();
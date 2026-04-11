// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { ValidationPipe } from '@nestjs/common'; // 🔥 IMPORTED VALIDATION PIPE

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
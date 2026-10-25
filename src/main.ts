import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConsoleLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { setupApp } from './setup-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({
      logLevels: ['error', 'warn', 'log'],
      prefix: 'FBudget'
    })
  });
  setupApp(app)

  const config = app.get(ConfigService)
  if (config.get('NODE_ENV') !== 'prod') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('FBudget API')
      .setVersion('1.0')
      .addBearerAuth()
      .build()
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig))
  }

  await app.listen(config.get('PORT')!);
}
bootstrap();

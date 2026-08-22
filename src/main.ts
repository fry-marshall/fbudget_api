import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ConsoleLogger } from '@nestjs/common';
import { GlobalInterceptor } from './common/interceptors/global-interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({
      logLevels: ['error', 'warn', 'log'],
      prefix: 'FBudget'
    })
  });
  app.useGlobalFilters(new HttpExceptionFilter())
  app.useGlobalInterceptors(new GlobalInterceptor())
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

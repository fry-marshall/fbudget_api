import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

/**
 * Apply the global prefix, versioning, filters, interceptors and pipes, shared by main.ts and e2e tests
 */
export function setupApp(app: INestApplication): void {
  // Behind the nginx gateway, read the client IP from X-Forwarded-For for the throttler
  app.getHttpAdapter().getInstance().set('trust proxy', 1)
  app.setGlobalPrefix('api')
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  })
  app.useGlobalFilters(new GlobalExceptionFilter())
  app.useGlobalInterceptors(new ResponseInterceptor())
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
  }))
}

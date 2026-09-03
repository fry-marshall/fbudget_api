import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { envValidationSchema } from './config/env.validation';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './config/database.config';
import { TestController } from './modules/test/test.controller';
import { AuthModule } from './modules/auth/auth.module';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { JwtStrategy } from './common/strategies/jwt.strategy';
import { UserModule } from './modules/users/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV ?? 'dev'}`, '.env'],
      validationSchema: envValidationSchema,
      load: [databaseConfig]
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => config.get('database')!
    }),
    AuthModule,
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return {
          transport: {
            host: config.get('MAIL_HOST'),
            port: config.get('MAIL_PORT'),
            auth: {
              user: config.get('MAIL_USERNAME'),
              pass: config.get('MAIL_PASSWORD'),
            },
          },
          defaults: {
            from: `"FBudget" <${config.get('MAIL_USERNAME')}>`,
          },
          template: {
            adapter: new HandlebarsAdapter(),
          },
        }
      }

    }),
    UserModule
  ],
  controllers: [AppController, TestController],
  providers: [AppService, JwtStrategy],
})
export class AppModule { }

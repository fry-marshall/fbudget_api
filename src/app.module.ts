import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { envValidationSchema } from './config/env.validation';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './config/database.config';
import { AuthModule } from './modules/auth/auth.module';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { JwtStrategy } from './common/strategies/jwt.strategy';
import { UserModule } from './modules/users/user.module';
import { AccountModule } from './modules/accounts/account.module';
import { CategoryModule } from './modules/categories/category.module';
import { IncomeModule } from './modules/incomes/income.module';
import { FixedChargeModule } from './modules/fixed-charges/fixed-charge.module';
import { TransactionModule } from './modules/transactions/transaction.module';
import { ProvisionModule } from './modules/provisions/provision.module';
import { InstallmentPlanModule } from './modules/installment-plans/installment-plan.module';
import { SavingsGoalModule } from './modules/savings-goals/savings-goal.module';
import { TransferModule } from './modules/transfers/transfer.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { PlanningModule } from './modules/planning/planning.module';
import { ERRORS_MESSAGES } from './common/constants';

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
    UserModule,
    AccountModule,
    CategoryModule,
    IncomeModule,
    FixedChargeModule,
    TransactionModule,
    ProvisionModule,
    InstallmentPlanModule,
    SavingsGoalModule,
    TransferModule,
    ScheduleModule.forRoot(),
    PlanningModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [{
          ttl: config.get('THROTTLE_TTL')!,
          limit: config.get('THROTTLE_LIMIT')!,
        }],
        errorMessage: ERRORS_MESSAGES.EXCEPTIONS.TOO_MANY_REQUESTS
      })
    })
  ],
  providers: [JwtStrategy],
})
export class AppModule { }

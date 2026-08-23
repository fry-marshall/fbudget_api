import { registerAs } from "@nestjs/config";
import { DataSourceOptions } from "typeorm";


export const databaseConfig = registerAs(
  'database', 
  (): DataSourceOptions => {
    return {
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [__dirname + '/../modules/**/*.entity{.ts,.js}'],
      migrations: [__dirname + '/../database/**/migrations/*{.ts,.js}'],
      synchronize: process.env.NODE_ENV === 'test',
      ssl: process.env.NODE_ENV === 'test' ? false : { rejectUnauthorized: true }
    }
  }
)
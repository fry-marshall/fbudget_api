import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { databaseConfig } from './config/database.config';


dotenv.config({path: `.env.${process.env.NODE_ENV || 'dev'}` })

export const AppDataSource = new DataSource(databaseConfig());
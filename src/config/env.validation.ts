import Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('dev', 'prod', 'test').required(),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().required(),
  ACCESS_TOKEN_SECRET: Joi.string().min(32).required(),
  REFRESH_TOKEN_SECRET: Joi.string().min(32).required(),
  ACCESS_TOKEN_EXPIRY: Joi.string().default('7d'),
  REFRESH_TOKEN_EXPIRY: Joi.string().default('30d'),
  MAIL_HOST: Joi.string().required(),
  MAIL_PORT: Joi.number().required(), 
  MAIL_USERNAME: Joi.string().required(), 
  MAIL_PASSWORD: Joi.string().required(), 
  GOOGLE_CLIENT_ID:Joi.string().required(), 
  GOOGLE_CLIENT_SECRET: Joi.string().required(),
});

import Joi from 'joi';

const NODE_ENV = process.env.NODE_ENV ?? 'dev'
const optionalString = Joi.string().optional()
const optionalNumber = Joi.number().optional()

const isStringNotTestRequired = Joi.string().when(NODE_ENV, {
  not: 'test',
  then: Joi.required(),
  otherwise: optionalString
})

const isNumberNotTestRequired = Joi.number().when(NODE_ENV, {
  not: 'test',
  then: Joi.required(),
  otherwise: optionalNumber
})

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('dev', 'prod', 'test').required(),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().required(),
  ACCESS_TOKEN_SECRET: Joi.string().min(32).required(),
  REFRESH_TOKEN_SECRET: Joi.string().min(32).required(),
  ACCESS_TOKEN_EXPIRY: Joi.string().default('7d'),
  REFRESH_TOKEN_EXPIRY: Joi.string().default('30d'),
  MAIL_HOST: isStringNotTestRequired,
  MAIL_PORT: isNumberNotTestRequired, 
  MAIL_USERNAME: isStringNotTestRequired, 
  MAIL_PASSWORD: isStringNotTestRequired, 
  GOOGLE_CLIENT_ID: isStringNotTestRequired, 
  GOOGLE_CLIENT_SECRET: isStringNotTestRequired,
});

import Joi from 'joi';

const optionalString = Joi.string().optional()
const optionalNumber = Joi.number().optional()

const isStringNotTestRequired = Joi.string().when('NODE_ENV', {
  not: 'test',
  then: Joi.required(),
  otherwise: optionalString
})

const isNumberNotTestRequired = Joi.number().when('NODE_ENV', {
  not: 'test',
  then: Joi.required(),
  otherwise: optionalNumber
})

// The e2e suites share one IP, so the limit is high in test unless set explicitly
const throttleLimit = Joi.number().when('NODE_ENV', {
  is: 'test',
  then: Joi.number().default(1000),
  otherwise: Joi.number().default(5)
})

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('dev', 'prod', 'test').required(),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().required(),
  ACCESS_TOKEN_SECRET: Joi.string().min(32).required(),
  REFRESH_TOKEN_SECRET: Joi.string().min(32).required(),
  ACCESS_TOKEN_EXPIRY: Joi.string().default('15m'),
  REFRESH_TOKEN_EXPIRY: Joi.string().default('30d'),
  THROTTLE_TTL: Joi.number().default(60000),
  THROTTLE_LIMIT: throttleLimit,
  MAIL_HOST: isStringNotTestRequired,
  MAIL_PORT: isNumberNotTestRequired, 
  MAIL_USERNAME: isStringNotTestRequired, 
  MAIL_PASSWORD: isStringNotTestRequired, 
  GOOGLE_CLIENT_ID: isStringNotTestRequired, 
});

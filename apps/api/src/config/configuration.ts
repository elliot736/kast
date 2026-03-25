import { envSchema } from './env.validation';

export default () => {
  const env = envSchema.parse(process.env);
  return {
    databaseUrl: env.DATABASE_URL,
    kafka: {
      brokers: env.KAFKA_BROKERS.split(','),
      clientId: env.KAFKA_CLIENT_ID,
    },
    port: env.API_PORT,
    nodeEnv: env.NODE_ENV,
  };
};

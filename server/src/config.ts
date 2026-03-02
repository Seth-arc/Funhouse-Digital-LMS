import 'dotenv/config';

const parseBoolean = (value: string | undefined, fallback = false): boolean => {
  if (typeof value !== 'string') return fallback;
  return value.trim().toLowerCase() === 'true';
};

export const getRequiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
};

export const getJwtSecret = (): string => getRequiredEnv('JWT_SECRET');

export const allowInitialTutorSignup = parseBoolean(process.env.ALLOW_INITIAL_TUTOR_SIGNUP, false);
export const bootstrapDemoAdmin = parseBoolean(process.env.BOOTSTRAP_DEMO_ADMIN, false);
export const jsonBodyLimit = process.env.JSON_BODY_LIMIT?.trim() || '6mb';

export const getCorsOrigins = (): string[] => {
  const raw = process.env.CORS_ORIGIN;
  if (!raw || !raw.trim()) {
    return ['http://localhost:3000'];
  }

  const origins = raw
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  return origins.length > 0 ? origins : ['http://localhost:3000'];
};

export const getFrontendAppUrl = (): string => {
  const explicit = process.env.FRONTEND_URL?.trim();
  if (explicit) return explicit;
  return getCorsOrigins()[0] || 'http://localhost:3000';
};

import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

export const serverDirectory = fileURLToPath(new URL('./', import.meta.url));
dotenv.config({ path: new URL('.env', import.meta.url), quiet: true });

export const config = {
  apiKey: process.env.RENTCAST_API_KEY,
  useFixtures: process.env.USE_FIXTURES === 'true',
  port: Number(process.env.PORT) || 3001,
};

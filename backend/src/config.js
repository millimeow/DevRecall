import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

export const config = {
  dbPath: process.env.DEVRECALL_DB || fileURLToPath(new URL('../devrecall.db', import.meta.url)),
  ollamaUrl: (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, ''),
  model: process.env.OLLAMA_MODEL || 'qwen2.5:3b',
  timeoutMs: Math.min(600, Math.max(1, Number(process.env.MODEL_TIMEOUT) || 240)) * 1000,
  port: Number(process.env.PORT) || 8000,
};

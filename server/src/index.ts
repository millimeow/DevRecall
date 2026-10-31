import pino from 'pino';
import { openDatabase } from './db.js';
import { GitHubClient } from './github.js';
import { makeAI } from './ai.js';
import { createApp } from './app.js';
import { Worker } from './worker.js';
const logger = pino({ redact: ['token', 'authorization', 'AI_API_KEY', 'GITHUB_TOKEN'] });
const db = openDatabase();
const github = new GitHubClient();
const ai = makeAI(process.env);
const worker = new Worker(db, github, ai);
const app = createApp({ db, github, ai });
const port = Number(process.env.PORT) || 3001;
const server = app.listen(port, process.env.HOST || '127.0.0.1', () => {
  logger.info({ port, aiConfigured: ai.configured }, 'DevRecall started');
  worker.start();
});
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  logger.info('Saving worker progress before shutdown');
  server.close();
  await worker.stop();
  db.close();
}
process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});

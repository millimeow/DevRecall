import { config } from './config.js';
import { openDatabase, now } from './database.js';
import { createOllama } from './llm.js';
import { createApp } from './app.js';

const db = openDatabase(config.dbPath);
db.prepare("UPDATE runs SET status='failed', error_message='Server restarted during analysis. Please retry.', completed_at=? WHERE status='running'").run(now());
const app = createApp({ db, config, llm: createOllama(config) });
const server = app.listen(config.port, '127.0.0.1', () => console.log(`DevRecall Express API: http://127.0.0.1:${config.port}`));
server.on('error', error => { console.error(`Cannot start API: ${error.message}`); db.close(); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(() => { db.close(); process.exit(0); });
});

import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './web/test',
  fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'npm run dev -w server',
      url: 'http://127.0.0.1:4311/api/v1/health',
      env: { PORT: '4311', DATABASE_PATH: ':memory:', APP_ORIGIN: 'http://127.0.0.1:4173' },
      timeout: 30000,
    },
    {
      command: 'npm run dev -w web -- --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      env: { DEVRECALL_API_URL: 'http://127.0.0.1:4311' },
      timeout: 30000,
    },
  ],
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 } } },
  ],
});

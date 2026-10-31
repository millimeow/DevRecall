import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

const rootEnv = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(rootEnv)) loadEnvFile(rootEnv);

const nextConfig = {
  poweredByHeader: false,
  // Local inference can outlast Next's default 30-second proxy timeout.
  experimental: { proxyTimeout: 900000 },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${process.env.API_BASE_URL || 'http://127.0.0.1:8000'}/api/:path*` }];
  },
};
export default nextConfig;

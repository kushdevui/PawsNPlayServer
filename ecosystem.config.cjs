// PM2 process file for servers (e.g. EC2): `npm run build && pm2 start ecosystem.config.cjs`
// Settings come from .env in this folder (loaded by the app); NODE_ENV is forced to production here.
module.exports = {
  apps: [
    {
      name: 'pawsnplay-api',
      script: 'dist/server.js',
      cwd: __dirname,
      instances: 1, // keep 1: rate limits and booking locks assume a single process per server
      autorestart: true,
      max_memory_restart: '400M',
      env: { NODE_ENV: 'production' },
    },
  ],
};

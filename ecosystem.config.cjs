module.exports = {
  apps: [
    {
      name: 'office-game',
      cwd: __dirname,
      script: 'npm',
      args: 'run start',
      env: { NODE_ENV: 'production', PORT: 2567 },
      autorestart: true,
      max_memory_restart: '512M',
    },
  ],
};

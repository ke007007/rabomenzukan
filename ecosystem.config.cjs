module.exports = {
  apps: [
    {
      name: 'webapp',
      script: 'npx',
      // Enable D1 in local dev. Uses local SQLite mapped to production name.
      args: 'wrangler pages dev dist --d1=webapp-production --local --ip 0.0.0.0 --port 3000',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}

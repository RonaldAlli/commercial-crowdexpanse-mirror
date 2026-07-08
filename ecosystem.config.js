module.exports = {
  apps: [
    {
      name: "crowdexpanse-commercial",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3030",
      cwd: "/opt/crowdexpanse/commercial",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "3030",
      },
      max_memory_restart: "512M",
      autorestart: true,
      watch: false,
    },
  ],
};

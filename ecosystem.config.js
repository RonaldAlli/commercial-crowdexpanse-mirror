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
    {
      // Automation runtime (v2.0.1). DECLARED here but DELIBERATELY INERT: it is NOT started as
      // part of this release. `pm2 start ecosystem.config.js` launches only the app above unless
      // this process is named explicitly. Even when started, the scheduler stays OFF until the
      // AUTOMATION_SCHEDULER_ENABLED kill-switch is set to "1" — so the executor/scheduler poll
      // nothing by default. Turning on automation in production is a separate, explicit, founder-
      // gated operational step (see the v2.0.1 runbook), never a side effect of a deploy.
      name: "crowdexpanse-automation",
      script: "scripts/automation-runtime.mjs",
      cwd: "/opt/crowdexpanse/commercial",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        // Kill-switch OFF by default. The runtime enumerates nothing and performs no work until
        // this is explicitly set to "1". Left unset here so a stray start is a harmless no-op.
        AUTOMATION_SCHEDULER_ENABLED: "0",
      },
      max_memory_restart: "384M",
      autorestart: true,
      // Not started on deploy: bring it up deliberately with `pm2 start crowdexpanse-automation`.
      watch: false,
    },
  ],
};

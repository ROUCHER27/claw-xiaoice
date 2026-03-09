#!/usr/bin/env node

const { startVideoTaskService } = require('./server');

async function main() {
  const service = await startVideoTaskService({
    port: process.env.VIDEO_TASK_SERVICE_PORT
  });

  console.log(`[video-task-service] listening on http://127.0.0.1:${service.port}`);

  const shutdown = async (signal) => {
    console.log(`[video-task-service] ${signal} received, shutting down...`);
    await service.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    shutdown('SIGTERM').catch((error) => {
      console.error('[video-task-service] shutdown failed', error);
      process.exit(1);
    });
  });

  process.on('SIGINT', () => {
    shutdown('SIGINT').catch((error) => {
      console.error('[video-task-service] shutdown failed', error);
      process.exit(1);
    });
  });
}

main().catch((error) => {
  console.error('[video-task-service] startup failed', error);
  process.exit(1);
});

require('dotenv').config();
const path = require('path');
const { ShardingManager } = require('discord.js');
const logger = require('./utils/logger');

// Resolve environment profile (e.g., 'main' or 'dev') and pick suffixed vars if present
const PROFILE = (process.env.BOT_PROFILE || process.env.ENV_PROFILE || 'dev').toLowerCase();
const SUFFIX = PROFILE.toUpperCase();
const resolveEnv = (base) => process.env[`${base}_${SUFFIX}`] ?? process.env[base];

const token = resolveEnv('DISCORD_TOKEN');
if (!token) {
  logger.error(`Missing DISCORD_TOKEN (or DISCORD_TOKEN_${SUFFIX}) for profile '${PROFILE}'`, 'SHARDER');
  process.exit(1);
}

// Allow manual shard count override via env, otherwise let Discord recommend automatically
const manualCount = Number(resolveEnv('SHARD_COUNT') || resolveEnv('DISCORD_SHARD_COUNT'));
const totalShards = Number.isFinite(manualCount) && manualCount > 0 ? manualCount : 'auto';

const manager = new ShardingManager(path.join(__dirname, 'index.js'), {
  token,
  totalShards,
  respawn: true,
  mode: 'worker',
});

manager.on('shardCreate', (shard) => {
  logger.lifecycle(`Launched shard ${shard.id}`, 'SHARD');

  shard.on('death', (process) => {
    logger.warn(`Shard ${shard.id} died (pid ${process.pid}). Respawning...`, 'SHARD');
  });

  shard.on('disconnect', () => {
    logger.warn(`Shard ${shard.id} disconnected`, 'SHARD');
  });

  shard.on('reconnecting', () => {
    logger.info(`Shard ${shard.id} reconnecting`, 'SHARD');
  });
});

(async () => {
  try {
    const spawned = await manager.spawn({ timeout: 30000 });
    logger.lifecycle(`Spawned ${spawned.size} shard(s) [${totalShards === 'auto' ? 'auto' : totalShards}]`, 'SHARD');
  } catch (error) {
    logger.errorWithStack('Failed to spawn shards', error, 'SHARD');
    process.exit(1);
  }
})();

// Global error handling for the manager process
process.on('unhandledRejection', (error) => {
  logger.errorWithStack('Unhandled promise rejection (manager)', error, 'PROCESS');
});

process.on('uncaughtException', (error) => {
  logger.errorWithStack('Uncaught exception (manager)', error, 'PROCESS');
  process.exit(1);
});



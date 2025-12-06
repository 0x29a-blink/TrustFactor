const { SlashCommandBuilder, MessageFlags, AttachmentBuilder } = require('discord.js');
const os = require('os');
const { supabase } = require('../config/database');
const logger = require('../utils/logger');

function formatUptime(ms) {
  let seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400); seconds -= days * 86400;
  const hours = Math.floor(seconds / 3600); seconds -= hours * 3600;
  const minutes = Math.floor(seconds / 60); seconds -= minutes * 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

function calculateCpuPercent() {
  try {
    const usage = process.cpuUsage(); // microseconds since process start
    const elapsedSec = process.uptime();
    const cores = Math.max(os.cpus()?.length || 1, 1);
    const totalCpuSec = (usage.user + usage.system) / 1e6; // to seconds
    const percent = (totalCpuSec / (elapsedSec * cores)) * 100;
    if (!isFinite(percent) || percent < 0) return 0;
    return Math.min(100, percent);
  } catch (_) {
    return 0;
  }
}

async function getServerCount(client) {
  // Shard-aware guild count
  if (client.shard) {
    try {
      const counts = await client.shard.fetchClientValues('guilds.cache.size');
      return (counts || []).reduce((a, b) => a + (Number(b) || 0), 0);
    } catch (err) {
      logger.warn(`Failed to fetch shard guild counts: ${err.message}`, 'STATS');
    }
  }
  return client.guilds.cache.size;
}

async function getShardCount(client) {
  if (client.shard && typeof client.shard.count === 'number') {
    return client.shard.count;
  }
  return 1;
}

async function getPointsSummary() {
  try {
    // Manual sums with pagination for reliability across environments
    const pageSize = 10000;

    async function sumHistory(sign) {
      let sum = 0;
      let offset = 0;
      for (;;) {
        let query = supabase
          .from('score_history')
          .select('point_change')
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);
        query = sign === 'pos' ? query.gt('point_change', 0) : query.lt('point_change', 0);
        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;
        if (sign === 'pos') {
          sum += data.reduce((s, r) => s + Number(r.point_change || 0), 0);
        } else {
          sum += data.reduce((s, r) => s + Math.abs(Number(r.point_change || 0)), 0);
        }
        if (data.length < pageSize) break;
        offset += pageSize;
      }
      return sum;
    }

    let [granted, removedAbs] = await Promise.all([
      sumHistory('pos'),
      sumHistory('neg')
    ]);

    // Fallback if history is empty: approximate from current scores
    if (granted === 0 && removedAbs === 0) {
      try {
        const { data: scoreRows, error: scoreErr } = await supabase
          .from('scores')
          .select('total_score');
        if (!scoreErr && Array.isArray(scoreRows)) {
          granted = scoreRows
            .filter(r => (r.total_score || 0) > 0)
            .reduce((s, r) => s + (r.total_score || 0), 0);
          removedAbs = scoreRows
            .filter(r => (r.total_score || 0) < 0)
            .reduce((s, r) => s + Math.abs(r.total_score || 0), 0);
        }
      } catch (_) { /* ignore */ }
    }

    if (Object.is(granted, -0)) granted = 0;
    if (Object.is(removedAbs, -0)) removedAbs = 0;

    return { granted, removedAbs };
  } catch (error) {
    logger.errorWithStack('Error fetching points summary', error, 'STATS');
    return { granted: 0, removedAbs: 0 };
  }
}

async function getTotalVotes() {
  try {
    const { data, error, count } = await supabase
      .from('votes')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    return Number(count || 0);
  } catch (error) {
    logger.errorWithStack('Error counting votes', error, 'STATS');
    return 0;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Display bot and database statistics as an image'),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const [serverCount, shardCount, points, totalVotes] = await Promise.all([
        getServerCount(interaction.client),
        getShardCount(interaction.client),
        getPointsSummary(),
        getTotalVotes(),
      ]);

      // Aggregate process metrics across shards when available
      let cpuPct = calculateCpuPercent();
      let memPct = (() => {
        const used = process.memoryUsage().rss || 0;
        const total = os.totalmem();
        return total > 0 ? (used / total) * 100 : 0;
      })();
      let uptimeStr = formatUptime(interaction.client.uptime || 0);

      if (interaction.client.shard) {
        try {
          const results = await interaction.client.shard.broadcastEval(() => {
            const osLocal = require('os');
            const usage = process.cpuUsage();
            const elapsedSec = process.uptime();
            const cores = Math.max((osLocal.cpus()?.length || 1), 1);
            const totalCpuSec = (usage.user + usage.system) / 1e6;
            const pct = (totalCpuSec / (elapsedSec * cores)) * 100;
            const rss = process.memoryUsage().rss || 0;
            return { cpuPct: Number.isFinite(pct) && pct >= 0 ? pct : 0, rss, uptimeSec: elapsedSec, totalMem: osLocal.totalmem() };
          });
          const shardCountNum = Array.isArray(results) ? results.length : 0;
          if (shardCountNum > 0) {
            const totalRss = results.reduce((sum, r) => sum + (r?.rss || 0), 0);
            const avgCpu = results.reduce((sum, r) => sum + (r?.cpuPct || 0), 0) / shardCountNum;
            const maxUptime = Math.max(...results.map(r => r?.uptimeSec || 0));
            const totalMem = results[0]?.totalMem || os.totalmem();
            cpuPct = avgCpu;
            memPct = totalMem > 0 ? (totalRss / totalMem) * 100 : 0;
            uptimeStr = formatUptime(maxUptime * 1000);
          }
        } catch (_) {
          // Fallback to per-shard values already set
        }
      }

      const { renderStatsImage } = require('../utils/statsImage');
      const img = await renderStatsImage({
        shards: shardCount,
        serverCount,
        uptime: uptimeStr,
        cpuPct,
        memPct,
        pointsGranted: points.granted,
        pointsRemovedAbs: points.removedAbs,
        totalVotes,
      });
      const attachment = new AttachmentBuilder(img, { name: 'trustfactor-stats.png' });
      return await interaction.editReply({ files: [attachment] });
    } catch (error) {
      logger.errorWithStack('Error executing stats command', error, 'STATS');
      if (interaction.deferred || interaction.replied) {
        return await interaction.editReply({ content: '❌ Failed to retrieve stats.' });
      }
      return await interaction.reply({ content: '❌ Failed to retrieve stats.', flags: MessageFlags.Ephemeral });
    }
  },
};



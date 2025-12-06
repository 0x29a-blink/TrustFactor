const { supabase } = require('../../config/database');
const { toIdString, asText } = require('../ids');
const { getServerSyncStatus, isServerPriority } = require('../syncUtils');
const logger = require('../logger');

// Simple in-memory cache for server configs
const configCache = new Map();
const CONFIG_CACHE_TTL = 60 * 1000; // 60 seconds

/**
 * Config and preferences related DB utilities
 */

async function getServerConfig(serverId) {
  // Check cache first
  const cacheKey = String(serverId);
  if (configCache.has(cacheKey)) {
    const { data, expires } = configCache.get(cacheKey);
    if (Date.now() < expires) {
      return data;
    }
    configCache.delete(cacheKey);
  }

  try {
    // Check if server is in sync group but not priority - use priority server's config
    const syncStatus = await getServerSyncStatus(serverId);
    const isPriority = await isServerPriority(serverId);

    let targetServerId = serverId;
    if (syncStatus && !isPriority) {
      targetServerId = syncStatus.sync_groups.priority_server;
    }

    // Try to get existing server config; cast log_channel to TEXT for safe snowflake handling
    let { data, error } = await supabase
      .from('servers')
      .select(`
        *,
        ${asText('log_channel')}
      `)
      .eq('server_id', toIdString(targetServerId))
      .single();

    if (error && error.code === 'PGRST116') {
      if (targetServerId !== serverId) {
        // Priority server not found, fall back to original server
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('servers')
          .select(`
            *,
            ${asText('log_channel')}
          `)
          .eq('server_id', toIdString(serverId))
          .single();
        if (!fallbackError) {
          configCache.set(cacheKey, { data: fallbackData, expires: Date.now() + CONFIG_CACHE_TTL });
          return fallbackData;
        }
      }

      // Insert defaults
      const { data: newServer, error: insertError } = await supabase
        .from('servers')
        .insert({
          server_id: toIdString(serverId),
          threshold: 3,
          voting_timeout: 5,
          reaction_mode: false,
          threshold_mode: 'fixed',
          formula_base: 1,
          formula_multiplier: 1,
          max_points_per_award: 10,
          min_points_per_award: -10,
          min_vote_magnitude: 1,
          embed_color: '#5865F2',
          success_feedback: true,
          failed_feedback: false,
          testing_mode: false
        })
        .select()
        .single();
      if (insertError) throw insertError;
      
      configCache.set(cacheKey, { data: newServer, expires: Date.now() + CONFIG_CACHE_TTL });
      return newServer;
    }

    if (error) throw error;
    
    configCache.set(cacheKey, { data, expires: Date.now() + CONFIG_CACHE_TTL });
    return data;
  } catch (error) {
    logger.errorWithStack('Error getting server config', error, 'DB');
    throw error;
  }
}

function invalidateServerConfigCache(serverId) {
  configCache.delete(String(serverId));
}

// USER PREFERENCES
async function getUserDMPreference(userId) {
  try {
    const userIdStr = String(userId);
    const { data, error } = await supabase
      .from('users')
      .select('dm_notifications')
      .eq('user_id', userIdStr)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return true; // default allow
      throw error;
    }
    return data.dm_notifications !== false;
  } catch (error) {
    logger.errorWithStack('Error getting user DM preference', error, 'DB');
    return true;
  }
}

async function setUserDMPreference(userId, allowDMs) {
  try {
    const userIdStr = String(userId);
    const { error } = await supabase
      .from('users')
      .upsert({ user_id: userIdStr, dm_notifications: allowDMs }, { onConflict: 'user_id' });
    if (error) throw error;
    return true;
  } catch (error) {
    logger.errorWithStack('Error setting user DM preference', error, 'DB');
    return false;
  }
}

// BLOCKED CHANNELS
async function getBlockedChannels(serverId) {
  try {
    const { data, error } = await supabase
      .from('blocked_channels')
      .select('server_id::text, channel_id::text, reason, blocked_by::text, created_at')
      .eq('server_id', String(serverId))
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (error) {
    logger.errorWithStack('Error getting blocked channels', error, 'DB');
    return [];
  }
}

async function isChannelBlocked(serverId, channelId) {
  try {
    const { data, error } = await supabase
      .from('blocked_channels')
      .select('server_id::text, channel_id::text, reason, blocked_by::text, created_at')
      .eq('server_id', String(serverId))
      .eq('channel_id', String(channelId))
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  } catch (error) {
    logger.errorWithStack('Error checking if channel is blocked', error, 'DB');
    return null;
  }
}

async function addBlockedChannel(serverId, channelId, reason = null, blockedBy) {
  try {
    const { data, error } = await supabase
      .from('blocked_channels')
      .insert({
        server_id: String(serverId),
        channel_id: String(channelId),
        reason: reason,
        blocked_by: String(blockedBy)
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    logger.errorWithStack('Error adding blocked channel', error, 'DB');
    throw error;
  }
}

async function removeBlockedChannel(serverId, channelId) {
  try {
    const { data, error } = await supabase
      .from('blocked_channels')
      .delete()
      .eq('server_id', String(serverId))
      .eq('channel_id', String(channelId))
      .select('server_id::text, channel_id::text');
    if (error) throw error;
    return data && data.length > 0;
  } catch (error) {
    logger.errorWithStack('Error removing blocked channel', error, 'DB');
    return false;
  }
}

async function clearBlockedChannels(serverId) {
  try {
    const { data, error } = await supabase
      .from('blocked_channels')
      .delete()
      .eq('server_id', String(serverId))
      .select('server_id::text, channel_id::text');
    if (error) throw error;
    return data ? data.length : 0;
  } catch (error) {
    logger.errorWithStack('Error clearing blocked channels', error, 'DB');
    return false;
  }
}

module.exports = {
  getServerConfig,
  getUserDMPreference,
  setUserDMPreference,
  getBlockedChannels,
  isChannelBlocked,
  addBlockedChannel,
  removeBlockedChannel,
  clearBlockedChannels,
  invalidateServerConfigCache,
};



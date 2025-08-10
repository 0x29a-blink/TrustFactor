const { supabase } = require('../../config/database');
const { getServerSyncStatus, isServerPriority } = require('../syncUtils');
const logger = require('../logger');

async function getCustomReactions(serverId) {
  try {
    const syncStatus = await getServerSyncStatus(serverId);
    const priority = await isServerPriority(serverId);
    let targetServerId = serverId;
    if (syncStatus && !priority) targetServerId = syncStatus.sync_groups.priority_server;
    const { data, error } = await supabase
      .from('custom_reactions')
      .select('*')
      .eq('server_id', String(targetServerId))
      .eq('is_active', true)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (error) {
    logger.errorWithStack('Error getting custom reactions', error, 'DB');
    return [];
  }
}

async function getCustomReaction(serverId, emoji) {
  try {
    const syncStatus = await getServerSyncStatus(serverId);
    const priority = await isServerPriority(serverId);
    let targetServerId = serverId;
    if (syncStatus && !priority) targetServerId = syncStatus.sync_groups.priority_server;
    const { data, error } = await supabase
      .from('custom_reactions')
      .select('*')
      .eq('server_id', String(targetServerId))
      .eq('emoji', emoji)
      .eq('is_active', true)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  } catch (error) {
    logger.errorWithStack('Error getting custom reaction', error, 'DB');
    return null;
  }
}

async function setCustomReaction(serverId, emoji, pointValue) {
  try {
    const { data, error } = await supabase
      .from('custom_reactions')
      .upsert({ server_id: String(serverId), emoji, point_value: pointValue, is_active: true, updated_at: new Date().toISOString() }, { onConflict: 'server_id,emoji' })
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    logger.errorWithStack('Error setting custom reaction', error, 'DB');
    throw error;
  }
}

async function removeCustomReaction(serverId, emoji) {
  try {
    const { data, error } = await supabase
      .from('custom_reactions')
      .delete()
      .eq('server_id', String(serverId))
      .eq('emoji', emoji)
      .select();
    if (error) throw error;
    return data && data.length > 0;
  } catch (error) {
    logger.errorWithStack('Error removing custom reaction', error, 'DB');
    return false;
  }
}

async function toggleCustomReaction(serverId, emoji, isActive) {
  try {
    const { data, error } = await supabase
      .from('custom_reactions')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('server_id', String(serverId))
      .eq('emoji', emoji)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    logger.errorWithStack('Error toggling custom reaction', error, 'DB');
    throw error;
  }
}

async function setupDefaultReactions(serverId) {
  const defaults = [
    { emoji: '➕', pointValue: 1 },
    { emoji: '➖', pointValue: -1 },
    { emoji: '🔥', pointValue: 5 },
    { emoji: '🥶', pointValue: -5 },
    { emoji: '😄', pointValue: 3 },
    { emoji: '😐', pointValue: -3 },
  ];
  try {
    const results = [];
    for (const r of defaults) results.push(await setCustomReaction(serverId, r.emoji, r.pointValue));
    return results;
  } catch (error) {
    logger.errorWithStack('Error setting up default reactions', error, 'DB');
    throw error;
  }
}

async function clearCustomReactions(serverId) {
  try {
    const { data, error } = await supabase
      .from('custom_reactions')
      .delete()
      .eq('server_id', String(serverId))
      .select();
    if (error) throw error;
    return data ? data.length : 0;
  } catch (error) {
    logger.errorWithStack('Error clearing custom reactions', error, 'DB');
    return 0;
  }
}

module.exports = {
  getCustomReactions,
  getCustomReaction,
  setCustomReaction,
  removeCustomReaction,
  toggleCustomReaction,
  setupDefaultReactions,
  clearCustomReactions,
};



const { supabase } = require('../../config/database');
const { toIdString } = require('../ids');
const { getServerSyncStatus } = require('../syncUtils');
const logger = require('../logger');

// SCORES AND HISTORY

async function getUserScore(userId, serverId) {
  try {
    const syncStatus = await getServerSyncStatus(serverId);
    if (syncStatus) {
      const { data, error } = await supabase.rpc('get_user_group_score', {
        target_user_id: toIdString(userId),
        sync_code: syncStatus.sync_code
      });
      if (error) throw error;
      return Number(data) || 0;
    }
    const { data, error } = await supabase
      .from('scores')
      .select('total_score')
      .eq('user_id', toIdString(userId))
      .eq('server_id', toIdString(serverId))
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data?.total_score || 0;
  } catch (error) {
    logger.errorWithStack('Error getting user score', error, 'DB');
    return 0;
  }
}

async function getUserHistory(userId, serverId, limit = 10) {
  try {
    const syncStatus = await getServerSyncStatus(serverId);
    let serverIds = [serverId];
    if (syncStatus) {
      const { data: groupMembers } = await supabase
        .from('sync_group_members')
        .select('server_id::text')
        .eq('sync_code', syncStatus.sync_code)
        .eq('is_active', true);
      if (groupMembers && groupMembers.length > 0) {
        serverIds = groupMembers.map(m => m.server_id);
      }
    }
    const { data, error } = await supabase
      .from('score_history')
      .select(`
        point_change,
        reason,
        created_at,
        awarded_by,
        vote_id,
        message_id::text,
        channel_id::text,
        server_id::text
      `)
      .eq('user_id', String(userId))
      .in('server_id', serverIds)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  } catch (error) {
    logger.errorWithStack('Error getting user history', error, 'DB');
    return [];
  }
}

async function setUserScore(userId, serverId, newScore, reason, awardedBy) {
  try {
    const userIdStr = toIdString(userId);
    const serverIdStr = toIdString(serverId);
    const awardedByStr = toIdString(awardedBy);
    
    // Use applyScoreChange logic but calculate delta first? 
    // Actually setUserScore is rare (mostly admin override). 
    // We'll keep the old logic for absolute set, but it's still race-prone if concurrent sets happen.
    // Ideally we'd have a set_score RPC too, but let's stick to fixing the high-frequency applyScoreChange first.
    
    await supabase.from('users').upsert({ user_id: userIdStr }, { onConflict: 'user_id' });

    let { data: currentScore, error: scoreError } = await supabase
      .from('scores')
      .select('total_score')
      .eq('user_id', userIdStr)
      .eq('server_id', serverIdStr)
      .single();

    const previousScore = currentScore?.total_score || 0;
    const pointChange = newScore - previousScore;
    if (pointChange === 0) {
      return { user_id: userIdStr, server_id: serverIdStr, total_score: newScore, previous_score: previousScore, point_change: 0 };
    }

    if (scoreError && scoreError.code === 'PGRST116') {
      const { error: insertError } = await supabase.from('scores').insert({ user_id: userIdStr, server_id: serverIdStr, total_score: newScore });
      if (insertError) throw insertError;
    } else if (scoreError) {
      throw scoreError;
    } else {
      const { error: updateError } = await supabase
        .from('scores')
        .update({ total_score: newScore, updated_at: new Date().toISOString() })
        .eq('user_id', userIdStr)
        .eq('server_id', serverIdStr);
      if (updateError) throw updateError;
    }

    const { error: historyError } = await supabase.from('score_history').insert({
      user_id: userIdStr,
      server_id: serverIdStr,
      point_change: pointChange,
      reason,
      awarded_by: awardedByStr,
      vote_id: null,
    });
    if (historyError) throw historyError;

    return { user_id: userIdStr, server_id: serverIdStr, total_score: newScore, previous_score: previousScore, point_change: pointChange };
  } catch (error) {
    logger.errorWithStack('Error setting user score', error, 'DB');
    throw error;
  }
}

async function applyScoreChange(userId, serverId, pointChange, reason, awardedBy, pendingVoteId = null, messageId = null, channelId = null) {
  try {
    const { data, error } = await supabase.rpc('apply_score_change', {
      target_user_id: String(userId),
      target_server_id: String(serverId),
      point_change: pointChange,
      reason: reason,
      awarded_by_id: String(awardedBy),
      pending_vote_id: pendingVoteId,
      message_id: messageId ? String(messageId) : null,
      channel_id: channelId ? String(channelId) : null
    });

    if (error) throw error;
    return data; // Returns { user_id, server_id, total_score }
  } catch (error) {
    logger.errorWithStack('Error applying score change', error, 'DB');
    throw error;
  }
}

module.exports = {
  getUserScore,
  getUserHistory,
  setUserScore,
  applyScoreChange,
};



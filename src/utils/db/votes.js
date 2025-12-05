const { supabase } = require('../../config/database');
const logger = require('../logger');

// VOTES

async function createPendingVote(voteData) {
  const {
    messageId,
    originalMessageId,
    channelId,
    proposerId,
    targetUserId,
    serverId,
    pointChange,
    reason,
    votesNeeded,
    expiresAt,
    voteMethod,
  } = voteData;

  try {
    const { data, error } = await supabase
      .from('pending_votes')
      .insert({
        message_id: String(messageId),
        original_message_id: originalMessageId ? String(originalMessageId) : null,
        channel_id: String(channelId),
        proposer_id: String(proposerId),
        target_user_id: String(targetUserId),
        server_id: String(serverId),
        point_change: pointChange,
        reason,
        vote_method: voteMethod || 'command',
        required_votes: votesNeeded,
        expires_at: expiresAt,
        status: 'pending',
      })
      .select(`
        id,
        message_id::text,
        original_message_id::text,
        channel_id::text,
        proposer_id::text,
        target_user_id::text,
        server_id::text,
        point_change,
        reason,
        vote_method,
        expires_at,
        status,
        required_votes,
        approve_count,
        reject_count,
        created_at,
        updated_at
      `)
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    logger.errorWithStack('Error creating pending vote', error, 'DB');
    throw error;
  }
}

async function getPendingVote(messageId) {
  try {
    const { data, error } = await supabase
      .from('pending_votes')
      .select(`
        id,
        message_id::text,
        original_message_id::text,
        channel_id::text,
        proposer_id::text,
        target_user_id::text,
        server_id::text,
        point_change,
        reason,
        vote_method,
        expires_at,
        status,
        required_votes,
        approve_count,
        reject_count,
        created_at,
        updated_at
      `)
      .eq('message_id', String(messageId))
      .eq('status', 'pending')
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  } catch (error) {
    logger.errorWithStack('Error getting pending vote', error, 'DB');
    return null;
  }
}

async function recordVote(voteId, voterId, voteType) {
  try {
    const { error } = await supabase
      .from('votes')
      .upsert(
        { pending_vote_id: voteId, voter_id: String(voterId), vote_type: voteType },
        { onConflict: 'pending_vote_id,voter_id', returning: 'minimal' }
      );
    if (error) throw error;
    // Trigger on DB handles counts update
    return true;
  } catch (error) {
    logger.errorWithStack('Error recording vote', error, 'DB');
    throw error;
  }
}

async function getVoteCount(voteId) {
  try {
    const approvePromise = supabase
      .from('votes')
      .select('*', { count: 'exact', head: true })
      .eq('pending_vote_id', voteId)
      .eq('vote_type', 'approve');
    const rejectPromise = supabase
      .from('votes')
      .select('*', { count: 'exact', head: true })
      .eq('pending_vote_id', voteId)
      .eq('vote_type', 'reject');
    const [approveResult, rejectResult] = await Promise.all([approvePromise, rejectPromise]);
    if (approveResult.error) throw approveResult.error;
    if (rejectResult.error) throw rejectResult.error;
    return {
      approveCount: approveResult.count || 0,
      rejectCount: rejectResult.count || 0,
      totalVotes: (approveResult.count || 0) + (rejectResult.count || 0),
    };
  } catch (error) {
    logger.errorWithStack('Error getting vote count', error, 'DB');
    return { approveCount: 0, rejectCount: 0, totalVotes: 0 };
  }
}

async function getUserVote(voteId, userId) {
  try {
    const { data, error } = await supabase
      .from('votes')
      .select('*')
      .eq('pending_vote_id', voteId)
      .eq('voter_id', String(userId))
      .single();
    if (error && error.code === 'PGRST116') return null;
    if (error) throw error;
    return data;
  } catch (error) {
    logger.errorWithStack('Error getting user vote', error, 'DB');
    return null;
  }
}

async function removeVote(voteId, userId) {
  try {
    const { error } = await supabase
      .from('votes')
      .delete()
      .eq('pending_vote_id', voteId)
      .eq('voter_id', String(userId));
    if (error) throw error;
    // Trigger on DB handles counts update
    return true;
  } catch (error) {
    logger.errorWithStack('Error removing vote', error, 'DB');
    return false;
  }
}

async function updateVoteStatus(voteId, status) {
  try {
    const { data, error } = await supabase
      .from('pending_votes')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', voteId)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    logger.errorWithStack('Error updating vote status', error, 'DB');
    throw error;
  }
}

async function atomicApproveVote(voteId) {
  try {
    const { data, error } = await supabase
      .from('pending_votes')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', voteId)
      .eq('status', 'pending')
      .select()
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  } catch (error) {
    logger.errorWithStack('Error atomically approving vote', error, 'DB');
    throw error;
  }
}

async function atomicExpireVote(voteId) {
  try {
    const { data, error } = await supabase
      .from('pending_votes')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', voteId)
      .eq('status', 'pending')
      .select()
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  } catch (error) {
    logger.errorWithStack('Error atomically expiring vote', error, 'DB');
    throw error;
  }
}

async function getUserLastAward(userId, serverId) {
  try {
    const { data, error } = await supabase
      .from('pending_votes')
      .select('created_at')
      .eq('proposer_id', String(userId))
      .eq('server_id', String(serverId))
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (error && error.code === 'PGRST116') return null;
    if (error) throw error;
    return data;
  } catch (error) {
    logger.errorWithStack('Error getting user last award', error, 'DB');
    return null;
  }
}

module.exports = {
  createPendingVote,
  getPendingVote,
  recordVote,
  getVoteCount,
  getUserVote,
  removeVote,
  updateVoteStatus,
  atomicApproveVote,
  atomicExpireVote,
  getUserLastAward,
};



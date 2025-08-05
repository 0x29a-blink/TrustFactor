const { supabase } = require('../config/database');
const { getServerSyncStatus, isServerPriority } = require('./syncUtils');

/**
 * Database utility functions for TrustFactor bot using Supabase
 * Replaces PostgreSQL pool queries with Supabase client calls
 */
class DatabaseUtils {

    /**
     * Get or create server configuration
     * @param {string} serverId - Discord server ID
     * @returns {Promise<Object>} Server configuration
     */
    static async getServerConfig(serverId) {
        try {
            // Check if server is in sync group but not priority - use priority server's config
            const syncStatus = await getServerSyncStatus(serverId);
            const isPriority = await isServerPriority(serverId);
            
            let targetServerId = serverId;
            if (syncStatus && !isPriority) {
                // Use priority server's configuration instead
                targetServerId = syncStatus.sync_groups.priority_server;
            }
            
            // Try to get existing server config
            // Cast log_channel to TEXT to prevent Discord snowflake precision loss
            let { data, error } = await supabase
                .from('servers')
                .select(`
                    *,
                    log_channel::text
                `)
                .eq('server_id', targetServerId)
                .single();
            
            // If server doesn't exist, create it with defaults
            if (error && error.code === 'PGRST116') {
                // If we're looking for priority server config but it doesn't exist, fall back to original server
                if (targetServerId !== serverId) {
                    // Priority server doesn't exist, use original server instead
                    targetServerId = serverId;
                    const { data: fallbackData, error: fallbackError } = await supabase
                        .from('servers')
                        .select(`
                            *,
                            log_channel::text
                        `)
                        .eq('server_id', serverId)
                        .single();
                    
                    if (!fallbackError) {
                        return fallbackData;
                    }
                }
                
                const { data: newServer, error: insertError } = await supabase
                    .from('servers')
                    .insert({
                        server_id: serverId,
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
                return newServer;
            }
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error getting server config:', error);
            throw error;
        }
    }

    /**
     * Get user score for a server (or combined score from sync group if synced)
     * @param {string} userId - Discord user ID
     * @param {string} serverId - Discord server ID
     * @returns {Promise<number>} User's current score
     */
    static async getUserScore(userId, serverId) {
        try {
            // Check if server is in a sync group
            const { getServerSyncStatus } = require('./syncUtils');
            const syncStatus = await getServerSyncStatus(serverId);
            
            if (syncStatus) {
                // Server is in sync group - get combined score across all group members
                const { data: groupMembers } = await supabase
                    .from('sync_group_members')
                    .select('server_id::text')
                    .eq('sync_code', syncStatus.sync_code)
                    .eq('is_active', true);
                
                if (groupMembers && groupMembers.length > 0) {
                    const serverIds = groupMembers.map(m => m.server_id);
                    
                    // Get scores from all servers in the sync group
                    const { data, error } = await supabase
                        .from('scores')
                        .select('total_score')
                        .eq('user_id', userId)
                        .in('server_id', serverIds);
                    
                    if (error) throw error;
                    
                    // Sum all scores from the sync group
                    const totalScore = (data || []).reduce((sum, score) => sum + (score.total_score || 0), 0);
                    return totalScore;
                }
            }
            
            // Server is not in sync group - use normal single-server score
            const { data, error } = await supabase
                .from('scores')
                .select('total_score')
                .eq('user_id', userId)
                .eq('server_id', serverId)
                .single();
            
            if (error && error.code !== 'PGRST116') throw error;
            return data?.total_score || 0;
        } catch (error) {
            console.error('Error getting user score:', error);
            return 0;
        }
    }

    /**
     * Get user score history with extended data and sync group support
     * @param {string} userId - Discord user ID
     * @param {string} serverId - Discord server ID
     * @param {number} limit - Number of history entries to return
     * @returns {Promise<Array>} Score history entries with message IDs and sync group data
     */
    static async getUserHistory(userId, serverId, limit = 10) {
        try {
            const { getServerSyncStatus } = require('./syncUtils');
            const syncStatus = await getServerSyncStatus(serverId);
            
            let serverIds = [serverId];
            
            // If server is in sync group, get history from all servers in the group
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
            
            // Get extended history with message IDs from all relevant servers
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
                .eq('user_id', userId)
                .in('server_id', serverIds)
                .order('created_at', { ascending: false })
                .limit(limit);
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting user history:', error);
            return [];
        }
    }

    /**
     * Get leaderboard for a server (or sync group if server is synced)
     * @param {string} serverId - Server ID
     * @param {number} limit - Number of users to return (default: 10)
     * @returns {Promise<Array>} Leaderboard data
     */
    static async getLeaderboard(serverId, limit = 10) {
        try {
            // Check if server is in a sync group
            const { getServerSyncStatus } = require('./syncUtils');
            const syncStatus = await getServerSyncStatus(serverId);
            
            if (syncStatus) {
                // Server is in sync group - get summed scores across all group members
                const { data: groupMembers } = await supabase
                    .from('sync_group_members')
                    .select('server_id::text')
                    .eq('sync_code', syncStatus.sync_code)
                    .eq('is_active', true);
                
                if (groupMembers && groupMembers.length > 0) {
                    const serverIds = groupMembers.map(m => m.server_id);
                    
                    // Get summed scores across all servers in the sync group
                    const { data, error } = await supabase
                        .from('scores')
                        .select(`
                            user_id::text,
                            total_score,
                            updated_at
                        `)
                        .in('server_id', serverIds)
                        .order('total_score', { ascending: false });
                    
                    if (error) throw error;
                    
                    // Sum scores by user_id across all servers in the group
                    const userScores = new Map();
                    const userUpdatedAt = new Map();
                    
                    for (const score of data || []) {
                        const userId = score.user_id;
                        const currentScore = userScores.get(userId) || 0;
                        const currentUpdated = userUpdatedAt.get(userId) || score.updated_at;
                        
                        userScores.set(userId, currentScore + score.total_score);
                        // Keep the most recent updated_at timestamp
                        if (new Date(score.updated_at) > new Date(currentUpdated)) {
                            userUpdatedAt.set(userId, score.updated_at);
                        }
                    }
                    
                    // Convert to array format and sort by total score
                    const leaderboardData = Array.from(userScores.entries())
                        .map(([user_id, total_score]) => ({
                            user_id,
                            total_score,
                            updated_at: userUpdatedAt.get(user_id)
                        }))
                        .sort((a, b) => b.total_score - a.total_score)
                        .slice(0, limit);
                    
                    return leaderboardData;
                }
            }
            
            // Server is not in sync group - use normal single-server leaderboard
            const { data, error } = await supabase
                .from('scores')
                .select(`
                    user_id::text,
                    total_score,
                    updated_at
                `)
                .eq('server_id', serverId)
                .order('total_score', { ascending: false })
                .limit(limit);

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting leaderboard:', error);
            throw error;
        }
    }



    /**
     * Create a pending vote
     * @param {Object} voteData - Vote information
     * @returns {Promise<Object>} Created vote record
     */
    static async createPendingVote(voteData) {
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
            expiresAt
        } = voteData;

        try {
            // Force all Discord IDs to strings to prevent JavaScript precision loss
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
                    reason: reason,
                    vote_method: 'command', // Set default vote method
                    required_votes: votesNeeded,
                    expires_at: expiresAt,
                    status: 'pending'
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
            console.error('Error creating pending vote:', error);
            throw error;
        }
    }

    /**
     * Get pending vote by message ID
     * @param {string} messageId - Discord message ID
     * @returns {Promise<Object|null>} Pending vote data
     */
    static async getPendingVote(messageId) {
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
            console.error('Error getting pending vote:', error);
            return null;
        }
    }

    /**
     * Record a vote on a pending proposal
     * @param {string} voteId - Pending vote ID
     * @param {string} voterId - Discord user ID of voter
     * @param {string} voteType - 'approve' or 'reject'
     * @returns {Promise<Object>} Vote record
     */
    static async recordVote(voteId, voterId, voteType) {
        try {
            const { data, error } = await supabase
                .from('votes')
                .upsert({
                    pending_vote_id: voteId,
                    voter_id: voterId,
                    vote_type: voteType
                }, {
                    onConflict: 'pending_vote_id,voter_id'
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error recording vote:', error);
            throw error;
        }
    }

    /**
     * Get vote count for a pending vote
     * @param {string} voteId - Pending vote ID
     * @returns {Promise<Object>} Vote counts {approveCount, rejectCount, totalVotes}
     */
    static async getVoteCount(voteId) {
        try {
            const { data, error } = await supabase
                .from('votes')
                .select('vote_type')
                .eq('pending_vote_id', voteId);
            
            if (error) throw error;
            
            const approveCount = data.filter(vote => vote.vote_type === 'approve').length;
            const rejectCount = data.filter(vote => vote.vote_type === 'reject').length;
            const totalVotes = data.length;
            
            return {
                approveCount,
                rejectCount,
                totalVotes
            };
        } catch (error) {
            console.error('Error getting vote count:', error);
            return { approveCount: 0, rejectCount: 0, totalVotes: 0 };
        }
    }

    /**
     * Get a specific user's vote on a pending vote
     * @param {string} voteId - Pending vote ID
     * @param {string} userId - Discord user ID
     * @returns {Promise<Object|null>} User's vote record or null if no vote
     */
    static async getUserVote(voteId, userId) {
        try {
            const { data, error } = await supabase
                .from('votes')
                .select('*')
                .eq('pending_vote_id', voteId)
                .eq('voter_id', userId)
                .single();
            
            if (error && error.code === 'PGRST116') {
                return null; // No vote found
            }
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error getting user vote:', error);
            return null;
        }
    }

    /**
     * Remove a user's vote from a pending vote
     * @param {string} voteId - Pending vote ID
     * @param {string} userId - Discord user ID
     * @returns {Promise<boolean>} True if vote was removed, false if no vote existed
     */
    static async removeVote(voteId, userId) {
        try {
            const { data, error } = await supabase
                .from('votes')
                .delete()
                .eq('pending_vote_id', voteId)
                .eq('voter_id', userId)
                .select();
            
            if (error) throw error;
            return data && data.length > 0;
        } catch (error) {
            console.error('Error removing vote:', error);
            return false;
        }
    }

    /**
     * Get user's last award (for cooldown checking)
     * @param {string} userId - Discord user ID
     * @param {string} serverId - Discord server ID
     * @returns {Promise<Object|null>} Last award record or null
     */
    static async getUserLastAward(userId, serverId) {
        try {
            const { data, error } = await supabase
                .from('pending_votes')
                .select('created_at')
                .eq('proposer_id', userId)
                .eq('server_id', serverId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            
            if (error && error.code === 'PGRST116') {
                return null; // No awards found
            }
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error getting user last award:', error);
            return null;
        }
    }

    /**
     * Set user score to an absolute value (for admin commands)
     * @param {string} userId - Discord user ID
     * @param {string} serverId - Discord server ID
     * @param {number} newScore - New absolute score value
     * @param {string} reason - Reason for setting the score
     * @param {string} awardedBy - User ID who initiated the change
     * @returns {Promise<Object>} Updated score record with previous score
     */
    static async setUserScore(userId, serverId, newScore, reason, awardedBy) {
        try {
            // Force all Discord IDs to strings to prevent precision loss
            const userIdStr = String(userId);
            const serverIdStr = String(serverId);
            const awardedByStr = String(awardedBy);
            
            // First, ensure user exists in users table
            await supabase
                .from('users')
                .upsert({ user_id: userIdStr }, { onConflict: 'user_id' });

            // Get current score
            let { data: currentScore, error: scoreError } = await supabase
                .from('scores')
                .select('total_score')
                .eq('user_id', userIdStr)
                .eq('server_id', serverIdStr)
                .single();

            const previousScore = currentScore?.total_score || 0;
            const pointChange = newScore - previousScore;
            
            // Only proceed if there's actually a change needed
            if (pointChange === 0) {
                return { 
                    user_id: userIdStr, 
                    server_id: serverIdStr, 
                    total_score: newScore,
                    previous_score: previousScore,
                    point_change: 0
                };
            }

            // Set the new score directly
            if (scoreError && scoreError.code === 'PGRST116') {
                // User score doesn't exist, create it
                const { error: insertError } = await supabase
                    .from('scores')
                    .insert({
                        user_id: userIdStr,
                        server_id: serverIdStr,
                        total_score: newScore
                    });
                
                if (insertError) throw insertError;
            } else if (scoreError) {
                throw scoreError;
            } else {
                // Update existing score to exact value
                const { error: updateError } = await supabase
                    .from('scores')
                    .update({ 
                        total_score: newScore,
                        updated_at: new Date().toISOString()
                    })
                    .eq('user_id', userIdStr)
                    .eq('server_id', serverIdStr);
                
                if (updateError) throw updateError;
            }
            
            // Add to score history (record the change that was made)
            const { error: historyError } = await supabase
                .from('score_history')
                .insert({
                    user_id: userIdStr,
                    server_id: serverIdStr,
                    point_change: pointChange,
                    reason: reason,
                    awarded_by: awardedByStr,
                    vote_id: null // Admin set commands don't have associated votes
                });
            if (historyError) throw historyError;
            
            return { 
                user_id: userIdStr, 
                server_id: serverIdStr, 
                total_score: newScore,
                previous_score: previousScore,
                point_change: pointChange
            };
        } catch (error) {
            console.error('Error setting user score:', error);
            throw error;
        }
    }

    /**
     * Apply score change and update history
     * @param {string} userId - Discord user ID
     * @param {string} serverId - Discord server ID
     * @param {number} pointChange - Points to add/subtract
     * @param {string} reason - Reason for the change
     * @param {string} awardedBy - User ID who initiated the change
     * @param {number} pendingVoteId - ID of the pending vote that caused this change
     * @param {string} messageId - ID of the message that triggered this score change
     * @param {string} channelId - ID of the channel where the score change originated
     * @returns {Promise<Object>} Updated score record
     */
    static async applyScoreChange(userId, serverId, pointChange, reason, awardedBy, pendingVoteId = null, messageId = null, channelId = null) {
        try {
            // Force all Discord IDs to strings to prevent precision loss
            const userIdStr = String(userId);
            const serverIdStr = String(serverId);
            const awardedByStr = String(awardedBy);
            
            // First, ensure user exists in users table
            await supabase
                .from('users')
                .upsert({ user_id: userIdStr }, { onConflict: 'user_id' });

            // Get current score or create new record
            let { data: currentScore, error: scoreError } = await supabase
                .from('scores')
                .select('total_score')
                .eq('user_id', userIdStr)
                .eq('server_id', serverIdStr)
                .single();

            let newTotal;
            if (scoreError && scoreError.code === 'PGRST116') {
                // User score doesn't exist, create it
                newTotal = pointChange;
                const { error: insertError } = await supabase
                    .from('scores')
                    .insert({
                        user_id: userIdStr,
                        server_id: serverIdStr,
                        total_score: newTotal
                    });
                
                if (insertError) throw insertError;
            } else if (scoreError) {
                throw scoreError;
            } else {
                // Update existing score
                newTotal = currentScore.total_score + pointChange;
                const { error: updateError } = await supabase
                    .from('scores')
                    .update({ 
                        total_score: newTotal,
                        updated_at: new Date().toISOString()
                    })
                    .eq('user_id', userIdStr)
                    .eq('server_id', serverIdStr);
                
                if (updateError) throw updateError;
            }
            
            // Add to score history with message tracking
            const historyEntry = {
                user_id: userIdStr,
                server_id: serverIdStr,
                point_change: pointChange,
                reason: reason,
                awarded_by: awardedByStr,
                vote_id: pendingVoteId
            };
            
            // Add message ID and channel ID if provided
            if (messageId) {
                historyEntry.message_id = String(messageId);
            }
            if (channelId) {
                historyEntry.channel_id = String(channelId);
            }
            
            const { error: historyError } = await supabase
                .from('score_history')
                .insert(historyEntry);
            if (historyError) throw historyError;
            
            return { user_id: userIdStr, server_id: serverIdStr, total_score: newTotal };
        } catch (error) {
            console.error('Error applying score change:', error);
            throw error;
        }
    }

    /**
     * Update pending vote status
     * @param {string} voteId - Pending vote ID
     * @param {string} status - New status (approved, rejected, expired)
     * @returns {Promise<Object>} Updated vote record
     */
    static async updateVoteStatus(voteId, status) {
        try {
            const { data, error } = await supabase
                .from('pending_votes')
                .update({ 
                    status: status,
                    updated_at: new Date().toISOString()
                })
                .eq('id', voteId)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating vote status:', error);
            throw error;
        }
    }

    /**
     * Atomically approve a vote (race condition safe)
     * Only approves if the vote is still in 'pending' status
     * @param {string} voteId - Pending vote ID
     * @returns {Promise<Object|null>} Updated vote record if successful, null if already processed
     */
    static async atomicApproveVote(voteId) {
        try {
            const { data, error } = await supabase
                .from('pending_votes')
                .update({ 
                    status: 'approved',
                    updated_at: new Date().toISOString()
                })
                .eq('id', voteId)
                .eq('status', 'pending') // Only update if still pending
                .select()
                .single();

            if (error) {
                // If no rows were updated (vote already processed), return null
                if (error.code === 'PGRST116') {
                    return null;
                }
                throw error;
            }
            return data;
        } catch (error) {
            console.error('Error atomically approving vote:', error);
            throw error;
        }
    }

    // ================================
    // USER PREFERENCE METHODS
    // ================================

    /**
     * Get user's DM notification preference
     * @param {string} userId - Discord user ID
     * @returns {Promise<boolean>} True if user wants DMs, false otherwise
     */
    static async getUserDMPreference(userId) {
        try {
            const userIdStr = String(userId);
            
            const { data, error } = await supabase
                .from('users')
                .select('dm_notifications')
                .eq('user_id', userIdStr)
                .single();

            if (error) {
                // If user doesn't exist, return default (true)
                if (error.code === 'PGRST116') {
                    return true;
                }
                throw error;
            }

            return data.dm_notifications !== false; // Default to true if null
        } catch (error) {
            console.error('Error getting user DM preference:', error);
            return true; // Default to allowing DMs on error
        }
    }

    /**
     * Set user's DM notification preference
     * @param {string} userId - Discord user ID
     * @param {boolean} allowDMs - Whether user wants to receive DMs
     * @returns {Promise<boolean>} Success status
     */
    static async setUserDMPreference(userId, allowDMs) {
        try {
            const userIdStr = String(userId);
            
            // Upsert user record with DM preference
            const { error } = await supabase
                .from('users')
                .upsert({
                    user_id: userIdStr,
                    dm_notifications: allowDMs
                }, {
                    onConflict: 'user_id'
                });

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error setting user DM preference:', error);
            return false;
        }
    }

    // ================================
    // CUSTOM REACTIONS METHODS
    // ================================

    /**
     * Get all custom reactions for a server (or priority server if synced)
     * @param {string} serverId - Discord server ID
     * @returns {Promise<Array>} Array of custom reaction objects
     */
    static async getCustomReactions(serverId) {
        try {
            // Check if server is in sync group but not priority - use priority server's reactions
            const { getServerSyncStatus, isServerPriority } = require('./syncUtils');
            const syncStatus = await getServerSyncStatus(serverId);
            const isPriority = await isServerPriority(serverId);
            
            let targetServerId = serverId;
            if (syncStatus && !isPriority) {
                // Use priority server's custom reactions instead
                targetServerId = syncStatus.sync_groups.priority_server;
            }
            
            const { data, error } = await supabase
                .from('custom_reactions')
                .select('*')
                .eq('server_id', String(targetServerId))
                .eq('is_active', true)
                .order('created_at', { ascending: true });
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting custom reactions:', error);
            return [];
        }
    }

    /**
     * Get a specific custom reaction (or from priority server if synced)
     * @param {string} serverId - Discord server ID
     * @param {string} emoji - Emoji string (Unicode or Discord ID)
     * @returns {Promise<Object|null>} Custom reaction object or null
     */
    static async getCustomReaction(serverId, emoji) {
        try {
            // Check if server is in sync group but not priority - use priority server's reactions
            const { getServerSyncStatus, isServerPriority } = require('./syncUtils');
            const syncStatus = await getServerSyncStatus(serverId);
            const isPriority = await isServerPriority(serverId);
            
            let targetServerId = serverId;
            if (syncStatus && !isPriority) {
                // Use priority server's custom reactions instead
                targetServerId = syncStatus.sync_groups.priority_server;
            }
            
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
            console.error('Error getting custom reaction:', error);
            return null;
        }
    }

    /**
     * Add or update a custom reaction
     * @param {string} serverId - Discord server ID
     * @param {string} emoji - Emoji string (Unicode or Discord ID)
     * @param {number} pointValue - Point value for this emoji
     * @returns {Promise<Object>} Created/updated reaction object
     */
    static async setCustomReaction(serverId, emoji, pointValue) {
        try {
            const { data, error } = await supabase
                .from('custom_reactions')
                .upsert({
                    server_id: String(serverId),
                    emoji: emoji,
                    point_value: pointValue,
                    is_active: true,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'server_id,emoji'
                })
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error setting custom reaction:', error);
            throw error;
        }
    }

    /**
     * Remove a custom reaction
     * @param {string} serverId - Discord server ID
     * @param {string} emoji - Emoji string to remove
     * @returns {Promise<boolean>} True if removed, false if not found
     */
    static async removeCustomReaction(serverId, emoji) {
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
            console.error('Error removing custom reaction:', error);
            return false;
        }
    }

    /**
     * Toggle a custom reaction's active status
     * @param {string} serverId - Discord server ID
     * @param {string} emoji - Emoji string
     * @param {boolean} isActive - New active status
     * @returns {Promise<Object>} Updated reaction object
     */
    static async toggleCustomReaction(serverId, emoji, isActive) {
        try {
            const { data, error } = await supabase
                .from('custom_reactions')
                .update({
                    is_active: isActive,
                    updated_at: new Date().toISOString()
                })
                .eq('server_id', String(serverId))
                .eq('emoji', emoji)
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error toggling custom reaction:', error);
            throw error;
        }
    }

    /**
     * Set up default custom reactions for a server
     * @param {string} serverId - Discord server ID
     * @returns {Promise<Array>} Array of created default reactions
     */
    static async setupDefaultReactions(serverId) {
        const defaultReactions = [
            { emoji: '➕', pointValue: 1 },
            { emoji: '➖', pointValue: -1 },
            { emoji: '🔥', pointValue: 5 },
            { emoji: '🥶', pointValue: -5 },
            { emoji: '😄', pointValue: 3 },
            { emoji: '😐', pointValue: -3 }
        ];

        try {
            const results = [];
            for (const reaction of defaultReactions) {
                const result = await this.setCustomReaction(serverId, reaction.emoji, reaction.pointValue);
                results.push(result);
            }
            return results;
        } catch (error) {
            console.error('Error setting up default reactions:', error);
            throw error;
        }
    }

    /**
     * Clear all custom reactions for a server
     * @param {string} serverId - Discord server ID
     * @returns {Promise<number>} Number of reactions removed
     */
    static async clearCustomReactions(serverId) {
        try {
            const { data, error } = await supabase
                .from('custom_reactions')
                .delete()
                .eq('server_id', String(serverId))
                .select();
            
            if (error) throw error;
            return data ? data.length : 0;
        } catch (error) {
            console.error('Error clearing custom reactions:', error);
            return 0;
        }
    }

    /**
     * Assign leaderboard roles to users based on their positions
     * @param {string} serverId - Discord server ID
     * @param {Object} guild - Discord guild object
     * @returns {Promise<Object>} Assignment results
     */
    static async assignLeaderboardRoles(serverId, guild) {
        try {
            console.log(`🔍 Starting leaderboard role assignment for server ${serverId}`);
            const serverConfig = await this.getServerConfig(serverId);
            const leaderboardRoles = serverConfig.leaderboard_roles || {};
            console.log(`📋 Leaderboard roles config:`, JSON.stringify(leaderboardRoles, null, 2));
            
            if (Object.keys(leaderboardRoles).length === 0) {
                console.log(`❌ No leaderboard roles configured`);
                return { assigned: 0, removed: 0, errors: [] };
            }

            // Get assignment strategies (default to 'server-local' for backward compatibility)
            const assignmentStrategy = leaderboardRoles.assignment_strategy || {};
            const positiveStrategy = assignmentStrategy.positive || 'server-local';
            const negativeStrategy = assignmentStrategy.negative || 'server-local';
            
            console.log(`⚙️ Assignment strategies - Positive: ${positiveStrategy}, Negative: ${negativeStrategy}`);

            const leaderboard = await this.getLeaderboard(serverId, 100);
            let positiveLeaderboard = leaderboard.filter(entry => entry.total_score > 0).slice(0, 10);
            let negativeLeaderboard = leaderboard.filter(entry => entry.total_score < 0)
                .sort((a, b) => a.total_score - b.total_score).slice(0, 10);
            
            console.log(`📊 Original Positive leaderboard (top 10):`, positiveLeaderboard.map(e => `${e.user_id}: ${e.total_score}`));
            console.log(`📊 Original Negative leaderboard (top 10):`, negativeLeaderboard.map(e => `${e.user_id}: ${e.total_score}`));

            // Filter leaderboards based on assignment strategy
            if (positiveStrategy === 'server-local' || positiveStrategy === 'global-filtered') {
                const originalCount = positiveLeaderboard.length;
                positiveLeaderboard = await this.filterForGuildMembers(positiveLeaderboard, guild);
                console.log(`${positiveStrategy === 'server-local' ? '🏠' : '🌐'} Positive ${positiveStrategy} filtering: ${originalCount} → ${positiveLeaderboard.length} members`);
            }
            
            if (negativeStrategy === 'server-local' || negativeStrategy === 'global-filtered') {
                const originalCount = negativeLeaderboard.length;
                negativeLeaderboard = await this.filterForGuildMembers(negativeLeaderboard, guild);
                console.log(`${negativeStrategy === 'server-local' ? '🏠' : '🌐'} Negative ${negativeStrategy} filtering: ${originalCount} → ${negativeLeaderboard.length} members`);
            }

            console.log(`📊 Final Positive leaderboard:`, positiveLeaderboard.map(e => `${e.user_id}: ${e.total_score}`));
            console.log(`📊 Final Negative leaderboard:`, negativeLeaderboard.map(e => `${e.user_id}: ${e.total_score}`));

            const results = { assigned: 0, removed: 0, errors: [] };

            // Process positive leaderboard roles
            const positiveRoles = leaderboardRoles.positive || {};
            console.log(`🏆 Processing positive roles:`, positiveRoles);
            
            const positiveAssignments = await this.processLeaderboardRoles(
                positiveLeaderboard, positiveRoles, guild, 'positive', positiveStrategy
            );
            results.assigned += positiveAssignments.assigned;
            results.errors.push(...positiveAssignments.errors);

            // Process negative leaderboard roles
            const negativeRoles = leaderboardRoles.negative || {};
            console.log(`💀 Processing negative roles:`, negativeRoles);
            
            const negativeAssignments = await this.processLeaderboardRoles(
                negativeLeaderboard, negativeRoles, guild, 'negative', negativeStrategy
            );
            results.assigned += negativeAssignments.assigned;
            results.errors.push(...negativeAssignments.errors);

            // Remove roles from users who are no longer in the top positions
            const allPositiveRoles = Object.values(positiveRoles);
            const allNegativeRoles = Object.values(negativeRoles);
            const allConfiguredRoles = [...allPositiveRoles, ...allNegativeRoles];
            
            const allLeaderboardUsers = [...positiveLeaderboard, ...negativeLeaderboard];
            const usersInTopPositions = new Set(allLeaderboardUsers.map(entry => String(entry.user_id)));

            for (const roleId of allConfiguredRoles) {
                try {
                    const roleIdString = String(roleId);
                    const role = guild.roles.cache.get(roleIdString);
                    if (role) {
                        const membersWithRole = role.members;
                        
                        for (const [memberId, member] of membersWithRole) {
                            const memberIdString = String(memberId);
                            if (!usersInTopPositions.has(memberIdString)) {
                                await member.roles.remove(roleIdString, 'No longer in leaderboard position');
                                results.removed++;
                                console.log(`🗑️ Removed role ${role.name} from ${member.user.tag} (no longer in top positions)`);
                            }
                        }
                    }
                } catch (error) {
                    console.error(`Error removing role ${roleId}:`, error);
                    results.errors.push(`Failed to remove role ${roleId}: ${error.message}`);
                }
            }
            
            console.log(`🎯 Final results: ${results.assigned} assigned, ${results.removed} removed, ${results.errors.length} errors`);
            return results;
        } catch (error) {
            console.error('Error assigning leaderboard roles:', error);
            throw error;
        }
    }

    /**
     * Filter leaderboard entries to only include users who are members of the guild
     * @param {Array} leaderboard - Array of leaderboard entries
     * @param {Object} guild - Discord guild object
     * @returns {Promise<Array>} Filtered leaderboard with only guild members
     */
    static async filterForGuildMembers(leaderboard, guild) {
        const filteredLeaderboard = [];
        
        for (const entry of leaderboard) {
            try {
                const userIdString = String(entry.user_id);
                await guild.members.fetch(userIdString);
                filteredLeaderboard.push(entry);
                console.log(`✅ User ${entry.user_id} is in guild - keeping in leaderboard`);
            } catch (error) {
                console.log(`❌ User ${entry.user_id} not in guild - removing from leaderboard`);
            }
        }
        
        return filteredLeaderboard;
    }

    /**
     * Process role assignments for a specific leaderboard type
     * @param {Array} leaderboard - Filtered leaderboard entries
     * @param {Object} roles - Role configuration for this leaderboard type
     * @param {Object} guild - Discord guild object
     * @param {string} type - 'positive' or 'negative'
     * @param {string} strategy - 'global' or 'server-local'
     * @returns {Promise<Object>} Assignment results
     */
    static async processLeaderboardRoles(leaderboard, roles, guild, type, strategy) {
        const results = { assigned: 0, errors: [] };
        
        for (let i = 0; i < leaderboard.length; i++) {
            const entry = leaderboard[i];
            const position = i + 1;
            const roleId = roles[position];
            
            console.log(`👤 ${type} position ${position}: User ${entry.user_id} (${entry.total_score} pts), roleId: ${roleId}, strategy: ${strategy}`);
            
            if (roleId) {
                try {
                    const userIdString = String(entry.user_id);
                    let member;
                    
                    if (strategy === 'global') {
                        // For global strategy, try to fetch the user, but skip if not in guild
                        try {
                            member = await guild.members.fetch(userIdString);
                        } catch (fetchError) {
                            console.log(`🌍 Global strategy: User ${entry.user_id} not in guild, skipping role assignment`);
                            continue;
                        }
                    } else {
                        // For server-local and global-filtered strategies, user should already be filtered to be in guild
                        member = await guild.members.fetch(userIdString);
                    }
                    
                    const roleIdString = String(roleId);
                    const role = guild.roles.cache.get(roleIdString);
                    
                    console.log(`🔍 Member: ${member.user.tag}, Role: ${role ? role.name : 'NOT FOUND'}, Has role: ${member.roles.cache.has(roleIdString)}`);
                    
                    if (role && !member.roles.cache.has(roleIdString)) {
                        await member.roles.add(roleIdString, `${type} leaderboard position ${position} role assignment (${strategy})`);
                        console.log(`✅ Assigned ${type} role ${role.name} to ${member.user.tag} (position ${position}, ${strategy})`);
                        results.assigned++;
                    } else if (!role) {
                        console.log(`❌ Role ${roleIdString} not found in guild`);
                    } else {
                        console.log(`ℹ️ User ${member.user.tag} already has role ${role.name}`);
                    }
                } catch (error) {
                    console.error(`Error assigning ${type} role to user ${entry.user_id}:`, error);
                    results.errors.push(`Failed to assign ${type} role to user ${entry.user_id}: ${error.message}`);
                }
            }
        }
        
        return results;
    }

    // BLOCKED CHANNELS METHODS
    /**
     * Get all blocked channels for a server
     * @param {string} serverId - Discord server ID
     * @returns {Promise<Array>} Array of blocked channel objects
     */
    static async getBlockedChannels(serverId) {
        try {
            const { data, error } = await supabase
                .from('blocked_channels')
                .select('server_id::text, channel_id::text, reason, blocked_by::text, created_at')
                .eq('server_id', String(serverId))
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting blocked channels:', error);
            return [];
        }
    }

    /**
     * Check if a channel is blocked for reaction point awards
     * @param {string} serverId - Discord server ID
     * @param {string} channelId - Discord channel ID
     * @returns {Promise<Object|null>} Blocked channel object or null
     */
    static async isChannelBlocked(serverId, channelId) {
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
            console.error('Error checking if channel is blocked:', error);
            return null;
        }
    }

    /**
     * Add a channel to the blocked list
     * @param {string} serverId - Discord server ID
     * @param {string} channelId - Discord channel ID
     * @param {string} reason - Reason for blocking (optional)
     * @param {string} blockedBy - Discord user ID who blocked the channel
     * @returns {Promise<Object>} Created blocked channel object
     */
    static async addBlockedChannel(serverId, channelId, reason = null, blockedBy) {
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
            console.error('Error adding blocked channel:', error);
            throw error;
        }
    }

    /**
     * Remove a channel from the blocked list
     * @param {string} serverId - Discord server ID
     * @param {string} channelId - Discord channel ID
     * @returns {Promise<boolean>} True if removed, false if not found
     */
    static async removeBlockedChannel(serverId, channelId) {
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
            console.error('Error removing blocked channel:', error);
            return false;
        }
    }

    /**
     * Clear all blocked channels for a server
     * @param {string} serverId - Discord server ID
     * @returns {Promise<boolean>} True if cleared successfully
     */
    static async clearBlockedChannels(serverId) {
        try {
            const { data, error } = await supabase
                .from('blocked_channels')
                .delete()
                .eq('server_id', String(serverId))
                .select('server_id::text, channel_id::text');
            
            if (error) throw error;
            return data ? data.length : 0;
        } catch (error) {
            console.error('Error clearing blocked channels:', error);
            return false;
        }
    }
}

module.exports = DatabaseUtils;

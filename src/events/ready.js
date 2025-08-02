const { Events } = require('discord.js');
const { supabase, testConnection } = require('../config/database');
const logger = require('../utils/logger');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        logger.lifecycle(`TrustFactor Bot is ready! Logged in as ${client.user.tag}`, 'STARTUP');
        logger.info(`Serving ${client.guilds.cache.size} servers`, 'STARTUP');
        
        // Set bot activity status
        client.user.setActivity('community scores', { type: 'WATCHING' });
        
        try {
            // Test database connection
            const connectionSuccess = await testConnection();
            if (connectionSuccess) {
                logger.db('Database connection verified', 'STARTUP');
            } else {
                logger.error('Database connection failed', 'STARTUP');
                return;
            }
            
            // Load and resume tracking all pending votes
            await loadPendingVotes(client);
            
            // Clean up expired votes on startup
            await cleanupExpiredVotes();
            
            // Set up periodic cleanup every 5 minutes
            setInterval(async () => {
                await cleanupExpiredVotes();
            }, 5 * 60 * 1000); // 5 minutes
            
            logger.info(`Serving ${client.guilds.cache.size} servers`, 'STARTUP');
            logger.db('Supabase connection successful', 'STARTUP');
            logger.db('Database connection verified', 'STARTUP');
            logger.info('Periodic vote expiration check enabled (every 5 minutes)', 'STARTUP');
            
        } catch (error) {
            logger.errorWithStack('Startup error', error, 'STARTUP');
        }
    },
};

/**
 * Load and resume tracking all pending votes on bot startup
 */
async function loadPendingVotes(client) {
    try {
        logger.vote('Loading pending votes from database...', 'STARTUP');
        
        // Get all active pending votes
        const { data: pendingVotes, error } = await supabase
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
            .eq('status', 'pending')
            .gt('expires_at', new Date().toISOString());
        
        if (error) {
            logger.errorWithStack('Error loading pending votes', error, 'STARTUP');
            return;
        }
        
        if (!pendingVotes || pendingVotes.length === 0) {
            logger.vote('No pending votes to resume tracking', 'STARTUP');
            return;
        }
        
        logger.vote(`Found ${pendingVotes.length} pending votes to resume tracking`, 'STARTUP');
        
        const VotingUtils = require('../utils/voting');
        let resumedCount = 0;
        let failedCount = 0;
        
        // Process each pending vote
        for (const vote of pendingVotes) {
            try {
                // Try to fetch the channel and message
                const channel = await client.channels.fetch(vote.channel_id).catch(() => null);
                if (!channel) {
                    logger.warn(`Channel ${vote.channel_id} not found for vote ${vote.id}`, 'STARTUP');
                    failedCount++;
                    continue;
                }
                
                const message = await channel.messages.fetch(vote.message_id).catch(() => null);
                if (!message) {
                    logger.warn(`Message ${vote.message_id} not found for vote ${vote.id}`, 'STARTUP');
                    failedCount++;
                    continue;
                }
                
                // Set up timeout for vote expiration
                const timeUntilExpiry = new Date(vote.expires_at).getTime() - Date.now();
                if (timeUntilExpiry > 0) {
                    setTimeout(async () => {
                        try {
                            await VotingUtils.handleExpiredVote(vote, client);
                        } catch (error) {
                            logger.errorWithStack(`Error handling expired vote ${vote.id}`, error, 'VOTE');
                        }
                    }, timeUntilExpiry);
                    
                    resumedCount++;
                    logger.vote(`Resumed tracking vote ${vote.id} (expires in ${Math.round(timeUntilExpiry / 1000 / 60)} minutes)`, 'STARTUP');
                } else {
                    // Vote should have expired already, mark it as expired
                    await VotingUtils.handleExpiredVote(vote, client);
                    logger.vote(`Immediately expired vote ${vote.id}`, 'STARTUP');
                }
                
            } catch (error) {
                logger.errorWithStack(`Error processing vote ${vote.id}`, error, 'STARTUP');
                failedCount++;
            }
        }
        
        logger.vote(`Successfully resumed tracking ${resumedCount} pending votes`, 'STARTUP');
        if (failedCount > 0) {
            logger.warn(`Failed to resume tracking ${failedCount} votes (messages/channels not found)`, 'STARTUP');
        }
        
    } catch (error) {
        logger.errorWithStack('Error in loadPendingVotes', error, 'STARTUP');
    }
}

/**
 * Clean up expired pending votes on bot startup
 */
async function cleanupExpiredVotes() {
    try {
        // First, get the expired votes before updating them
        const { data: expiredVotes, error: selectError } = await supabase
            .from('pending_votes')
            .select('*')
            .eq('status', 'pending')
            .lt('expires_at', new Date().toISOString());
        
        if (selectError) {
            logger.errorWithStack('Error fetching expired votes', selectError, 'CLEANUP');
            return;
        }
        
        if (!expiredVotes || expiredVotes.length === 0) {
            logger.vote('Expired votes cleaned up', 'CLEANUP');
            return;
        }
        
        // Update the database status
        const { error: updateError } = await supabase
            .from('pending_votes')
            .update({ status: 'expired' })
            .eq('status', 'pending')
            .lt('expires_at', new Date().toISOString());
        
        if (updateError) {
            logger.errorWithStack('Error updating expired votes', updateError, 'CLEANUP');
            return;
        }
        
        // Update Discord messages for each expired vote
        const VotingUtils = require('../utils/voting');
        for (const expiredVote of expiredVotes) {
            try {
                await VotingUtils.handleExpiredVote(expiredVote, client);
            } catch (error) {
                logger.errorWithStack(`Error updating expired vote message ${expiredVote.id}`, error, 'CLEANUP');
            }
        }
        
        logger.vote(`Marked ${expiredVotes.length} expired votes as expired`, 'CLEANUP');
        logger.vote('Expired votes cleaned up', 'CLEANUP');
    } catch (error) {
        logger.errorWithStack('Error in cleanupExpiredVotes', error, 'CLEANUP');
    }
}

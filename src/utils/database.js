// Thin facade over cohesive DB modules. Prefer importing specific modules for new code.
const ConfigDB = require('./db/config');
const ScoresDB = require('./db/scores');
const VotesDB = require('./db/votes');
const ReactionsDB = require('./db/reactions');
const RolesDB = require('./db/roles');

class DatabaseUtils {
  // Config
  static async getServerConfig(serverId) { return ConfigDB.getServerConfig(serverId); }
  static async getUserDMPreference(userId) { return ConfigDB.getUserDMPreference(userId); }
  static async setUserDMPreference(userId, allowDMs) { return ConfigDB.setUserDMPreference(userId, allowDMs); }
  static async getBlockedChannels(serverId) { return ConfigDB.getBlockedChannels(serverId); }
  static async isChannelBlocked(serverId, channelId) { return ConfigDB.isChannelBlocked(serverId, channelId); }
  static async addBlockedChannel(serverId, channelId, reason, blockedBy) { return ConfigDB.addBlockedChannel(serverId, channelId, reason, blockedBy); }
  static async removeBlockedChannel(serverId, channelId) { return ConfigDB.removeBlockedChannel(serverId, channelId); }
  static async clearBlockedChannels(serverId) { return ConfigDB.clearBlockedChannels(serverId); }

  // Scores
  static async getUserScore(userId, serverId) { return ScoresDB.getUserScore(userId, serverId); }
  static async getUserHistory(userId, serverId, limit) { return ScoresDB.getUserHistory(userId, serverId, limit); }
  static async setUserScore(userId, serverId, newScore, reason, awardedBy) { return ScoresDB.setUserScore(userId, serverId, newScore, reason, awardedBy); }
  static async applyScoreChange(userId, serverId, pointChange, reason, awardedBy, pendingVoteId, messageId, channelId) {
    return ScoresDB.applyScoreChange(userId, serverId, pointChange, reason, awardedBy, pendingVoteId, messageId, channelId);
  }

  // Votes
  static async createPendingVote(voteData) { return VotesDB.createPendingVote(voteData); }
  static async getPendingVote(messageId) { return VotesDB.getPendingVote(messageId); }
  static async recordVote(voteId, voterId, voteType) { return VotesDB.recordVote(voteId, voterId, voteType); }
  static async getVoteCount(voteId) { return VotesDB.getVoteCount(voteId); }
  static async getUserVote(voteId, userId) { return VotesDB.getUserVote(voteId, userId); }
  static async removeVote(voteId, userId) { return VotesDB.removeVote(voteId, userId); }
  static async updateVoteStatus(voteId, status) { return VotesDB.updateVoteStatus(voteId, status); }
  static async atomicApproveVote(voteId) { return VotesDB.atomicApproveVote(voteId); }
  static async atomicExpireVote(voteId) { return VotesDB.atomicExpireVote(voteId); }
  static async getUserLastAward(userId, serverId) { return VotesDB.getUserLastAward(userId, serverId); }

  // Reactions
  static async getCustomReactions(serverId) { return ReactionsDB.getCustomReactions(serverId); }
  static async getCustomReaction(serverId, emoji) { return ReactionsDB.getCustomReaction(serverId, emoji); }
  static async setCustomReaction(serverId, emoji, pointValue) { return ReactionsDB.setCustomReaction(serverId, emoji, pointValue); }
  static async removeCustomReaction(serverId, emoji) { return ReactionsDB.removeCustomReaction(serverId, emoji); }
  static async toggleCustomReaction(serverId, emoji, isActive) { return ReactionsDB.toggleCustomReaction(serverId, emoji, isActive); }
  static async setupDefaultReactions(serverId) { return ReactionsDB.setupDefaultReactions(serverId); }
  static async clearCustomReactions(serverId) { return ReactionsDB.clearCustomReactions(serverId); }

  // Roles / Leaderboard
  static async getLeaderboard(serverId, limit) { return RolesDB.getLeaderboard(serverId, limit); }
  static async getServerOnlyLeaderboard(serverId, limit) { return RolesDB.getServerOnlyLeaderboard(serverId, limit); }
  static async assignLeaderboardRoles(serverId, guild) { return RolesDB.assignLeaderboardRoles(serverId, guild); }
  static async assignAutoRoles(serverId, guild) { return RolesDB.assignAutoRoles(serverId, guild); }
  static async filterForGuildMembers(leaderboard, guild) { return RolesDB.filterForGuildMembers(leaderboard, guild); }
  static async processLeaderboardRoles(leaderboard, roles, guild, type, strategy) { return RolesDB.processLeaderboardRoles(leaderboard, roles, guild, type, strategy); }
}

module.exports = DatabaseUtils;



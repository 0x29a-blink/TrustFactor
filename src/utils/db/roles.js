const { supabase } = require('../../config/database');
const { toIdString } = require('../ids');
const logger = require('../logger');
const Scores = require('./scores');

// Leaderboard helpers that rely on DB aggregation (RPCs if available)
async function getLeaderboard(serverId, limit = 10) {
  try {
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_server_leaderboard', {
        target_server_id: toIdString(serverId),
        limit_count: limit,
      });
      if (!rpcError && Array.isArray(rpcData)) {
        return rpcData.map(row => ({ user_id: row.user_id, total_score: Number(row.total_score), updated_at: row.updated_at }));
      }
    } catch (_) {}
    const { data, error } = await supabase
      .from('scores')
      .select('user_id::text, total_score, updated_at')
      .eq('server_id', toIdString(serverId))
      .order('total_score', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  } catch (error) {
    logger.errorWithStack('Error getting leaderboard', error, 'DB');
    throw error;
  }
}

async function getServerOnlyLeaderboard(serverId, limit = 10) {
  try {
    return await getLeaderboard(serverId, limit);
  } catch (error) {
    logger.errorWithStack('Error getting server-only leaderboard', error, 'DB');
    throw error;
  }
}

async function assignLeaderboardRoles(serverId, guild) {
  try {
    logger.config(`🔍 Starting leaderboard role assignment for server ${serverId}`, 'LEADERBOARD-ROLES');
    const serverConfig = await require('./../db/config').getServerConfig(serverId);
    const leaderboardRoles = serverConfig.leaderboard_roles || {};
    logger.object(`📋 Leaderboard roles config:`, leaderboardRoles, 'LEADERBOARD-ROLES');

    if (Object.keys(leaderboardRoles).length === 0) {
      logger.config(`❌ No leaderboard roles configured`, 'LEADERBOARD-ROLES');
      return { assigned: 0, removed: 0, errors: [] };
    }

    const globalLeaderboard = await getLeaderboard(serverId, 300);
    const serverOnlyLeaderboard = await getServerOnlyLeaderboard(serverId, 300);

    const assignmentStrategy = leaderboardRoles.assignment_strategy || {};
    const positiveStrategy = assignmentStrategy.positive || 'server-local';
    const negativeStrategy = assignmentStrategy.negative || 'server-local';
    logger.config(`⚙️ Assignment strategies - Positive: ${positiveStrategy}, Negative: ${negativeStrategy}`, 'LEADERBOARD-ROLES');

    // Build positive list
    let positiveSource = (positiveStrategy === 'server-local') ? (serverOnlyLeaderboard || []) : globalLeaderboard;
    let positiveLeaderboard = positiveSource.filter(entry => entry.total_score > 0);
    if (positiveStrategy === 'server-local' || positiveStrategy === 'global-filtered') {
      const before = positiveLeaderboard.length;
      positiveLeaderboard = await filterForGuildMembers(positiveLeaderboard, guild);
      logger.config(`${positiveStrategy === 'server-local' ? '🏠' : '🌐'} Positive ${positiveStrategy} filtering: ${before} → ${positiveLeaderboard.length} members`, 'LEADERBOARD-ROLES');
    }
    positiveLeaderboard = positiveLeaderboard.slice(0, 10);

    // Build negative list
    let negativeSource = (negativeStrategy === 'server-local') ? (serverOnlyLeaderboard || []) : globalLeaderboard;
    let negativeLeaderboard = negativeSource.filter(entry => entry.total_score < 0).sort((a, b) => a.total_score - b.total_score);
    if (negativeStrategy === 'server-local' || negativeStrategy === 'global-filtered') {
      const before = negativeLeaderboard.length;
      negativeLeaderboard = await filterForGuildMembers(negativeLeaderboard, guild);
      logger.config(`${negativeStrategy === 'server-local' ? '🏠' : '🌐'} Negative ${negativeStrategy} filtering: ${before} → ${negativeLeaderboard.length} members`, 'LEADERBOARD-ROLES');
    }
    negativeLeaderboard = negativeLeaderboard.slice(0, 10);

    logger.object(`📊 Final Positive leaderboard:`, positiveLeaderboard.map(e => `${e.user_id}: ${e.total_score}`), 'LEADERBOARD-ROLES');
    logger.object(`📊 Final Negative leaderboard:`, negativeLeaderboard.map(e => `${e.user_id}: ${e.total_score}`), 'LEADERBOARD-ROLES');

    const results = { assigned: 0, removed: 0, errors: [] };

    const positiveAssignments = await processLeaderboardRoles(positiveLeaderboard, leaderboardRoles.positive || {}, guild, 'positive', positiveStrategy);
    results.assigned += positiveAssignments.assigned; results.removed += positiveAssignments.removed || 0; results.errors.push(...positiveAssignments.errors);
    const negativeAssignments = await processLeaderboardRoles(negativeLeaderboard, leaderboardRoles.negative || {}, guild, 'negative', negativeStrategy);
    results.assigned += negativeAssignments.assigned; results.removed += negativeAssignments.removed || 0; results.errors.push(...negativeAssignments.errors);

    // Cleanup roles for users not in top positions
    const allConfiguredRoles = [...Object.values(leaderboardRoles.positive || {}), ...Object.values(leaderboardRoles.negative || {})];
    const usersInTopPositions = new Set([...positiveLeaderboard, ...negativeLeaderboard].map(e => String(e.user_id)));
    for (const roleId of allConfiguredRoles) {
      try {
        const roleIdStr = String(roleId);
        const role = guild.roles.cache.get(roleIdStr);
        if (role) {
          for (const [memberId, member] of role.members) {
            const memberIdString = String(memberId);
            if (!usersInTopPositions.has(memberIdString)) {
              await member.roles.remove(roleIdStr, 'No longer in leaderboard position');
              results.removed++;
              logger.config(`🗑️ Removed role ${role.name} from ${member.user.tag} (no longer in top positions)`, 'LEADERBOARD-ROLES');
            }
          }
        }
      } catch (error) {
        logger.errorWithStack(`Error removing role ${roleId}`, error, 'LEADERBOARD-ROLES');
        results.errors.push(`Failed to remove role ${roleId}: ${error.message}`);
      }
    }

    logger.config(`🎯 Final results: ${results.assigned} assigned, ${results.removed} removed, ${results.errors.length} errors`, 'LEADERBOARD-ROLES');
    return results;
  } catch (error) {
    logger.errorWithStack('Error assigning leaderboard roles', error, 'LEADERBOARD-ROLES');
    throw error;
  }
}

async function assignAutoRoles(serverId, guild) {
  try {
    logger.config(`🔍 Starting auto-role assignment for server ${serverId}`, 'AUTO-ROLES');
    const serverConfig = await require('./../db/config').getServerConfig(serverId);
    const autoRoles = serverConfig.auto_role_thresholds || {};
    if (!autoRoles || Object.keys(autoRoles).length === 0) {
      logger.config('❌ No auto roles configured', 'AUTO-ROLES');
      return { assigned: 0, removed: 0, errors: [] };
    }
    const roleThresholds = Object.entries(autoRoles)
      .map(([threshold, roleId]) => ({ threshold: parseInt(threshold), roleId: String(roleId) }))
      .filter(e => !Number.isNaN(e.threshold) && !!e.roleId)
      .sort((a, b) => a.threshold - b.threshold);
    if (roleThresholds.length === 0) return { assigned: 0, removed: 0, errors: [] };

    const minThreshold = roleThresholds[0].threshold;
    const autoRoleIds = roleThresholds.map(rt => rt.roleId).filter(id => guild.roles.cache.has(id));
    const usersWithAutoRoles = new Set();
    for (const roleId of autoRoleIds) {
      const role = guild.roles.cache.get(roleId);
      if (!role) continue;
      for (const [memberId] of role.members) usersWithAutoRoles.add(String(memberId));
    }
    let thresholdQuery = supabase.from('scores').select('user_id::text').eq('server_id', toIdString(serverId));
    if (minThreshold >= 0) thresholdQuery = thresholdQuery.gte('total_score', minThreshold);
    const { data: aboveMin, error: thresholdErr } = await thresholdQuery; if (thresholdErr) throw thresholdErr;

    const candidateUserIds = new Set((aboveMin || []).map(r => String(r.user_id))); for (const uid of usersWithAutoRoles) candidateUserIds.add(uid);
    const candidateList = Array.from(candidateUserIds);

    const scoresByUser = new Map();
    if (candidateList.length > 0) {
      const { data: scoreRows, error: scoresErr } = await supabase
        .from('scores')
        .select('user_id::text, total_score')
        .eq('server_id', toIdString(serverId))
        .in('user_id', candidateList);
      if (scoresErr) throw scoresErr;
      for (const row of scoreRows || []) scoresByUser.set(String(row.user_id), row.total_score || 0);
    }

    const results = { assigned: 0, removed: 0, errors: [] };
    for (const userId of candidateList) {
      try {
        const score = scoresByUser.get(userId) ?? 0;
        const eligible = roleThresholds.filter(rt => score >= rt.threshold).sort((a, b) => b.threshold - a.threshold)[0] || null;
        const targetRoleId = eligible ? eligible.roleId : null;
        let member; try { member = await guild.members.fetch(userId); } catch { continue; }
        for (const roleId of autoRoleIds) {
          const hasRole = member.roles.cache.has(roleId);
          if (roleId === targetRoleId) {
            if (!hasRole) {
              const role = guild.roles.cache.get(roleId);
              if (role) {
                await member.roles.add(roleId, eligible ? `Auto role threshold met (${eligible.threshold} pts)` : 'Auto role sync');
                results.assigned++;
                logger.config(`✅ Assigned role ${role.name} to ${member.user.tag} (${score} pts)`, 'AUTO-ROLES');
              }
            }
          } else if (hasRole) {
            const role = guild.roles.cache.get(roleId);
            try {
              await member.roles.remove(roleId, targetRoleId ? 'Superseded by higher threshold role' : 'No longer meets auto role threshold');
              results.removed++;
              if (role) logger.config(`🗑️ Removed role ${role.name} from ${member.user.tag} (${score} pts)`, 'AUTO-ROLES');
            } catch (removeErr) {
              results.errors.push(removeErr.message);
            }
          }
        }
      } catch (assignErr) {
        results.errors.push(assignErr.message);
      }
    }
    logger.config(`🎯 Auto-role sync complete: ${results.assigned} assigned, ${results.removed} removed, ${results.errors.length} errors`, 'AUTO-ROLES');
    return results;
  } catch (error) {
    logger.errorWithStack('Error assigning auto roles', error, 'AUTO-ROLES');
    return { assigned: 0, removed: 0, errors: [error.message] };
  }
}

async function filterForGuildMembers(leaderboard, guild) {
  const filtered = [];
  for (const entry of leaderboard) {
    try { await guild.members.fetch(String(entry.user_id)); filtered.push(entry); logger.debug(`✅ User ${entry.user_id} is in guild`, 'LEADERBOARD-ROLES'); }
    catch { logger.debug(`❌ User ${entry.user_id} not in guild`, 'LEADERBOARD-ROLES'); }
  }
  return filtered;
}

async function processLeaderboardRoles(leaderboard, roles, guild, type, strategy) {
  const results = { assigned: 0, removed: 0, errors: [] };
  for (let i = 0; i < leaderboard.length; i++) {
    const entry = leaderboard[i];
    const position = i + 1;
    const roleId = roles[position];
    logger.debug(`👤 ${type} position ${position}: User ${entry.user_id} (${entry.total_score} pts), roleId: ${roleId}, strategy: ${strategy}`, 'LEADERBOARD-ROLES');
    if (!roleId) continue;
    try {
      const userIdString = String(entry.user_id);
      let member;
      if (strategy === 'global') {
        try { member = await guild.members.fetch(userIdString); } catch { member = null; }
      } else {
        member = await guild.members.fetch(userIdString);
      }
      const roleIdString = String(roleId);
      const role = guild.roles.cache.get(roleIdString);
      const hasRole = member ? member.roles.cache.has(roleIdString) : false;
      if (!role) {
        logger.warn(`❌ Role ${roleIdString} not found in guild`, 'LEADERBOARD-ROLES');
      } else {
        try {
          const membersWithRole = role.members;
          const desiredUserId = member ? String(member.id) : null;
          for (const [holderId, holderMember] of membersWithRole) {
            if (!desiredUserId || String(holderId) !== desiredUserId) {
              await holderMember.roles.remove(roleIdString, `${type} leaderboard reconciliation (position ${position})`);
              results.removed++;
              logger.config(`🗑️ Removed ${type} role ${role.name} from ${holderMember.user.tag} (not position ${position})`, 'LEADERBOARD-ROLES');
            }
          }
        } catch (cleanupError) {
          logger.warn(`Cleanup failed for role ${role.name}: ${cleanupError.message}`, 'LEADERBOARD-ROLES');
        }
        if (member && !hasRole) {
          await member.roles.add(roleIdString, `${type} leaderboard position ${position} role assignment (${strategy})`);
          logger.config(`✅ Assigned ${type} role ${role.name} to ${member.user.tag} (position ${position}, ${strategy})`, 'LEADERBOARD-ROLES');
          results.assigned++;
        }
      }
    } catch (error) {
      logger.errorWithStack(`Error assigning ${type} role to user ${entry.user_id}`, error, 'LEADERBOARD-ROLES');
      results.errors.push(`Failed to assign ${type} role to user ${entry.user_id}: ${error.message}`);
    }
  }
  return results;
}

module.exports = {
  getLeaderboard,
  getServerOnlyLeaderboard,
  assignLeaderboardRoles,
  assignAutoRoles,
  filterForGuildMembers,
  processLeaderboardRoles,
};



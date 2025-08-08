const { supabase } = require('../../../config/database');
const AuditLogger = require('../../../utils/logging');
const { handleServerSettingsChange } = require('../../../utils/syncHandler');

async function updateServerConfig(serverId, updates) {
  const serverIdString = String(serverId);
  const { error } = await supabase
    .from('servers')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('server_id', serverIdString);

  if (error) throw error;

  try {
    await handleServerSettingsChange(serverIdString, updates);
  } catch (_e) {
    // Intentionally swallow sync errors to avoid breaking UI flows
  }
}

async function logConfigChange(interaction, setting, oldValue, newValue) {
  try {
    await AuditLogger.logConfigChange(interaction.client, interaction.guildId, {
      changedBy: interaction.user.id,
      setting,
      oldValue: String(oldValue),
      newValue: String(newValue),
    });
  } catch (_e) {
    // non-fatal
  }
}

module.exports = { updateServerConfig, logConfigChange };
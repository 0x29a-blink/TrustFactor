# Blocked Channels Feature

## Overview

The blocked channels feature allows server administrators to prevent reaction point awards from being processed in specific channels. This is particularly useful for announcement channels, spam channels, or other high-traffic areas where reaction spam could be overwhelming.

## How It Works

- **Reaction Point Awards Only**: Blocked channels only affect reaction-based point awards. Reply-based point awards (using +/- notation) are not affected.
- **Silent Blocking**: When a channel is blocked, users can still react normally, but the bot will silently ignore the reactions without awarding points or sending any messages.
- **Server-Specific**: Blocked channels are configured per server and do not affect other servers.

## Database Schema

The feature adds a new table to the database:

```sql
CREATE TABLE IF NOT EXISTS blocked_channels (
    server_id BIGINT NOT NULL,
    channel_id BIGINT NOT NULL,
    reason TEXT,
    blocked_by BIGINT NOT NULL, -- Discord user ID who blocked the channel
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (server_id, channel_id),
    FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
);
```

## Configuration

### Accessing Blocked Channels Configuration

1. Use the `/config` command
2. Navigate to "Reaction-Based Voting Configuration"
3. Click the "🚫 Blocked Channels" button

### Adding a Blocked Channel

1. Click "➕ Add Channel"
2. Send a message with the channel mention (e.g., `#announcements`) or channel ID
3. Optionally include a reason after the channel mention (e.g., `#announcements Spam prevention`)
4. The bot will confirm the channel has been blocked

### Removing a Blocked Channel

1. Click "🗑️ Remove Channel"
2. Select the channel from the dropdown list
3. The bot will confirm the channel has been unblocked

### Clearing All Blocked Channels

1. Click "🧹 Clear All"
2. Confirm the action
3. All blocked channels will be removed

## Technical Implementation

### Database Methods

The following methods have been added to `DatabaseUtils`:

- `getBlockedChannels(serverId)` - Get all blocked channels for a server
- `isChannelBlocked(serverId, channelId)` - Check if a specific channel is blocked
- `addBlockedChannel(serverId, channelId, reason, blockedBy)` - Add a channel to the blocked list
- `removeBlockedChannel(serverId, channelId)` - Remove a channel from the blocked list
- `clearBlockedChannels(serverId)` - Clear all blocked channels for a server

### Event Handler Integration

The blocked channel check is integrated into the `messageReactionAdd` event handler:

```javascript
// Check if this channel is blocked for reaction point awards
const blockedChannel = await DatabaseUtils.isChannelBlocked(message.guild.id, message.channel.id);
if (blockedChannel) {
    logger.verbose(`Channel ${message.channel.id} is blocked for reaction point awards, ignoring reaction`, 'REACTION');
    return;
}
```

### Configuration UI

The configuration UI is integrated into the existing config command with:

- A new "🚫 Blocked Channels" button in the reaction configuration menu
- Chat-based channel addition (similar to custom reaction submissions)
- Dropdown selection for channel removal
- Confirmation dialogs for destructive actions

## Security Considerations

- **ID Handling**: All Discord IDs are stored as strings to prevent JavaScript precision errors
- **RLS Policies**: The blocked_channels table has Row Level Security enabled
- **Permission Checks**: Only users with "Manage Server" permission can configure blocked channels
- **Audit Logging**: All configuration changes are logged for audit purposes

## Performance Considerations

- **Indexing**: The blocked_channels table has an index on server_id for efficient lookups
- **Caching**: Channel blocked status is checked on each reaction, but the database query is optimized
- **Minimal Impact**: Blocked channel checks are performed early in the reaction processing pipeline

## Migration

The feature includes schema version 8 which adds:

1. The blocked_channels table
2. RLS policies for the new table
3. Performance indexes
4. Updated schema version tracking

## Testing

A test script (`test-blocked-channels.js`) is provided to verify the functionality:

```bash
node test-blocked-channels.js
```

The test covers:
- Adding blocked channels
- Checking blocked status
- Listing all blocked channels
- Removing blocked channels
- Clearing all blocked channels

## Usage Examples

### Common Use Cases

1. **Announcement Channels**: Prevent reaction spam in official announcement channels
2. **Spam Channels**: Block channels where users frequently spam reactions
3. **Bot Channels**: Prevent point awards in channels where bots post frequently
4. **Archive Channels**: Block channels that are primarily for reference

### Example Configuration

```
Server: My Gaming Community
Blocked Channels:
- #announcements (Official announcements only)
- #bot-spam (Bot messages)
- #memes (High reaction volume)
```

## Troubleshooting

### Channel Not Found Error
- Ensure the channel exists and is accessible
- Check that the bot has permission to view the channel
- Verify the channel ID is correct

### Configuration Not Saving
- Check that the user has "Manage Server" permission
- Ensure the bot has the necessary permissions
- Check the database connection

### Reactions Still Processing
- Verify the channel is actually in the blocked list
- Check that the bot has the latest configuration
- Ensure the reaction is a custom emoji (Unicode emojis are not affected by this feature) 
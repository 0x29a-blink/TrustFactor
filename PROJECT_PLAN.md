# TrustFactor Discord Bot - Project Planning Document

## Project Overview

**TrustFactor** is a community-driven user scoring system for Discord servers that allows members to award/deduct points through voting mechanics.

### Core Concept
- Users propose point awards/deductions via commands or reactions
- Community votes on proposals through Discord reactions
- Points are applied only when server-configured thresholds are met
- Optional multi-server score synchronization for administrators

---

## Technical Stack

- **Language**: JavaScript (Node.js)
- **Framework**: discord.js (latest stable version)
- **Database**: Supabase (PostgreSQL as a service)
- **Hosting**: Direct Node.js execution
- **Environment**: Node.js with virtual environment management (nvm recommended)

---

## Core Features

### 1. Point Award System

**Command-based approach:**
```
/award @user +2 "Great joke!"
/award @user -1 "Poor sportsmanship"
```
- Bot posts confirmation message: "X user has called to grant/revoke @user <x> points, optional_comment"
- Bot adds voting reactions (✅/❌) to the confirmation message
- Points granted/revoked when server-configured threshold is met
- **Success feedback**: Bot replies to the command response message with "{user} has received {points} - {reason}" (configurable)
- **Failed feedback**: Bot replies to the command response message with "Vote failed for {user} ({votes}/{required} votes)" (configurable)

**Message reply-based approach:**
- Users reply to messages with point notation: `+2`, `-1`, `+5 great joke!`
- Bot detects replies containing point patterns (regex: `^[+-]\d+`)
- Bot adds confirmation reaction to the reply message
- Points granted when server-configured voting threshold is met on the reply
- **Success feedback**: Bot replies to the original message being replied to with "{user} has received {points} - {reason}" (configurable)
- **Failed feedback**: Bot replies to the original message being replied to with "Vote failed for {user} ({votes}/{required} votes)" (configurable)

**Reaction-based approach:**
- Bot monitors messages for configured custom emoji reactions
- Each reaction type has a configured point value (📈 = +2, 📉 = -1, etc.)
- Points granted when reaction count meets server-configured threshold (same threshold system as other approaches)
- Each unique user reaction counts toward threshold (duplicate reactions from same user ignored)
- Direct point application without additional voting step
- **Success feedback**: Bot replies to the original message being reacted to with "{user} has received {points} - {reason}" (configurable)
- **Failed feedback**: Bot replies to the original message being reacted to with "Vote failed for {user} ({votes}/{required} votes)" (configurable)

### 2. Server Configuration
- **Fixed threshold**: Per server-configurable threshold (e.g., 3+ approvals needed)
- **Formula-based thresholds** (optional):
- Each point awarded requires additional voters
- Example: +5 points requires 5 unique votes, -5 points also requires 5 unique votes
- Formula: `required_votes = base + (abs(points) * multiplier)`
- Negative points follow same formula (absolute value used)
- Minimum threshold is always 1, maximum is server-configurable
- Prevents high-impact awards without proportional community support
- **Voting window**: Per server-configurable time limit (e.g., 5 minutes)
- **Threshold mode**: Toggle between fixed or formula-based thresholds per server

### 3. Score Management
- `/score @user` - View individual user score with recent history
  - Shows current total score
  - Displays recent point changes (last 10 entries)
  - Each entry shows: date, point change, reason, who awarded it
  - `/score @user history` - View full detailed score history with pagination
- `/leaderboard` - Interactive server leaderboard
  - Navigation buttons: ⬅️ Previous | ➡️ Next | 🔝 Top | 🔻 Bottom
  - Message updates on button clicks (no spam)
  - Shows 10 users per page with rank, username, and score
  - Custom embed with server branding

### 4. Server Administration

**Threshold Configuration:**
- `/config threshold <number>` - Set fixed voting threshold (e.g., 3 votes needed)
- `/config threshold-mode <fixed/formula>` - Toggle between fixed or formula-based thresholds
- `/config formula-base <number>` - Set base threshold for formula mode
- `/config formula-multiplier <number>` - Set point multiplier for formula mode
- `/config timeout <minutes>` - Set voting window duration

**Point System Configuration:**
- `/config reactions <enable/disable>` - Toggle reaction-based point system
- `/config reaction add <emoji> <points>` - Add custom reaction with point value
- `/config reaction remove <emoji>` - Remove custom reaction
- `/config reaction list` - View all configured reactions
- `/config max-points <number>` - Set maximum points per single award
- `/config min-points <number>` - Set minimum points per single award

**Multi-Server Sync Management:**
- `/sync request` - Generate a sync code for other servers to join your sync group
- `/sync confirm <code>` - Join a sync group using a code from another server (mutual consent)
- `/sync leave` - Leave current sync group
- `/sync status` - View current sync group and member servers
- `/sync list-servers` - List all servers in your sync group

**User & Score Management:**
- `/reset @user` - Admin reset user's score to zero
- `/adjust @user <+/-><points> [reason]` - Manually adjust user score (bypass voting, reason optional)
- `/history @user clear` - Clear user's score history (admin only)
- `/leaderboard reset` - Reset all scores on the server (confirmation required)

**Bot Configuration:**
- `/config admin-roles add <@role>` - Add role that can use admin commands
- `/config admin-roles remove <@role>` - Remove admin role
- `/config log-channel <#channel>` - Set audit log channel
- `/config embed-color <hex>` - Customize bot embed colors for server branding
- `/config success-feedback <enable/disable>` - Toggle success confirmation messages
- `/config failed-feedback <enable/disable>` - Toggle failure notification messages
- `/config view` - Display current server configuration
- `/config export` - Export server settings to JSON
- `/config import <json>` - Import server settings from JSON

### 5. Multi-Server Support
- **Independent tracking**: Each server maintains its own score data by default
- **Sync groups**: Servers can join sync groups via `/sync <server_id>`
- **Additive display**: When synced, user scores are summed across all servers in the group
  - Example: User has +10 on Server A, +5 on Server B → Displays as 15 total
- **Separate storage**: Individual server scores remain in separate database records
- **Easy splitting**: Admins can leave sync groups without data loss
  - User retains original individual server scores when sync is removed
  - No data merging or corruption during sync operations
- **Per-server history**: Score history remains tied to the originating server
- **Conflict-free**: No data conflicts since each server owns its records
- **No server limits**: No maximum number of servers per sync group
- **Offline handling**: If a Discord server becomes unavailable, sync continues without disruption
- **Code-based joining**: Mutual consent via time-limited sync codes (no server ID exposure)

---

## System Architecture

### Database Schema

```sql
-- PostgreSQL optimized schema
-- Servers table
CREATE TABLE servers (
    server_id BIGINT PRIMARY KEY,
    threshold INTEGER DEFAULT 3 CHECK (threshold > 0),
    voting_timeout INTEGER DEFAULT 5 CHECK (voting_timeout > 0),
    reaction_mode BOOLEAN DEFAULT FALSE,
    sync_group VARCHAR(50),
    threshold_mode VARCHAR(10) DEFAULT 'fixed' CHECK (threshold_mode IN ('fixed', 'formula')),
    formula_base INTEGER DEFAULT 1 CHECK (formula_base >= 0),
    formula_multiplier INTEGER DEFAULT 1 CHECK (formula_multiplier >= 0),
    max_points_per_award INTEGER DEFAULT 10,
    min_points_per_award INTEGER DEFAULT -10,
    embed_color VARCHAR(7) DEFAULT '#5865F2',
    log_channel BIGINT,
    success_feedback BOOLEAN DEFAULT TRUE,
    failed_feedback BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Users table (global user tracking)
CREATE TABLE users (
    user_id BIGINT PRIMARY KEY,
    username VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Scores table (per-server or synced)
CREATE TABLE scores (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    server_id BIGINT NOT NULL,
    sync_group VARCHAR(50),
    score INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, server_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (server_id) REFERENCES servers(server_id)
);

-- Pending votes table
CREATE TABLE pending_votes (
    id SERIAL PRIMARY KEY,
    message_id BIGINT NOT NULL,
    original_message_id BIGINT, -- Message being awarded points (for feedback replies)
    channel_id BIGINT NOT NULL, -- Channel for posting feedback
    proposer_id BIGINT NOT NULL,
    target_user_id BIGINT NOT NULL,
    server_id BIGINT NOT NULL,
    point_change INTEGER NOT NULL,
    reason TEXT,
    vote_method VARCHAR(20) NOT NULL CHECK (vote_method IN ('command', 'reply', 'reaction')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    FOREIGN KEY (server_id) REFERENCES servers(server_id)
);

-- Vote tracking table
CREATE TABLE votes (
    id SERIAL PRIMARY KEY,
    pending_vote_id INTEGER NOT NULL,
    voter_id BIGINT NOT NULL,
    vote_type VARCHAR(10) NOT NULL CHECK (vote_type IN ('approve', 'reject')),
    voted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(pending_vote_id, voter_id),
    FOREIGN KEY (pending_vote_id) REFERENCES pending_votes(id) ON DELETE CASCADE
);

-- Score history table (for detailed user score tracking)
CREATE TABLE score_history (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    server_id BIGINT NOT NULL,
    point_change INTEGER NOT NULL,
    reason TEXT,
    awarded_by BIGINT,
    award_type VARCHAR(20) NOT NULL CHECK (award_type IN ('command', 'reply', 'reaction', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (server_id) REFERENCES servers(server_id)
);

-- Admin roles table (per-server admin role configuration)
CREATE TABLE admin_roles (
    id SERIAL PRIMARY KEY,
    server_id BIGINT NOT NULL,
    role_id BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(server_id, role_id),
    FOREIGN KEY (server_id) REFERENCES servers(server_id)
);

-- Custom reactions table (server-specific reaction configurations)
CREATE TABLE custom_reactions (
    id SERIAL PRIMARY KEY,
    server_id BIGINT NOT NULL,
    emoji VARCHAR(100) NOT NULL, -- Unicode or custom emoji ID
    point_value INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(server_id, emoji),
    FOREIGN KEY (server_id) REFERENCES servers(server_id)
);
```

### Bot Structure
```
📁 src/
├── 📁 commands/
│   ├── award.js              // Command-based point awards
│   ├── score.js              // Individual score viewing with history
│   ├── leaderboard.js        // Interactive leaderboard with navigation
│   ├── config.js             // Server configuration management
│   ├── sync.js               // Multi-server sync management
│   ├── reset.js              // Score reset functionality
│   ├── adjust.js             // Manual admin score adjustments
│   └── history.js            // Score history management
├── 📁 events/
│   ├── ready.js              // Bot startup and initialization
│   ├── interactionCreate.js  // Slash commands and button interactions
│   ├── messageCreate.js      // Message reply-based point detection
│   ├── messageReactionAdd.js // Reaction-based point system
│   └── messageReactionRemove.js // Handle reaction removals
├── 📁 utils/
│   ├── database.js           // Database connection and queries
│   ├── scoring.js            // Core scoring logic and calculations
│   ├── voting.js             // Voting mechanism and threshold checks
│   ├── syncManager.js        // Multi-server sync coordination
│   ├── historyManager.js     // Score history tracking and retrieval
│   ├── embedBuilder.js       // Custom embed generation
│   ├── feedbackManager.js    // Success/failed feedback message handling
│   └── permissions.js        // Role-based permission checking
├── 📁 config/
│   ├── bot-config.js         // Bot configuration and constants
│   ├── supabase-config.js    // Supabase client configuration
│   └── default-settings.js   // Default server settings
├── 📁 migrations/
│   └── init-database.sql     // Supabase database schema for setup
├── .env.example              // Environment variables template
├── package.json              // Node.js dependencies and scripts
└── index.js                  // Main bot entry point
```

### Supabase Setup

**Prerequisites:**
1. Create a Supabase account at https://supabase.com
2. Create a new project in your Supabase dashboard
3. Note your project URL and API keys from Settings > API

**Environment Configuration (.env):**
```env
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_client_id

# Supabase Configuration
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
SUPABASE_URL=https://[project-ref].supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Environment
NODE_ENV=development
```

**Database Setup:**
1. Go to your Supabase dashboard > SQL Editor
2. Run the database schema (provided in the Database Schema section)
3. Enable Row Level Security (RLS) if needed for your use case
4. Configure any additional Supabase features (real-time, storage, etc.)

**Local Development:**
```bash
# Install dependencies
npm install

# Run the bot
npm start
# or for development with auto-restart
npm run dev
```

---

## 🚀 Development Phases

### Phase 1: Core Functionality (MVP)
- [ ] Bot setup and Discord.js integration
- [ ] Database setup (Supabase project creation and schema deployment)
- [ ] `/award` command with voting mechanism
- [ ] `/score` command with basic history (last 10 entries)
- [ ] Basic `/leaderboard` command (static)
- [ ] Basic `/config` commands for threshold and timeout
- [ ] Message reply-based point detection (`+2`, `-1`, etc.)

### Phase 2: Enhanced Voting & History
- [ ] Formula-based threshold system implementation
- [ ] Complete score history tracking with pagination
- [ ] Interactive leaderboard with navigation buttons
- [ ] Custom embed styling and server branding
- [ ] Admin role management system
- [ ] Audit logging functionality
- [ ] Success and failed feedback message system with toggle options

### Phase 3: Reaction System & Advanced Config
- [ ] Reaction-based point system with custom emojis
- [ ] Complete `/config` command suite (reactions, limits, etc.)
- [ ] Manual score adjustment commands (`/adjust`, `/reset`)
- [ ] Configuration export/import functionality
- [ ] Advanced permission system

### Phase 4: Multi-Server Support
- [ ] Sync group database architecture
- [ ] `/sync` command implementation (join/leave/status)
- [ ] Additive score display across synced servers
- [ ] Per-server history preservation during sync operations
- [ ] Conflict-free sync splitting functionality

### Phase 5: Quality of Life & Polish
- [ ] Comprehensive help system and documentation
- [ ] Advanced error handling and user feedback
- [ ] Rate limiting and spam protection
- [ ] Bot status monitoring and health checks
- [ ] Performance optimization for large servers

### Phase 6: Advanced Features (Future)
- [ ] Web dashboard for administrators
- [ ] Score analytics and trend tracking
- [ ] Achievement/badge system
- [ ] Seasonal events and special scoring periods
- [ ] API endpoints for external integrations

---

## ⚙️ Configuration Options

### Server-Level Settings
```javascript
{
  // Voting Configuration
  "threshold": 3,                    // Fixed voting threshold
  "thresholdMode": "fixed",          // "fixed" or "formula"
  "formulaBase": 1,                  // Base votes for formula mode
  "formulaMultiplier": 1,            // Point multiplier for formula mode
  "votingTimeout": 5,                // Minutes for voting window
  
  // Point System Configuration
  "reactionMode": false,             // Enable reaction-based awards
  "customReactions": {               // Custom reaction configurations
    // Unicode emojis (standard)
    "📈": 2,                        // Positive reactions
    "📉": -1,                       // Negative reactions
    "🔥": 3,                        // Special reactions
    "💯": 5,                        // Perfect score
    // Custom server emojis (using emoji ID)
    "123456789012345678": 4,           // Custom server emoji by ID
    "987654321098765432": -2,          // Custom negative emoji by ID
    // Animated custom emojis also supported
    "a:animated_emoji:111222333444555666": 6  // Animated custom emoji
  },
  "maxPointsPerAward": 10,           // Maximum points per single award
  "minPointsPerAward": -10,          // Minimum points per single award
  
  // Multi-Server Sync
  "syncGroup": null,                 // Multi-server sync group ID
  
  // Administration
  "adminRoles": [                    // Roles that can use admin commands
    "123456789012345678",            // Admin role ID
    "987654321098765432"             // Moderator role ID
  ],
  "logChannel": null,                // Channel for audit logs
  
  // Customization
  "embedColor": "#5865F2",           // Custom embed color (hex)
  "serverBranding": {
    "name": "TrustFactor Bot",         // Custom bot name for embeds
    "icon": null                     // Custom icon URL
  },
  
  // Input Validation Rules
  "validation": {
    "threshold": { "min": 1, "max": 50 },              // Threshold limits
    "votingTimeout": { "min": 30, "max": 1440 },        // 30 seconds to 24 hours (in seconds)
    "pointLimits": { "min": -100, "max": 100 },        // Point award limits
    "embedColor": "^#[0-9A-Fa-f]{6}$",                 // Hex color validation regex
    "formulaBase": { "min": 0, "max": 10 },             // Formula base limits
    "formulaMultiplier": { "min": 0, "max": 5 }        // Formula multiplier limits
  },
  
  // Feedback Configuration
  "successFeedback": true,              // Enable success confirmation messages
  "failedFeedback": false               // Enable failure notification messages
}
```

---

## 🔒 Security & Anti-Abuse

### Spam Protection
- **Rate limiting**: `/award` command limited to 5 uses per user per hour (default, server-configurable)
- **No cooldown periods**: Users can award points to different users without waiting
- **Point limits**: Server-configurable max/min points per single award
- **Voting thresholds**: Community approval required for all point changes
- **Formula-based scaling**: Higher point awards require more votes automatically
- **No global server limits**: No enforced limits on total server activity by default

### Admin Controls
- **Role-based permissions**: All admin roles have equal permissions (no hierarchy)
- **Confirmation required**: Destructive actions (server reset, history clearing) require confirmation
- **Comprehensive audit logging**: All point changes tracked with timestamps, reasons, and actors
- **Manual intervention**: Admin override capabilities (`/adjust`, `/reset`)
- **Vote reversal**: Ability to reverse fraudulent or mistaken awards
- **Configuration management**: Import/export settings for backup and recovery
- **Multi-server sync control**: Admin-only sync group management

### Error Handling & Robustness
- **Permission checks**: Bot verifies channel permissions before attempting to send messages
- **Database resilience**: Graceful handling of database connection failures with retry logic
- **Discord API limits**: Automatic retry with exponential backoff for rate limit errors
- **Invalid user handling**: Slash commands prevent invalid user mentions automatically
- **Missing message handling**: Fallback behavior when referenced messages are deleted
- **Channel access validation**: Verify bot can access target channels before operations

### Voting System Security
- **Self-vote prevention**: Users cannot vote on their own point proposals
- **Duplicate vote protection**: One vote per user per proposal
- **Time-limited voting**: Configurable voting windows prevent late manipulation
- **Transparent voting**: All votes tracked and auditable
- **Threshold enforcement**: Points only applied when legitimate thresholds are met

### Data Protection & Privacy
- **Minimal data storage**: Only Discord user IDs and necessary operational data
- **Per-server isolation**: Data separated by server for privacy and security
- **Sync group integrity**: Multi-server data remains separated and reversible
- **Regular automated backups**: Database backup system for data recovery
- **Secure credential management**: Environment variables for sensitive configuration
- **GDPR compliance**: User data deletion capabilities upon request

---

## 📊 Success Metrics

- **Engagement**: Number of active participants in voting
- **Usage**: Commands used per day/week
- **Community**: Positive feedback from server members
- **Stability**: Uptime and error rates
- **Growth**: Adoption across multiple servers

---

## 🎉 Future Enhancements

1. **Seasonal Events**: Special scoring events or bonuses
2. **Achievement System**: Badges for milestones
3. **Custom Emoji Support**: Server-specific point reactions
4. **API Integration**: External services or webhooks
5. **Advanced Analytics**: Score trends and user insights

---

## 📝 Notes & Considerations

### Database & Performance
- **PostgreSQL from the start**: Recommended for expected high popularity and user volume
- **Critical indexing strategy**:
  ```sql
  -- Essential indexes for performance
  CREATE INDEX idx_scores_user_server ON scores(user_id, server_id);
  CREATE INDEX idx_score_history_user_server ON score_history(user_id, server_id);
  CREATE INDEX idx_score_history_created_at ON score_history(created_at DESC);
  CREATE INDEX idx_pending_votes_expires ON pending_votes(expires_at);
  CREATE INDEX idx_votes_pending_vote ON votes(pending_vote_id);
  CREATE INDEX idx_servers_sync_group ON servers(sync_group) WHERE sync_group IS NOT NULL;
  ```
- **Connection pooling**: Handled automatically by Supabase (built-in connection pooling)
- **Query optimization**: Use efficient aggregation for multi-server score calculations
- **Scaling**: Automatic scaling handled by Supabase managed service
- **Maintenance**: Automatic backups, updates, and optimization by Supabase

### Discord API Considerations
- **Rate limiting**: Implement proper rate limit handling, especially for reaction monitoring
- **Message caching**: Cache messages for reaction event handling and reply detection
- **Permission checks**: Verify bot permissions before attempting operations
- **Large server optimization**: Consider sharding for servers with 10k+ members
- **Webhook logging**: Use webhooks for audit logs to avoid rate limits

### Multi-Server Sync Complexities
- **Network partitioning**: Handle cases where some servers in sync group are offline
- **Data consistency**: Ensure score calculations remain accurate during sync operations
- **Conflict resolution**: Define behavior for edge cases (server leaves mid-vote, etc.)
- **Performance impact**: Score queries across multiple servers may be slower

### User Experience & Edge Cases
- **Time zones**: Not a concern due to short voting windows (couple hours max)
- **Offline handling**: Implement pending votes cleanup system for bot offline periods
  - Clean up expired votes on bot restart
  - Handle votes that expired during offline periods
  - Mark expired votes as 'expired' status in database
- **Message deletion**: Handle cases where voted-on messages are deleted
  - Retain the +1 log comment when possible (from reply/command context)
  - For reaction-based votes: Log raw message content as the reason/comment
  - Success/failed feedback will not have source message to reply to
- **User leaving servers**: Votes remain persistent when users leave - no change needed
- **Reaction removal**: Acts as vote retraction (user changing their mind)
  - If vote already passed and points awarded, retraction is ignored
  - If vote still pending, retraction reduces vote count
  - Track reaction add/remove events for accurate vote counting
- **Feedback spam prevention**: Rate limit feedback messages to prevent chat flooding
- **Feedback message cleanup**: Consider auto-deletion of feedback messages after time period
- **Channel permissions**: Ensure bot can send feedback messages in the target channel

### Security & Privacy
- **User privacy**: Store only Discord user IDs and operational data, no personal information
- **Data retention**: Implement configurable history retention policies
- **GDPR compliance**: Owner-only data deletion command for user data removal (not user self-service)
- **Admin abuse prevention**: Log all admin actions for accountability (required)

### Development & Deployment
- **Environment management**: Separate development, staging, and production configurations
- **Database migrations**: Plan schema evolution strategy for feature updates
- **Monitoring**: Implement health checks and error reporting
- **Backup strategy**: Automated backups with disaster recovery procedures
- **Virtual environment**: Use Node.js version management (nvm) per user preferences

---

## 🚦 Ready for Implementation?

This plan balances your core requirements with room for growth. The phased approach allows you to get a working MVP quickly while building toward the full multi-server vision.

**Next Steps:**
1. Review and approve this plan
2. Set up development environment
3. Begin Phase 1 implementation
4. Test with your server community

Let me know if you'd like to adjust any aspects of this plan!

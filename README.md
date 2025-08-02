# TrustFactor Discord Bot

A comprehensive Discord bot for managing trust scores, voting systems, and server synchronization across multiple Discord servers.

## 🚀 Features

### Core Functionality
- **Point System**: Award/deduct points to users with community voting
- **Voting System**: Configurable voting thresholds and timeouts
- **Reaction Voting**: Direct point awards via emoji reactions
- **Reply Voting**: Point awards through message replies
- **Auto Roles**: Automatic role assignment based on point thresholds
- **Server Sync**: Synchronize settings across multiple Discord servers

### Advanced Features
- **Comprehensive Logging**: Detailed logging system with configurable levels
- **Permission Management**: Role-based access control
- **Configuration Management**: Interactive configuration menus
- **Audit Logging**: Track all configuration changes and admin actions
- **Error Handling**: Robust error handling with fallback mechanisms

## 📋 Requirements

- Node.js 18+ 
- Discord.js 14+
- Supabase database
- Discord Bot Token

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/TrustFactor.git
   cd TrustFactor
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   # Discord Bot Configuration
   DISCORD_TOKEN=your_discord_bot_token_here
   CLIENT_ID=your_client_id_here
   
   # Supabase Database Configuration
   SUPABASE_URL=your_supabase_url_here
   SUPABASE_ANON_KEY=your_supabase_anon_key_here
   
   # Logging Configuration
   LOG_LEVEL=VERBOSE
   LOG_TO_FILE=false
   LOG_FILE_PATH=logs/trustfactor-bot.log
   MAX_LOG_FILE_SIZE=10485760
   ```

4. **Set up database**
   - Create a Supabase project
   - Run the database schema setup (see Database Setup section)

5. **Start the bot**
   ```bash
   npm start
   ```

## 🗄️ Database Setup

The bot requires a Supabase database with the following tables:

### Core Tables
- `servers` - Server configurations
- `users` - User point tracking
- `pending_votes` - Voting system
- `vote_records` - Vote history
- `point_history` - Point change history
- `custom_reactions` - Reaction-based voting
- `auto_role_thresholds` - Auto role configuration
- `sync_groups` - Server synchronization
- `sync_group_members` - Sync group membership

### Database Schema
See `database-schema.sql` for complete table definitions.

## 🤖 Bot Commands

### Core Commands
- `/award` - Award/deduct points with community voting
- `/score` - View user scores and leaderboards
- `/config` - Interactive server configuration
- `/sync` - Manage server synchronization

### Sync Commands
- `/sync request` - Create a sync group
- `/sync confirm` - Join a sync group
- `/sync leave` - Leave current sync group
- `/sync status` - View sync group status
- `/sync list-servers` - List group members
- `/sync set-priority` - Set priority server
- `/sync disband` - Delete sync group

## ⚙️ Configuration

### Logging System
The bot includes a comprehensive logging system with configurable levels:

```env
LOG_LEVEL=VERBOSE  # ERROR, WARN, INFO, DEBUG, VERBOSE
LOG_TO_FILE=false  # Enable file logging
LOG_FILE_PATH=logs/trustfactor-bot.log
MAX_LOG_FILE_SIZE=10485760  # 10MB
```

### Log Categories
- `logger.user()` - User interactions
- `logger.vote()` - Voting operations
- `logger.command()` - Command executions
- `logger.config()` - Configuration changes
- `logger.sync()` - Sync operations
- `logger.db()` - Database operations
- `logger.security()` - Security events

## 🔧 Development

### Project Structure
```
src/
├── commands/          # Slash command handlers
├── events/           # Discord event handlers
├── utils/            # Utility functions
├── config/           # Configuration files
└── index.js          # Main entry point
```

### Key Files
- `src/commands/config.js` - Configuration management
- `src/commands/sync.js` - Server synchronization
- `src/commands/award.js` - Point awarding system
- `src/utils/logger.js` - Logging system
- `src/utils/voting.js` - Voting logic
- `src/events/interactionCreate.js` - Interaction handling

### Error Handling
The bot includes comprehensive error handling:
- Interaction reply conflicts prevention
- Graceful fallback mechanisms
- Detailed error logging
- User-friendly error messages

## 📊 Features in Detail

### Voting System
- **Configurable Thresholds**: Fixed or formula-based voting requirements
- **Timeout Management**: Automatic vote expiration
- **Multiple Modes**: Button-based and reaction-based voting
- **Admin Override**: Testing mode for instant approvals

### Server Synchronization
- **Multi-Server Sync**: Share settings across servers
- **Priority Server**: Designate which server's settings take precedence
- **Automatic Propagation**: Changes sync to all group members
- **Conflict Resolution**: Handle settings conflicts gracefully

### Point System
- **Flexible Ranges**: Configurable point limits per award
- **Cooldown System**: Prevent spam voting
- **Daily Limits**: Optional daily point limits
- **History Tracking**: Complete audit trail of point changes

### Auto Roles
- **Threshold-Based**: Assign roles based on point thresholds
- **Multiple Roles**: Configure multiple auto roles
- **Testing Tools**: Test auto role assignments
- **Bulk Management**: Add/remove multiple roles

## 🚨 Troubleshooting

### Common Issues
1. **Interaction Errors**: Check for proper interaction state management
2. **Database Connection**: Verify Supabase credentials
3. **Permission Issues**: Ensure bot has required permissions
4. **Sync Conflicts**: Check priority server settings

### Debug Mode
Enable verbose logging for detailed debugging:
```env
LOG_LEVEL=VERBOSE
LOG_TO_FILE=true
```

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add comprehensive logging
5. Test thoroughly
6. Submit a pull request

## 📞 Support

For support and questions:
- Create an issue on GitHub
- Check the troubleshooting section
- Review the logging documentation

## 🔄 Recent Updates

### Latest Features
- ✅ Comprehensive logging system
- ✅ Enhanced error handling
- ✅ Interaction conflict prevention
- ✅ Verbose debugging capabilities
- ✅ Server synchronization improvements
- ✅ Auto role management
- ✅ Reaction-based voting
- ✅ Configuration management

---

**TrustFactor Bot** - Building trust through community-driven point systems across Discord servers. 
-- TrustFactor Bot Enhanced Database Schema
-- Combined and optimized schema for Supabase PostgreSQL

-- ================================
-- CORE TABLES
-- ================================

-- Servers table
-- IMPORTANT: Always pass Discord IDs as strings to Supabase to prevent JavaScript precision loss
CREATE TABLE IF NOT EXISTS servers (
    server_id BIGINT PRIMARY KEY, -- Discord snowflakes as BIGINT for performance
    threshold INTEGER DEFAULT 3 CHECK (threshold > 0),
    voting_timeout INTEGER DEFAULT 5 CHECK (voting_timeout > 0),
    reaction_mode BOOLEAN DEFAULT FALSE,
    sync_group VARCHAR(50),
    threshold_mode VARCHAR(10) DEFAULT 'fixed' CHECK (threshold_mode IN ('fixed', 'formula')),
    formula_base INTEGER DEFAULT 1 CHECK (formula_base >= 0),
    formula_multiplier NUMERIC(4,2) DEFAULT 1.0 CHECK (formula_multiplier >= 0),
    max_points_per_award INTEGER DEFAULT 10,
    min_points_per_award INTEGER DEFAULT -10,
    min_vote_magnitude INTEGER DEFAULT 1 CHECK (min_vote_magnitude > 0), -- Minimum absolute value for votes (excludes reactions)
    embed_color VARCHAR(7) DEFAULT '#5865F2',
    log_channel BIGINT, -- Discord channel ID as BIGINT
    success_feedback BOOLEAN DEFAULT TRUE,
    failed_feedback BOOLEAN DEFAULT FALSE,
    testing_mode BOOLEAN DEFAULT FALSE, -- Toggle for admin testing mode
    auto_approval BOOLEAN DEFAULT TRUE, -- Whether proposers automatically approve their own proposals
    -- Enhanced features
    daily_point_limit INTEGER DEFAULT NULL CHECK (daily_point_limit IS NULL OR daily_point_limit > 0),
    user_cooldown_minutes INTEGER DEFAULT 60 CHECK (user_cooldown_minutes >= 0),
    auto_role_thresholds JSONB DEFAULT '{}', -- JSON mapping score thresholds to role IDs
    leaderboard_roles JSONB DEFAULT '{}', -- JSON mapping leaderboard positions to role IDs (supports positive/negative configs and assignment strategies: server-local/global-filtered/global)
    timezone VARCHAR(50) DEFAULT 'UTC',
    is_active BOOLEAN DEFAULT TRUE, -- Soft delete capability
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Users table (enhanced with preferences)
CREATE TABLE IF NOT EXISTS users (
    user_id BIGINT PRIMARY KEY, -- Discord user ID as BIGINT
    global_opt_out BOOLEAN DEFAULT FALSE, -- User can opt out globally
    dm_notifications BOOLEAN DEFAULT TRUE, -- User preference for receiving DMs from bot
    preferred_timezone VARCHAR(50) DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User server preferences (NEW - quality of life)
CREATE TABLE IF NOT EXISTS user_server_preferences (
    user_id BIGINT NOT NULL, -- Discord user ID as BIGINT
    server_id BIGINT NOT NULL, -- Discord server ID as BIGINT
    opt_out BOOLEAN DEFAULT FALSE, -- Per-server opt-out
    nickname VARCHAR(32), -- Display name override
    notification_preferences JSONB DEFAULT '{"votes": true, "awards": true}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, server_id),
    FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
);

-- Scores table
CREATE TABLE IF NOT EXISTS scores (
    user_id BIGINT NOT NULL, -- Discord user ID as BIGINT
    server_id BIGINT NOT NULL, -- Discord server ID as BIGINT
    total_score INTEGER DEFAULT 0,
    monthly_score INTEGER DEFAULT 0, -- NEW - monthly leaderboard
    weekly_score INTEGER DEFAULT 0,  -- NEW - weekly leaderboard
    daily_score INTEGER DEFAULT 0,   -- NEW - daily tracking
    last_daily_reset DATE DEFAULT CURRENT_DATE,
    last_weekly_reset DATE DEFAULT CURRENT_DATE,
    last_monthly_reset DATE DEFAULT CURRENT_DATE,
    highest_score INTEGER DEFAULT 0, -- NEW - achievement tracking
    lowest_score INTEGER DEFAULT 0,  -- NEW - achievement tracking
    total_awards_given INTEGER DEFAULT 0, -- NEW - community participation
    total_awards_received INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, server_id),
    FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
);

-- Pending votes table
-- IMPORTANT: Always pass Discord IDs as strings to prevent JavaScript precision loss
CREATE TABLE IF NOT EXISTS pending_votes (
    id SERIAL PRIMARY KEY,
    message_id BIGINT NOT NULL,
    original_message_id BIGINT,
    channel_id BIGINT NOT NULL,
    proposer_id BIGINT NOT NULL,
    target_user_id BIGINT NOT NULL,
    server_id BIGINT NOT NULL,
    point_change INTEGER NOT NULL,
    reason TEXT,
    vote_method VARCHAR(20) NOT NULL CHECK (vote_method IN ('command', 'reply', 'reaction')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    required_votes INTEGER NOT NULL DEFAULT 3, -- NEW - dynamic threshold tracking
    approve_count INTEGER DEFAULT 0,
    reject_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
);

-- Individual votes table
CREATE TABLE IF NOT EXISTS votes (
    pending_vote_id INTEGER NOT NULL,
    voter_id BIGINT NOT NULL,
    vote_type VARCHAR(10) NOT NULL CHECK (vote_type IN ('approve', 'reject')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (pending_vote_id, voter_id),
    FOREIGN KEY (pending_vote_id) REFERENCES pending_votes(id) ON DELETE CASCADE
);

-- Score history table
CREATE TABLE IF NOT EXISTS score_history (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    server_id BIGINT NOT NULL,
    point_change INTEGER NOT NULL,
    reason TEXT,
    awarded_by BIGINT NOT NULL,
    vote_id INTEGER,
    message_id BIGINT, -- Discord message ID where the score change originated
    channel_id BIGINT, -- Discord channel ID where the score change occurred
    category VARCHAR(50) DEFAULT 'manual',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE,
    FOREIGN KEY (vote_id) REFERENCES pending_votes(id) ON DELETE SET NULL
);

-- Admin roles table
CREATE TABLE IF NOT EXISTS admin_roles (
    server_id BIGINT NOT NULL,
    role_id BIGINT NOT NULL,
    permissions JSONB DEFAULT '{"award": true, "config": true, "admin": true}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (server_id, role_id),
    FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
);

-- Custom reactions table
CREATE TABLE IF NOT EXISTS custom_reactions (
    server_id BIGINT NOT NULL,
    emoji VARCHAR(100) NOT NULL,
    point_value INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (server_id, emoji),
    FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
);

-- Blocked channels table (NEW - prevent reaction point awards in specific channels)
CREATE TABLE IF NOT EXISTS blocked_channels (
    server_id BIGINT NOT NULL,
    channel_id BIGINT NOT NULL,
    reason TEXT,
    blocked_by BIGINT NOT NULL, -- Discord user ID who blocked the channel
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (server_id, channel_id),
    FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
);

-- ================================
-- NEW QUALITY-OF-LIFE TABLES
-- ================================

-- Rate limiting table (NEW - prevent spam/abuse)
CREATE TABLE IF NOT EXISTS rate_limits (
    user_id BIGINT NOT NULL,
    server_id BIGINT NOT NULL,
    action_type VARCHAR(20) NOT NULL,
    last_action_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    action_count INTEGER DEFAULT 1,
    reset_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 hour'),
    PRIMARY KEY (user_id, server_id, action_type),
    FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
);

-- Server statistics
CREATE TABLE IF NOT EXISTS server_stats (
    server_id BIGINT NOT NULL,
    stat_date DATE NOT NULL,
    total_users INTEGER DEFAULT 0,
    active_users INTEGER DEFAULT 0,
    votes_cast INTEGER DEFAULT 0,
    points_awarded INTEGER DEFAULT 0,
    commands_used INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (server_id, stat_date),
    FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    server_id BIGINT NOT NULL,
    admin_id BIGINT NOT NULL,
    action VARCHAR(50) NOT NULL,
    target_user_id BIGINT,
    old_values JSONB,
    new_values JSONB,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
);

-- Achievements
CREATE TABLE IF NOT EXISTS achievements (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    icon VARCHAR(100), -- Emoji or icon identifier
    criteria JSONB NOT NULL, -- JSON criteria for earning the achievement
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User achievements
CREATE TABLE IF NOT EXISTS user_achievements (
    user_id BIGINT NOT NULL,
    server_id BIGINT NOT NULL,
    achievement_id INTEGER NOT NULL,
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    progress JSONB DEFAULT '{}', -- Progress tracking for multi-step achievements
    PRIMARY KEY (user_id, server_id, achievement_id),
    FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE,
    FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE
);

-- ================================
-- SYNC GROUP TABLES
-- ================================

-- Sync groups table to manage server synchronization
CREATE TABLE IF NOT EXISTS sync_groups (
    sync_code VARCHAR(8) PRIMARY KEY, -- Short alphanumeric code for joining
    group_name VARCHAR(100) NOT NULL,
    created_by_server BIGINT NOT NULL, -- Server that created the sync group
    priority_server BIGINT, -- Server whose settings take priority (can be NULL initially)
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by_server) REFERENCES servers(server_id) ON DELETE CASCADE,
    FOREIGN KEY (priority_server) REFERENCES servers(server_id) ON DELETE SET NULL
);

-- Sync group members table to track which servers are in each group
CREATE TABLE IF NOT EXISTS sync_group_members (
    sync_code VARCHAR(8) NOT NULL,
    server_id BIGINT NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (sync_code, server_id),
    FOREIGN KEY (sync_code) REFERENCES sync_groups(sync_code) ON DELETE CASCADE,
    FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
);

-- Server settings backup table to store original settings before sync
CREATE TABLE IF NOT EXISTS server_settings_backup (
    server_id BIGINT PRIMARY KEY,
    original_settings JSONB NOT NULL, -- Complete backup of server settings
    backed_up_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
);

-- Sync pending requests table for managing join requests
CREATE TABLE IF NOT EXISTS sync_pending_requests (
    id SERIAL PRIMARY KEY,
    sync_code VARCHAR(8) NOT NULL,
    requesting_server BIGINT NOT NULL,
    requested_by_user BIGINT NOT NULL, -- Discord user who initiated the request
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sync_code) REFERENCES sync_groups(sync_code) ON DELETE CASCADE,
    FOREIGN KEY (requesting_server) REFERENCES servers(server_id) ON DELETE CASCADE
);

-- ================================
-- INDEXES FOR PERFORMANCE
-- ================================

CREATE INDEX IF NOT EXISTS idx_scores_server_total ON scores(server_id, total_score DESC);
CREATE INDEX IF NOT EXISTS idx_pending_votes_status ON pending_votes(status);
CREATE INDEX IF NOT EXISTS idx_pending_votes_expires ON pending_votes(expires_at);
CREATE INDEX IF NOT EXISTS idx_score_history_user_server ON score_history(user_id, server_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_votes_pending_vote ON votes(pending_vote_id);

CREATE INDEX IF NOT EXISTS idx_scores_monthly ON scores(server_id, monthly_score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_weekly ON scores(server_id, weekly_score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_daily ON scores(server_id, daily_score DESC);
CREATE INDEX IF NOT EXISTS idx_user_server_prefs_lookup ON user_server_preferences(user_id, server_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_action ON rate_limits(user_id, action_type, reset_at);
CREATE INDEX IF NOT EXISTS idx_server_stats_date ON server_stats(server_id, stat_date DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_server_date ON audit_log(server_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_score_history_category ON score_history(server_id, category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_score_history_message_id ON score_history(message_id);
CREATE INDEX IF NOT EXISTS idx_score_history_channel_id ON score_history(channel_id);

-- Sync group indexes
CREATE INDEX IF NOT EXISTS idx_sync_groups_created_by ON sync_groups(created_by_server);
CREATE INDEX IF NOT EXISTS idx_sync_groups_priority ON sync_groups(priority_server);
CREATE INDEX IF NOT EXISTS idx_sync_group_members_server ON sync_group_members(server_id);
CREATE INDEX IF NOT EXISTS idx_sync_pending_requests_server ON sync_pending_requests(requesting_server);
CREATE INDEX IF NOT EXISTS idx_sync_pending_requests_status ON sync_pending_requests(status, expires_at);

-- ================================
-- PERFORMANCE: FOREIGN KEY INDEXES
-- ================================
-- These indexes improve JOIN performance and address Supabase performance suggestions

-- Foreign key indexes for better JOIN performance
CREATE INDEX IF NOT EXISTS idx_pending_votes_server_id ON pending_votes(server_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_server_id ON rate_limits(server_id);
CREATE INDEX IF NOT EXISTS idx_score_history_vote_id ON score_history(vote_id);
CREATE INDEX IF NOT EXISTS idx_sync_pending_requests_sync_code ON sync_pending_requests(sync_code);
CREATE INDEX IF NOT EXISTS idx_user_achievements_achievement_id ON user_achievements(achievement_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_server_id ON user_achievements(server_id);
CREATE INDEX IF NOT EXISTS idx_user_server_preferences_server_id ON user_server_preferences(server_id);
CREATE INDEX IF NOT EXISTS idx_blocked_channels_server_id ON blocked_channels(server_id);

-- ================================
-- CONSTRAINTS AND CHECKS
-- ================================

ALTER TABLE pending_votes ADD CONSTRAINT chk_point_change_not_zero CHECK (point_change != 0);
ALTER TABLE score_history ADD CONSTRAINT chk_point_change_not_zero CHECK (point_change != 0);

ALTER TABLE servers ADD CONSTRAINT chk_valid_embed_color CHECK (embed_color ~ '^#[0-9A-Fa-f]{6}$');
ALTER TABLE user_server_preferences ADD CONSTRAINT chk_valid_nickname_length CHECK (char_length(nickname) >= 1);
ALTER TABLE rate_limits ADD CONSTRAINT chk_positive_action_count CHECK (action_count > 0);

-- ================================
-- TRIGGERS FOR AUTO-UPDATES
-- ================================

-- Function to update timestamps (SECURITY: search_path protected)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

-- Apply auto-update triggers
CREATE TRIGGER update_servers_updated_at BEFORE UPDATE ON servers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_server_preferences_updated_at BEFORE UPDATE ON user_server_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scores_updated_at BEFORE UPDATE ON scores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pending_votes_updated_at BEFORE UPDATE ON pending_votes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_custom_reactions_updated_at BEFORE UPDATE ON custom_reactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sync_groups_updated_at BEFORE UPDATE ON sync_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================
-- INITIAL DATA SETUP
-- ================================

-- Insert default achievements
INSERT INTO achievements (name, description, icon, criteria) VALUES
('First Vote', 'Cast your first vote on a proposal', '🗳️', '{"votes_cast": 1}'),
('Community Helper', 'Award points to 10 different users', '🤝', '{"users_awarded": 10}'),
('Top Scorer', 'Reach 100 points in a server', '🏆', '{"total_score": 100}'),
('Veteran', 'Be active for 30 days', '🎖️', '{"days_active": 30}'),
('Generous', 'Give out 500 total points', '💝', '{"points_given": 500}')
ON CONFLICT (name) DO NOTHING;

-- ================================
-- COMMENTS FOR DOCUMENTATION
-- ================================

COMMENT ON TABLE servers IS 'Per-server configuration and settings with enhanced features';
COMMENT ON TABLE users IS 'Global user data and preferences';
COMMENT ON TABLE user_server_preferences IS 'Per-server user preferences and settings';
COMMENT ON TABLE scores IS 'User scores per server with time-based tracking';
COMMENT ON TABLE pending_votes IS 'Active voting proposals with enhanced tracking';
COMMENT ON TABLE votes IS 'Individual votes on proposals';
COMMENT ON TABLE score_history IS 'Complete history of score changes with metadata';
COMMENT ON TABLE admin_roles IS 'Server-specific admin roles with granular permissions';
COMMENT ON TABLE custom_reactions IS 'Server-specific reaction point values';
COMMENT ON TABLE blocked_channels IS 'Channels where reaction point awards are disabled';
COMMENT ON TABLE rate_limits IS 'Rate limiting to prevent spam and abuse';
COMMENT ON TABLE server_stats IS 'Daily server statistics for analytics';
COMMENT ON TABLE audit_log IS 'Audit trail for admin actions';
COMMENT ON TABLE achievements IS 'Available achievements for gamification';
COMMENT ON TABLE user_achievements IS 'User-earned achievements per server';
COMMENT ON TABLE sync_groups IS 'Sync groups for multi-server coordination with priority management';
COMMENT ON TABLE sync_group_members IS 'Servers that are members of sync groups';
COMMENT ON TABLE server_settings_backup IS 'Backup of original server settings before joining sync';
COMMENT ON TABLE sync_pending_requests IS 'Pending requests to join sync groups';

-- ================================
-- SYNC FUNCTIONS
-- ================================

-- Function to generate unique sync codes (SECURITY: search_path protected)
CREATE OR REPLACE FUNCTION public.generate_sync_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    sync_code TEXT;
    code_exists BOOLEAN;
BEGIN
    -- Generate random 8-character alphanumeric code
    LOOP
        sync_code := upper(substring(md5(random()::text) from 1 for 8));
        
        -- Check if code already exists
        SELECT EXISTS(
            SELECT 1 FROM public.sync_groups 
            WHERE sync_code = generate_sync_code.sync_code
        ) INTO code_exists;
        
        -- Exit loop if code is unique
        EXIT WHEN NOT code_exists;
    END LOOP;
    
    RETURN sync_code;
END;
$$;

-- Function to backup server settings (SECURITY: search_path protected)
CREATE OR REPLACE FUNCTION public.backup_server_settings(target_server_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    settings_json JSONB;
BEGIN
    -- Get current server settings
    SELECT to_jsonb(s) - 'server_id' - 'created_at' - 'updated_at' - 'sync_group'
    INTO settings_json
    FROM public.servers s
    WHERE s.server_id = target_server_id::bigint;
    
    IF settings_json IS NULL THEN
        RAISE EXCEPTION 'Server % not found', target_server_id;
    END IF;
    
    -- Insert or update backup (upsert)
    INSERT INTO public.server_settings_backup (server_id, original_settings)
    VALUES (target_server_id::bigint, settings_json)
    ON CONFLICT (server_id) 
    DO UPDATE SET 
        original_settings = EXCLUDED.original_settings,
        backed_up_at = CURRENT_TIMESTAMP;
END;
$$;

-- Function to apply priority server settings to all group members (SECURITY: search_path protected)
CREATE OR REPLACE FUNCTION public.apply_priority_settings(
    group_code TEXT,
    exclude_server TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    priority_server_id TEXT;
    priority_settings JSONB;
    member_record RECORD;
BEGIN
    -- Get the priority server and its settings
    SELECT sg.priority_server::text INTO priority_server_id
    FROM public.sync_groups sg
    WHERE sg.sync_code = group_code AND sg.is_active = true;
    
    IF priority_server_id IS NULL THEN
        RAISE NOTICE 'No priority server found for sync group %', group_code;
        RETURN;
    END IF;
    
    -- Get priority server settings
    SELECT to_jsonb(s) - 'server_id' - 'created_at' - 'updated_at' - 'sync_group'
    INTO priority_settings
    FROM public.servers s
    WHERE s.server_id = priority_server_id::bigint;
    
    IF priority_settings IS NULL THEN
        RAISE NOTICE 'Priority server % settings not found', priority_server_id;
        RETURN;
    END IF;
    
    -- Apply settings to all group members except excluded server
    FOR member_record IN 
        SELECT sgm.server_id::text as server_id_text
        FROM public.sync_group_members sgm
        WHERE sgm.sync_code = group_code 
        AND sgm.is_active = true 
        AND (exclude_server IS NULL OR sgm.server_id::text != exclude_server)
    LOOP
        UPDATE public.servers SET
            threshold = (priority_settings->>'threshold')::integer,
            voting_timeout = (priority_settings->>'voting_timeout')::integer,
            testing_mode = (priority_settings->>'testing_mode')::boolean,
            auto_approval = (priority_settings->>'auto_approval')::boolean,
            daily_point_limit = CASE 
                WHEN priority_settings->>'daily_point_limit' = 'null' THEN NULL 
                ELSE (priority_settings->>'daily_point_limit')::integer 
            END,
            user_cooldown_minutes = (priority_settings->>'user_cooldown_minutes')::integer,
            auto_role_thresholds = (priority_settings->>'auto_role_thresholds')::jsonb,
            timezone = priority_settings->>'timezone',
            embed_color = priority_settings->>'embed_color',
            min_vote_magnitude = (priority_settings->>'min_vote_magnitude')::integer,
            max_points_per_award = (priority_settings->>'max_points_per_award')::integer,
            min_points_per_award = (priority_settings->>'min_points_per_award')::integer,
            reaction_mode = (priority_settings->>'reaction_mode')::boolean,
            threshold_mode = priority_settings->>'threshold_mode',
            formula_base = (priority_settings->>'formula_base')::integer,
            formula_multiplier = (priority_settings->>'formula_multiplier')::numeric,
            success_feedback = (priority_settings->>'success_feedback')::boolean,
            failed_feedback = (priority_settings->>'failed_feedback')::boolean
        WHERE server_id = member_record.server_id_text::bigint;
    END LOOP;
END;
$$;

-- Function to restore original server settings from backup (SECURITY: search_path protected)
CREATE OR REPLACE FUNCTION public.restore_server_settings(target_server_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    backup_settings JSONB;
BEGIN
    -- Get the backed up settings
    SELECT original_settings INTO backup_settings
    FROM public.server_settings_backup
    WHERE server_id = target_server_id::bigint;
    
    IF backup_settings IS NULL THEN
        RAISE NOTICE 'No backup settings found for server %, keeping current settings', target_server_id;
        RETURN;
    END IF;
    
    -- Restore the original settings
    UPDATE public.servers SET
        threshold = (backup_settings->>'threshold')::integer,
        voting_timeout = (backup_settings->>'voting_timeout')::integer,
        testing_mode = (backup_settings->>'testing_mode')::boolean,
        auto_approval = (backup_settings->>'auto_approval')::boolean,
        daily_point_limit = CASE 
            WHEN backup_settings->>'daily_point_limit' = 'null' THEN NULL 
            ELSE (backup_settings->>'daily_point_limit')::integer 
        END,
        user_cooldown_minutes = (backup_settings->>'user_cooldown_minutes')::integer,
        auto_role_thresholds = (backup_settings->>'auto_role_thresholds')::jsonb,
        timezone = backup_settings->>'timezone',
        embed_color = backup_settings->>'embed_color',
        min_vote_magnitude = COALESCE((backup_settings->>'min_vote_magnitude')::integer, 1),
        max_points_per_award = COALESCE((backup_settings->>'max_points_per_award')::integer, 10),
        min_points_per_award = COALESCE((backup_settings->>'min_points_per_award')::integer, -10),
        reaction_mode = COALESCE((backup_settings->>'reaction_mode')::boolean, false),
        threshold_mode = COALESCE(backup_settings->>'threshold_mode', 'fixed'),
        formula_base = COALESCE((backup_settings->>'formula_base')::integer, 1),
        formula_multiplier = COALESCE((backup_settings->>'formula_multiplier')::numeric, 1.0),
        success_feedback = COALESCE((backup_settings->>'success_feedback')::boolean, true),
        failed_feedback = COALESCE((backup_settings->>'failed_feedback')::boolean, false)
    WHERE server_id = target_server_id::bigint;
    
    -- Remove the backup after restoration
    DELETE FROM public.server_settings_backup WHERE server_id = target_server_id::bigint;
END;
$$;

-- ================================
-- SCHEMA VERSION TRACKING
-- ================================

CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ================================
-- SECURITY: ROW LEVEL SECURITY (RLS)
-- ================================

-- Helper function to check if the current role is the service role
CREATE OR REPLACE FUNCTION public.is_service_role() 
RETURNS BOOLEAN 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Check if current role is the service role or postgres superuser
    RETURN current_user IN ('service_role', 'postgres') 
        OR current_setting('role', true) IN ('service_role', 'postgres');
END;
$$;

-- Enable RLS on all tables
ALTER TABLE servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_server_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE server_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE server_settings_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_pending_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_version ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for service role access
CREATE POLICY "Service role full access on servers" ON servers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on users" ON users FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on user_server_preferences" ON user_server_preferences FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on scores" ON scores FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on pending_votes" ON pending_votes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on votes" ON votes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on score_history" ON score_history FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on admin_roles" ON admin_roles FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on custom_reactions" ON custom_reactions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on blocked_channels" ON blocked_channels FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on rate_limits" ON rate_limits FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on server_stats" ON server_stats FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on audit_log" ON audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on achievements" ON achievements FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on user_achievements" ON user_achievements FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on sync_groups" ON sync_groups FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on sync_group_members" ON sync_group_members FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on server_settings_backup" ON server_settings_backup FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on sync_pending_requests" ON sync_pending_requests FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on schema_version" ON schema_version FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Deny all other access using helper function
CREATE POLICY "Deny all other access to servers" ON servers FOR ALL USING (public.is_service_role());
CREATE POLICY "Deny all other access to users" ON users FOR ALL USING (public.is_service_role());
CREATE POLICY "Deny all other access to user_server_preferences" ON user_server_preferences FOR ALL USING (public.is_service_role());
CREATE POLICY "Deny all other access to scores" ON scores FOR ALL USING (public.is_service_role());
CREATE POLICY "Deny all other access to pending_votes" ON pending_votes FOR ALL USING (public.is_service_role());
CREATE POLICY "Deny all other access to votes" ON votes FOR ALL USING (public.is_service_role());
CREATE POLICY "Deny all other access to score_history" ON score_history FOR ALL USING (public.is_service_role());
CREATE POLICY "Deny all other access to admin_roles" ON admin_roles FOR ALL USING (public.is_service_role());
CREATE POLICY "Deny all other access to custom_reactions" ON custom_reactions FOR ALL USING (public.is_service_role());
CREATE POLICY "Deny all other access to blocked_channels" ON blocked_channels FOR ALL USING (public.is_service_role());
CREATE POLICY "Deny all other access to rate_limits" ON rate_limits FOR ALL USING (public.is_service_role());
CREATE POLICY "Deny all other access to server_stats" ON server_stats FOR ALL USING (public.is_service_role());
CREATE POLICY "Deny all other access to audit_log" ON audit_log FOR ALL USING (public.is_service_role());
CREATE POLICY "Deny all other access to achievements" ON achievements FOR ALL USING (public.is_service_role());
CREATE POLICY "Deny all other access to user_achievements" ON user_achievements FOR ALL USING (public.is_service_role());
CREATE POLICY "Deny all other access to sync_groups" ON sync_groups FOR ALL USING (public.is_service_role());
CREATE POLICY "Deny all other access to sync_group_members" ON sync_group_members FOR ALL USING (public.is_service_role());
CREATE POLICY "Deny all other access to server_settings_backup" ON server_settings_backup FOR ALL USING (public.is_service_role());
CREATE POLICY "Deny all other access to sync_pending_requests" ON sync_pending_requests FOR ALL USING (public.is_service_role());
CREATE POLICY "Deny all other access to schema_version" ON schema_version FOR ALL USING (public.is_service_role());

-- ================================
-- FUNCTION PERMISSIONS
-- ================================

-- Grant execute permissions to service role
GRANT EXECUTE ON FUNCTION public.generate_sync_code() TO service_role;
GRANT EXECUTE ON FUNCTION public.backup_server_settings(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_priority_settings(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_server_settings(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_service_role() TO service_role;

-- Revoke execute from public for security
REVOKE EXECUTE ON FUNCTION public.generate_sync_code() FROM public;
REVOKE EXECUTE ON FUNCTION public.backup_server_settings(TEXT) FROM public;
REVOKE EXECUTE ON FUNCTION public.apply_priority_settings(TEXT, TEXT) FROM public;
REVOKE EXECUTE ON FUNCTION public.restore_server_settings(TEXT) FROM public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM public;
REVOKE EXECUTE ON FUNCTION public.is_service_role() FROM public;

-- ================================
-- SCHEMA VERSION TRACKING
-- ================================

INSERT INTO schema_version (version, description) VALUES 
(1, 'Initial schema'),
(2, 'Server sync groups with priority management'),
(3, 'Sync functions for apply_priority_settings and restore_server_settings'),
(4, 'Function security fix: search_path protection and missing function implementations'),
(5, 'Row Level Security (RLS) implementation for all tables'),
(6, 'Complete security implementation with RLS and function protection'),
(7, 'Performance optimization: foreign key indexes for improved JOIN performance'),
(8, 'Blocked channels feature: prevent reaction point awards in specific channels')
ON CONFLICT (version) DO UPDATE SET 
    description = EXCLUDED.description,
    applied_at = CURRENT_TIMESTAMP;

-- ================================
-- SECURITY DOCUMENTATION
-- ================================

COMMENT ON FUNCTION public.generate_sync_code() IS 'Generates unique 8-character sync codes for server groups. SECURITY: search_path protected.';
COMMENT ON FUNCTION public.backup_server_settings(TEXT) IS 'Backs up server settings before joining sync group. SECURITY: search_path protected.';
COMMENT ON FUNCTION public.apply_priority_settings(TEXT, TEXT) IS 'Applies priority server settings to all group members. SECURITY: search_path protected.';
COMMENT ON FUNCTION public.restore_server_settings(TEXT) IS 'Restores server settings from backup. SECURITY: search_path protected.';
COMMENT ON FUNCTION public.update_updated_at_column() IS 'Trigger function to update timestamps. SECURITY: search_path protected.';
COMMENT ON FUNCTION public.is_service_role() IS 'Helper function to identify service role for RLS policies. Only the service role (bot) should access data.';

-- ================================
-- PERFORMANCE DOCUMENTATION
-- ================================

COMMENT ON INDEX idx_pending_votes_server_id IS 'PERFORMANCE: Improves JOIN performance between pending_votes and servers tables';
COMMENT ON INDEX idx_rate_limits_server_id IS 'PERFORMANCE: Improves JOIN performance between rate_limits and servers tables';
COMMENT ON INDEX idx_score_history_vote_id IS 'PERFORMANCE: Improves JOIN performance between score_history and pending_votes tables';
COMMENT ON INDEX idx_sync_pending_requests_sync_code IS 'PERFORMANCE: Improves JOIN performance between sync_pending_requests and sync_groups tables';
COMMENT ON INDEX idx_user_achievements_achievement_id IS 'PERFORMANCE: Improves JOIN performance between user_achievements and achievements tables';
COMMENT ON INDEX idx_user_achievements_server_id IS 'PERFORMANCE: Improves JOIN performance between user_achievements and servers tables';
COMMENT ON INDEX idx_user_server_preferences_server_id IS 'PERFORMANCE: Improves JOIN performance between user_server_preferences and servers tables';

-- ================================
-- LEADERBOARD RPCs (Performance)
-- ================================

CREATE OR REPLACE FUNCTION public.get_server_leaderboard(target_server_id TEXT, limit_count INTEGER)
RETURNS TABLE (
  user_id TEXT,
  total_score INTEGER,
  updated_at TIMESTAMPTZ
) LANGUAGE sql STABLE AS $$
  SELECT user_id::text, total_score, updated_at
  FROM scores
  WHERE server_id::text = target_server_id
  ORDER BY total_score DESC
  LIMIT COALESCE(limit_count, 10)
$$;

CREATE OR REPLACE FUNCTION public.get_group_leaderboard(group_server_ids TEXT[], limit_count INTEGER)
RETURNS TABLE (
  user_id TEXT,
  total_score BIGINT,
  updated_at TIMESTAMPTZ
) LANGUAGE sql STABLE AS $$
  WITH s AS (
    SELECT user_id, total_score, updated_at
    FROM scores
    WHERE server_id::text = ANY(group_server_ids)
  )
  SELECT user_id::text,
         SUM(total_score) AS total_score,
         MAX(updated_at) AS updated_at
  FROM s
  GROUP BY user_id
  ORDER BY SUM(total_score) DESC
  LIMIT COALESCE(limit_count, 10)
$$;

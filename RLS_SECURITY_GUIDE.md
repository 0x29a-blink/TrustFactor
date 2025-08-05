# 🔒 Row Level Security (RLS) Implementation Guide

## Overview

This guide addresses the Supabase security warnings about missing Row Level Security (RLS) on database tables. RLS is critical for protecting your TrustFactor bot data from unauthorized access.

## ⚠️ Security Issues Identified

Supabase detected that **19 tables** lack RLS protection:
- `servers`, `users`, `scores`, `score_history`
- `pending_votes`, `votes`, `admin_roles`, `custom_reactions`
- `server_stats`, `audit_log`, `user_achievements`, `achievements`
- `user_server_preferences`, `rate_limits`, `sync_groups`
- `sync_group_members`, `sync_pending_requests`
- `server_settings_backup`, `schema_version`

**Risk**: Without RLS, anyone with database access could potentially read, modify, or delete your bot's data.

## 🛡️ Solution Implemented

### RLS Strategy
- **Enable RLS** on all public tables
- **Service Role Only Access** - Only the bot's service role can access data
- **Deny All Others** - All other users/roles are blocked
- **Comprehensive Coverage** - Every table is protected

### Security Model
```sql
-- Pattern for each table:
1. ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;
2. CREATE POLICY "Service role access" FOR ALL TO service_role USING (true);
3. CREATE POLICY "Deny others" FOR ALL USING (is_service_role());
```

## 🚀 How to Apply the Fix

### Option 1: Automated Script (Recommended)
```bash
# Run the migration script
node src/migrations/apply_rls.js
```

### Option 2: Manual Application
1. Open Supabase SQL Editor
2. Copy contents of `src/migrations/enable_rls.sql`
3. Execute the SQL script
4. Verify RLS is enabled on all tables

### Option 3: Supabase CLI
```bash
# If you have Supabase CLI configured
supabase db reset --linked
# Then run your migrations
```

## 🧪 Testing & Verification

### 1. Check RLS Status
Run this query in Supabase SQL Editor:
```sql
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled,
    relforcerowsecurity as rls_forced
FROM pg_tables 
JOIN pg_class ON pg_class.relname = pg_tables.tablename 
WHERE schemaname = 'public' 
ORDER BY tablename;
```

### 2. Verify Bot Functionality
Test these bot commands after applying RLS:
- `/config` - Should work normally
- `/award @user 5 test` - Should create votes/scores
- `/score @user` - Should display user scores
- `/leaderboard` - Should show rankings

### 3. Check Security Linter
- Return to Supabase Dashboard
- Run the database linter again
- Confirm all RLS warnings are resolved

## 🔧 Troubleshooting

### Common Issues

#### "Permission Denied" Errors
**Cause**: Service role lacks sufficient permissions
**Solution**: 
1. Check your Supabase service role key
2. Ensure it has `service_role` permissions
3. Verify connection string in `src/config/database.js`

#### "Policy Already Exists" Errors
**Cause**: RLS policies were partially applied before
**Solution**:
1. Drop existing policies manually, or
2. Use `CREATE POLICY IF NOT EXISTS` syntax

#### Bot Commands Fail After RLS
**Cause**: Bot may be using anon key instead of service key
**Solution**:
1. Verify `SUPABASE_SERVICE_KEY` in environment variables
2. Check `src/config/database.js` uses service key
3. Restart the bot application

### Manual Policy Creation
If automated script fails, create policies manually:

```sql
-- Example for servers table
ALTER TABLE servers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on servers"
    ON servers FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Deny all other access to servers"
    ON servers FOR ALL
    USING (current_user = 'service_role');
```

## 📊 Impact Assessment

### Security Improvements
- ✅ **Data Protection**: Unauthorized access blocked
- ✅ **API Security**: PostgREST endpoints protected
- ✅ **Compliance**: Follows Supabase security best practices
- ✅ **Audit Trail**: RLS events logged

### Performance Impact
- **Minimal**: RLS adds microseconds per query
- **Negligible**: For bot use case, performance impact is insignificant
- **Cacheable**: Policies are cached by PostgreSQL

### Functionality Impact
- **No Changes**: Bot commands work exactly the same
- **Same API**: No code changes required in bot application
- **Transparent**: Users won't notice any difference

## 🔍 What Each Policy Does

| Table | Protection | Purpose |
|-------|------------|---------|
| `servers` | Server configs only accessible by bot | Prevent config tampering |
| `users` | User data only readable by bot | Protect user privacy |
| `scores`/`score_history` | Point data only modifiable by bot | Prevent score manipulation |
| `votes`/`pending_votes` | Voting only manageable by bot | Prevent vote rigging |
| `admin_roles` | Admin configs only changeable by bot | Prevent privilege escalation |
| `custom_reactions` | Emoji configs only editable by bot | Prevent reaction abuse |
| `audit_log` | Logs only writable by bot | Maintain audit integrity |

## 📚 Additional Resources

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL RLS Guide](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Database Security Best Practices](https://supabase.com/docs/guides/database/database-linter)

## 🆘 Support

If you encounter issues applying RLS:

1. **Check Bot Logs**: Look for database connection errors
2. **Verify Environment**: Ensure `SUPABASE_SERVICE_KEY` is correct
3. **Test Manually**: Apply one policy at a time to isolate issues
4. **Supabase Support**: Contact Supabase if you suspect platform issues

## ✅ Completion Checklist

- [ ] Applied RLS migration script
- [ ] Verified all 19 tables have RLS enabled
- [ ] Tested bot functionality works normally
- [ ] Confirmed Supabase security linter shows no RLS warnings
- [ ] Documented any custom policies or modifications
- [ ] Updated deployment documentation with RLS information

---

**Security Note**: This RLS implementation follows the principle of least privilege - only the bot service role can access data, providing maximum security for your Discord bot's database.
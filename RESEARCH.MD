## TrustFactor Bot — Codebase Review and Refactor Plan

This document captures an in‑depth review of the current codebase (Discord.js 14.14.1, Supabase) with prioritized, actionable recommendations across correctness, performance, architecture, DX, and future features. The goal is to retain current bot features while improving maintainability and reliability.

### Legend
- Priority: [P0] must-fix bugs or prod blockers, [P1] high-value fixes, [P2] polish.
- Effort: S (hours), M (1–3 days), L (multi-day/epic).

---

### Completed

- Client boot: added `GatewayIntentBits.GuildMembers` and partials (`Message`, `Channel`, `Reaction`, `User`, `GuildMember`). Files: `src/index.js`.
- Permissions: switched to `PermissionFlagsBits` and removed duplicate `getPermissionLevel`. Files: `src/utils/permissions.js`.
- Award command logging: fixed use of numeric value from `getUserScore`. Files: `src/commands/award.js`.
- Supabase configuration: switched to `SUPABASE_SERVICE_ROLE` and added profile-based env resolution; updated test connection to `select('*', { count: 'exact', head: true })`. Files: `src/config/database.js`, `src/index.js`, `src/utils/deploy-commands.js`.
- Unicode custom reactions: support for Unicode (`reaction.emoji.name`) and custom (`reaction.emoji.toString()`). Files: `src/events/messageReactionAdd.js`.
- Vote counting: optimized to head/count queries to avoid row scans. Files: `src/utils/database.js`.
- Removed unused `DATABASE_URL` validation. Files: `src/config/database.js`.
- Decision: keep ephemeral responses via `flags: MessageFlags.Ephemeral` (no migration to `ephemeral: true`).

### 1) Correctness and Reliability

- [PARTIAL | P1 | S] Consistent Snowflake handling (Strings)
  - Fixed in `admin.clear-history` (`user_id`/`server_id` to strings). Remaining audit recommended.
  - Files: `src/commands/admin.js` (done). Others: review pending.

- [P1 | S] User display properties are inconsistent
  - `User` doesn’t have `displayName`. Prefer `member.displayName` (if available) else fallback to `user.globalName || user.username`.
  - Files: `src/utils/voting.js`, `src/commands/award.js`, others.

---

### 2) Performance and Scalability

- [P1 | M] Aggregate leaderboard in SQL instead of in JS
  - `DatabaseUtils.getLeaderboard` currently fetches raw rows across all group servers and sums in Node. Replace with a server‑side aggregation query: `select user_id::text, sum(total_score) as total_score, max(updated_at) as updated_at from scores where server_id in (...) group by user_id order by total_score desc limit ...`.
  - Benefit: lower data transfer, faster results, less memory pressure.

- [P2 | M] Role assignment batching and rate-limit safety
  - `assignLeaderboardRoles` fetches members/roles in loops. Use concurrency limiting (`p-limit`), avoid repetitive fetches, and prefer cache when possible. Add jitter and structured retries.
  - Reduce console noise and switch to central `logger`; guard logs behind level.

- [P2 | S] Message fetch and cache strategy
  - For startup resuming of pending votes, handle large batches cautiously (backoff between fetches) and early‑exit when channels/messages are missing.

---

### 3) Architecture and Refactoring

- [P1 | M] Split `src/commands/config.js` into modules
  - This file is massive and mixes view rendering, routing, and persistence. Suggested structure:
    - `config/menus/` (main, voting, points, appearance, advanced, auto-roles, reactions, leaderboard-roles, blocked-channels)
    - `config/modals/` (all modal handlers)
    - `config/router.js` (routes `customId` to handlers)
    - Use a shared UI component library for embeds/rows to standardize look.

- [P1 | S] Deduplicate sync handler definitions
  - `src/events/syncHandler.js` duplicates `src/utils/syncHandler.js`. Keep one source of truth (utils), delete the event copy, and ensure imports reference the util.

- [P1 | S] Centralize Discord ID handling helpers
  - Provide helpers `toIdString(value)` and `selectSnowflakeAsText(column)` to standardize conversions and reduce copy/paste.

- [P2 | S] Standardize logging
  - Replace `console.log` usage (notably in `assignLeaderboardRoles`) with `logger`. Add structured fields for context.

- [P2 | M] Extract score/leaderboard presentation utilities
  - The embed generation for score/leaderboard is verbose. Extract into helpers to reduce duplication and improve testability.

---

### 4) Database and Migrations

- [P0 | M] Fix migrations pipeline
  - `src/utils/runMigrations.js` expects an RPC `exec_sql` that doesn’t exist; scripts in `package.json` reference many non‑existent files (e.g., `src/migrations/migrate.js`, `apply_rls.js`).
  - Options:
    1) Remove broken scripts and rely on versioned SQL applied via Supabase migrations (recommended). Track schema version in `schema_version` and apply changes via the Supabase CLI.
    2) Implement a secure `exec_sql` Postgres function (SECURITY DEFINER + search_path protection) to run safe statements. High risk; avoid in production.

- [P1 | S] Align RLS policies with runtime key
  - If you switch to `service_role`, current strict RLS is fine. If you must use anon, add tailored RLS policies for bot operations.

- [P1 | S] Ensure all Snowflake comparisons use strings
  - Audit all `.eq(...)`, `.in(...)`, and `.upsert(...)` to cast Snowflakes to strings on the client side, matching the BIGINT columns.

---

### 5) Voting System UX and Consistency

- [P1 | S] Reaction voting UX when not editing bot-owned messages
  - `updateVoteEmbedForReaction` skips editing when message isn’t bot-authored. Provide a separate progress message in the thread or channel to keep voters updated.

- [P1 | S] Reply‑based votes: consistently use `original_message_id`
  - Audit all places where reply-based votes are created/approved to ensure the correct traceback ID is used for history linking.

- [P2 | S] DM feedback opt‑in consistency
  - All feedback paths check preferences; ensure no direct DM calls bypass `DatabaseUtils.getUserDMPreference`.

---

### 6) Discord.js v14 API Hygiene

- [P1 | S] Use `PermissionFlagsBits` in permission checks and imports.
- [P1 | S] Standardize on `user.globalName || user.username` for Users, and `member.displayName` for Members.
  - Progress: updated in `award`, `messageReactionAdd`, `messageCreate`, `leaderboard`, and `voting` logs.

---

### 7) Dead Code, Broken Scripts, and Cleanup

- [P1 | S] Remove/repair NPM scripts in `package.json`
  - These scripts reference missing files: `migrate`, `security:*`, `performance:*`, and `database:verify-all`. Replace with Supabase CLI-based workflows or add the missing files.

- [DONE | P1 | S] Remove duplicate `syncHandler` file under `src/events/` and any unused utilities.
  - Replaced contents with a thin re-export to `src/utils/syncHandler.js` to avoid breaking imports.
  - Files: `src/events/syncHandler.js`.

- [P1 | S] Replace console logging with centralized `logger`
  - Progress: converted in `utils/database.js` (leaderboard roles), `events/messageReactionAdd.js`, `commands/leaderboard.js`, `events/messageCreate.js`, `utils/deploy-commands.js`.

---

### 8) Security and Safety

- [P1 | S] Update command safeguards
  - `/update` executes `git pull` and `npm install`. Consider adding a role/owner check (already present), plus environment allowlist, optional maintenance mode, and time window controls.

---

### 9) Feature Parity with Schema (Not Yet Implemented)

- Present in schema but not integrated yet. Suggest either hide behind feature flags or implement incrementally:
  - Achievements: `achievements`, `user_achievements` (+ criteria tracking hooks in `applyScoreChange`).
  - Server stats: `server_stats` (periodic job to write daily aggregates).
  - Rate limits: `rate_limits` (middleware before creating pending votes and awarding points).
  - Audit log table: currently logs to channels; optionally persist critical actions to `audit_log` and surface via `/admin audit`.
  - Time‑scoped scores: `daily_score`, `weekly_score`, `monthly_score` resets (cron).

---

### 10) Developer Experience (DX) and Testing

- [P1 | S] Add a `.env.example` for new server‑role key and intents/partials toggles
  - Include `SUPABASE_SERVICE_ROLE`, `LOG_LEVEL`, `LOG_TO_FILE`, `OWNER_ID`.

- [P1 | M] Add minimal tests for:
  - Leaderboard aggregation logic
  - Voting threshold calculation (fixed vs formula)
  - Snowflake string casting utilities

- [P2 | S] Add a dev-only `/deploy-commands --guild` script for faster command iterations (guild-scoped).

---

### Concrete Fix List (Ready to Implement)

1) Snowflake casting audit (S)
   - Update remaining `.eq(...)` calls (e.g., `admin.clear-history`) to cast IDs with `String(...)`.
   - Progress: `admin`, `database`, `sync`, and vote helpers updated to String-cast snowflakes.

2) Leaderboard SQL aggregation (M)
   - Replace JS aggregation with SQL `sum(total_score)` grouped by `user_id` (add a Postgres view or RPC if needed).

3) Config refactor (M)
   - Split `config.js` into modular handlers, router, and UI components.

4) Logging cleanup (S)
   - Replace `console.log` in utils with `logger` and gate debug logs behind level.

5) Migrations (M)
   - Remove broken Node migration scripts. Adopt Supabase migrations or add a secure execution strategy.

---

### Notable Code References

- Snowflake casting leaks
  - `src/commands/admin.js` → `handleClearHistory`

- Duplicate modules
  - `src/events/syncHandler.js` duplicates `src/utils/syncHandler.js`

---

### Appendix: Quick Examples

- Correct permission check
```js
// utils/permissions.js
const { PermissionFlagsBits } = require('discord.js');
function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator) ||
         member.permissions.has(PermissionFlagsBits.ManageGuild);
}
```

- Ephemeral replies
```js
await interaction.reply({ content: 'message', flags: MessageFlags.Ephemeral });
```

- Supabase count test
```js
const { count, error } = await supabase
  .from('servers')
  .select('*', { count: 'exact', head: true });
```

- SQL aggregation for synced leaderboard (concept)
```sql
select user_id::text,
       sum(total_score) as total_score,
       max(updated_at) as updated_at
from scores
where server_id = any($1::bigint[])
group by user_id
order by total_score desc
limit $2;
```

---

### Roadmap (Suggested Order)
- Week 1: P0/P1 correctness (intents/partials, permissions, RLS/service key, ephemeral, Unicode reactions, award logging bug, testConnection), logging cleanup.
- Week 2: SQL leaderboard aggregation, snowflake audit, delete dead scripts/dup files, minimal tests.
- Week 3+: Config refactor, role assignment batching, optional DB audit logging, begin implementing rate limits/achievements behind flags.



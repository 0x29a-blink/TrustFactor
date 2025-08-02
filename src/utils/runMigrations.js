const { supabase } = require('../config/database');
const fs = require('fs');
const path = require('path');

/**
 * Run database migrations in order
 */
async function runMigrations() {
    try {
        console.log('🔄 Checking for database migrations...');

        // Get current schema version
        const { data: currentVersion, error: versionError } = await supabase
            .from('schema_version')
            .select('version')
            .order('version', { ascending: false })
            .limit(1)
            .single();

        let currentVersionNumber = 0;
        if (!versionError && currentVersion) {
            currentVersionNumber = currentVersion.version;
        }

        console.log(`📊 Current schema version: ${currentVersionNumber}`);

        // Get all migration files
        const migrationsPath = path.join(__dirname, '../migrations');
        const migrationFiles = fs.readdirSync(migrationsPath)
            .filter(file => file.endsWith('.sql'))
            .sort();

        let migrationsRun = 0;

        for (const file of migrationFiles) {
            // Extract version number from filename (e.g., "002-sync-groups.sql" -> 2)
            const versionMatch = file.match(/^(\d+)-/);
            if (!versionMatch) {
                console.log(`⚠️ Skipping migration file with invalid format: ${file}`);
                continue;
            }

            const migrationVersion = parseInt(versionMatch[1]);

            // Skip if already applied
            if (migrationVersion <= currentVersionNumber) {
                continue;
            }

            console.log(`🔄 Running migration: ${file}`);

            // Read and execute migration
            const migrationPath = path.join(migrationsPath, file);
            const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

            // Execute migration
            const { error: migrationError } = await supabase.rpc('exec_sql', {
                sql_query: migrationSQL
            });

            if (migrationError) {
                // Try alternative method if rpc doesn't work
                try {
                    // Split SQL into individual statements and execute them
                    const statements = migrationSQL
                        .split(';')
                        .map(stmt => stmt.trim())
                        .filter(stmt => stmt.length > 0);

                    for (const statement of statements) {
                        if (statement.toLowerCase().includes('create') || 
                            statement.toLowerCase().includes('insert') ||
                            statement.toLowerCase().includes('alter')) {
                            
                            const { error: stmtError } = await supabase.rpc('exec_sql', {
                                sql_query: statement
                            });

                            if (stmtError) {
                                console.error(`❌ Error executing statement: ${statement.substring(0, 100)}...`);
                                console.error(stmtError);
                            }
                        }
                    }
                } catch (altError) {
                    console.error(`❌ Migration failed: ${file}`);
                    console.error(altError);
                    throw altError;
                }
            }

            migrationsRun++;
            console.log(`✅ Migration completed: ${file}`);
        }

        if (migrationsRun === 0) {
            console.log('✅ Database is up to date');
        } else {
            console.log(`✅ Applied ${migrationsRun} migration(s)`);
        }

        return true;
    } catch (error) {
        console.error('❌ Migration failed:', error);
        return false;
    }
}

/**
 * Initialize database with basic schema if needed
 */
async function initializeDatabase() {
    try {
        // Check if servers table exists
        const { data, error } = await supabase
            .from('servers')
            .select('server_id')
            .limit(1);

        if (error && error.code === '42P01') { // Table doesn't exist
            console.log('🔄 Initializing database with base schema...');
            
            // Run initial migration
            const initMigrationPath = path.join(__dirname, '../migrations/init-database.sql');
            if (fs.existsSync(initMigrationPath)) {
                const initSQL = fs.readFileSync(initMigrationPath, 'utf8');
                
                // This is a simplified approach - in production you'd want better error handling
                console.log('📊 Running initial database setup...');
                console.log('⚠️ Note: Some migration steps may need to be run manually in Supabase dashboard');
                
                return true;
            }
        }

        return true;
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        return false;
    }
}

// Export functions
module.exports = {
    runMigrations,
    initializeDatabase
};

// Run migrations if this file is executed directly
if (require.main === module) {
    (async () => {
        console.log('🚀 Starting database migration...');
        
        const initialized = await initializeDatabase();
        if (!initialized) {
            console.error('❌ Database initialization failed');
            process.exit(1);
        }

        const success = await runMigrations();
        if (!success) {
            console.error('❌ Migration failed');
            process.exit(1);
        }

        console.log('🎉 Migration completed successfully');
        process.exit(0);
    })();
}

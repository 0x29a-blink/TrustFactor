const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const logger = require('../utils/logger');

// Resolve environment profile (e.g., 'main' or 'dev') and pick suffixed vars if present
const PROFILE = (process.env.BOT_PROFILE || process.env.ENV_PROFILE || 'dev').toLowerCase();
const SUFFIX = PROFILE.toUpperCase();

function resolveEnv(base) {
    const withSuffix = process.env[`${base}_${SUFFIX}`];
    return withSuffix ?? process.env[base];
}

// Validate required environment variables for the active profile
const supabaseUrl = resolveEnv('SUPABASE_URL');
const supabaseKey = resolveEnv('SUPABASE_SERVICE_ROLE');

if (!supabaseUrl || !supabaseKey) {
    const missing = [
        !supabaseUrl ? `SUPABASE_URL or SUPABASE_URL_${SUFFIX}` : null,
        !supabaseKey ? `SUPABASE_SERVICE_ROLE or SUPABASE_SERVICE_ROLE_${SUFFIX}` : null,
    ].filter(Boolean).join(', ');
    logger.error(`Missing required environment variable(s): ${missing}`, 'CONFIG');
    process.exit(1);
}

// Create Supabase client

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: false, // Bot doesn't need session persistence
    },
    db: {
        schema: 'public',
    },
    global: {
        headers: {
            'User-Agent': 'TrustFactor-Discord-Bot/1.0.0'
        }
    }
});

// Test database connection
async function testConnection() {
    try {
        const { count, error } = await supabase
            .from('servers')
            .select('*', { count: 'exact', head: true });
        
        if (error) {
            logger.errorWithStack('Database connection test failed', error, 'DB');
            return false;
        }
        
        logger.db(`Supabase connection successful (servers: ${typeof count === 'number' ? count : 'n/a'})`, 'CONNECTION');
        return true;
    } catch (err) {
        logger.errorWithStack('Database connection error', err, 'DB');
        return false;
    }
}

module.exports = {
    supabase,
    testConnection
};

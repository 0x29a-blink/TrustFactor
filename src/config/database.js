const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const logger = require('../utils/logger');

// Validate required environment variables
const requiredEnvVars = [
    'DATABASE_URL',
    'SUPABASE_URL', 
    'SUPABASE_ANON_KEY'
];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        logger.error(`Missing required environment variable: ${envVar}`, 'CONFIG');
        process.exit(1);
    }
}

// Create Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

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
        const { data, error } = await supabase
            .from('servers')
            .select('count')
            .limit(1);
        
        if (error) {
            logger.errorWithStack('Database connection test failed', error, 'DB');
            return false;
        }
        
        logger.db('Supabase connection successful', 'CONNECTION');
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

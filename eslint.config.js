const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                ...globals.jest,
            },
        },
        rules: {
            'no-unused-vars': 'off',
            'no-console': 'off', // Allowed for CLI/Bot logging if needed, or warn if strict
            'semi': ['error', 'always'],
            'quotes': ['error', 'single', { 'avoidEscape': true }],
        },
        ignores: [
            'node_modules/',
            '.gemini/',
            'coverage/',
            '.git/',
            'dist/',
        ],
    },
];

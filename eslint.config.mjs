import js from '@eslint/js';
import globals from 'globals';

export default [
    { ignores: ['node_modules/'] },
    js.configs.recommended,
    {
        files: ['**/*.mjs'],
        languageOptions: { ecmaVersion: 2024, sourceType: 'module' },
        rules: {
            'no-console': 'off',
            'prefer-const': 'error',
        },
    },
    { files: ['web/**/*.mjs'], languageOptions: { globals: globals.browser } },
    { files: ['**/*.mjs'], ignores: ['web/**'], languageOptions: { globals: globals.node } },
];

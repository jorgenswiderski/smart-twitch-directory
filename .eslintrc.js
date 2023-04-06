module.exports = {
    env: {
        browser: true,
        es2021: true,
    },
    extends: ['eslint:recommended', 'plugin:react/recommended', 'airbnb', 'prettier'],
    overrides: [
        {
            extends: ['airbnb-typescript', 'prettier'],
            files: ['*.ts', '*.tsx'],
            rules: {
                '@typescript-eslint/lines-between-class-members': 'off',
            }
        },
    ],
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
    },
    plugins: ['react'],
    rules: {
        indent: ['error', 4],
        'import/prefer-default-export': 'off',
        'import/no-default-export': 'error',
        'import/no-extraneous-dependencies': 'off', // disabled now because it doesn't work, some sort of config issue
        'no-console': 'error',
    },
    settings: {
        "import/parsers": {
            "@typescript-eslint/parser": [".ts", ".tsx"]
        },
        "import/resolver": {
            "typescript": {
                // always try to resolve types under `<root>@types` directory even it doesn't contain any source code, like `@types/unist`
                "alwaysTryTypes": true,
            }
        }
    }
};
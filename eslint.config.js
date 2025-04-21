// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {...eslint.configs.recommended, ignores: ['dist/**', 'node_modules/**']},
    tseslint.configs.recommended.map(c => ({
        ...c,
        ignores: ['dist/**', 'node_modules/**']
    })),
    {
        rules: {
            "no-case-declarations": "off"
        },
    }
)
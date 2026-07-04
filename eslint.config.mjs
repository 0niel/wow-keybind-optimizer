import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['node_modules', '.next', 'out', 'next-env.d.ts', 'scripts/.cache'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-inline-comments': 'error',
      'no-warning-comments': ['error', { terms: ['todo', 'fixme', 'hack'], location: 'anywhere' }],
    },
  },
)

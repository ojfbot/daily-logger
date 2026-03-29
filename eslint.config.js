import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist/', '_site/', 'assets/js/app.js'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    ignores: ['src/frontend/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/frontend/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.frontend.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
    },
  },
)

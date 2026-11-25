// ESLint flat configuration for the YieldAnchor TypeScript/Node workspaces.
//
// Scope: apps/, services/, scripts/ (TypeScript + JavaScript) and the root
// tooling/config files. Rust under contracts/ is intentionally excluded —
// rustfmt and clippy own Rust formatting and linting (see the Makefile).
//
// React plugins are deliberately not installed: the Phase 1 web scaffold does
// not require them, and keeping the dependency set small is preferred.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/target/**',
      'contracts/**',
      'database/**',
      '*.tgz',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // The existing scaffold uses `catch (err: any)` and a few `as` casts.
      // Reporting this as a warning keeps the migration from rewriting
      // application code while still surfacing the issue.
      '@typescript-eslint/no-explicit-any': 'warn',
      // `import React from 'react'` is retained alongside the automatic JSX
      // runtime in the web app, so the binding is allowed to be unused.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^React$' },
      ],
    },
  },
  prettier,
);

// Flat ESLint config — intentionally minimal (CLAUDE.md keeps the frontend lean).
// Focus: the one React bug class `vite build` can't catch — hook order (tech-stack §3.3).
// `rules-of-hooks` is an ERROR (fails CI); everything else is a WARN so a 19k-line,
// never-linted codebase with intentional idioms (empty `catch {}`, unused imports in
// barrels) isn't held hostage. Tighten rules to error incrementally as the code is cleaned.
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, React: 'readonly' },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'no-unused-vars': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];

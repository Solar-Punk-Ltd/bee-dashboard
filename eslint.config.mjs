import * as path from 'path'
import { fileURLToPath } from 'url'

import reactHooks from 'eslint-plugin-react-hooks'
import { defineConfig } from 'eslint/config'

// Calculate current directory for proper file path resolution
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Import the modules from our CommonJS compatibility wrapper
const compat = await import(`${__dirname}/eslint-compat.cjs`)
const js = compat.default.js
const ts = compat.default.ts
const tsParser = compat.default.tsParser
const prettier = compat.default.prettier
const importPlugin = compat.default.importPlugin
const pluginJest = compat.default.pluginJest
const prettierPlugin = compat.default.prettierPlugin
const simpleImportSort = compat.default.simpleImportSort
const react = compat.default.react

// Recreate eslint:recommended
const eslintRecommended = js.configs.recommended

// Recreate plugin:@typescript-eslint/recommended
const typescriptRecommended = {
  plugins: {
    '@typescript-eslint': ts,
  },
  rules: {
    ...ts.configs.recommended.rules,
  },
}

// Recreate plugin:import/errors, plugin:import/warnings, plugin:import/typescript
const importRules = {
  plugins: {
    import: importPlugin,
  },
  rules: {
    ...importPlugin.configs.errors.rules,
    ...importPlugin.configs.warnings.rules,
    ...importPlugin.configs.typescript.rules,
  },
}

// Recreate plugin:prettier/recommended
const prettierRecommended = {
  plugins: {
    prettier: prettierPlugin,
  },
  rules: {
    'prettier/prettier': 'error',
    ...prettier.rules,
  },
}

export default defineConfig([
  reactHooks.configs.flat.recommended,
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'eslint.config.mjs',
      'eslint-compat.cjs',
      '**/icons/**',
      '**/assets/**',
      '**/lib/**',
      '**/build/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
        },
      },
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parser: tsParser,
      globals: {
        // Browser environment
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        React: 'readonly',
        Event: 'readonly',
        Element: 'readonly',
        DataTransfer: 'readonly',
        CustomEvent: 'readonly',
        EventListener: 'readonly',
        AbortController: 'readonly',
        URLSearchParams: 'readonly',
        FileList: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        localStorage: 'readonly',
        fetch: 'readonly',
        crypto: 'readonly',
        Metadata: 'readonly',
        Blob: 'readonly',
        FilePath: 'readonly',
        File: 'readonly',
        HTMLSpanElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLImageElement: 'readonly',
        HTMLAnchorElement: 'readonly',
        MouseEvent: 'readonly',
        HTMLButtonElement: 'readonly',
        MutationObserver: 'readonly',
        requestAnimationFrame: 'readonly',
        Node: 'readonly',
        ReadableStream: 'readonly',
        FileSystemFileHandle: 'readonly',
        AbortSignal: 'readonly',
        WritableStreamDefaultWriter: 'readonly',
        DOMException: 'readonly',
        FileSystemDirectoryHandle: 'readonly',
        URL: 'readonly',
        DOMRect: 'readonly',
        Window: 'readonly',
        prompt: 'readonly',
        global: 'readonly',
        FileReader: 'readonly',
        Image: 'readonly',
        NodeJS: 'readonly',
        LatestBeeRelease: 'readonly',
        KeyboardEvent: 'readonly',
        cancelAnimationFrame: 'readonly',
      },
    },
  },
  {
    //TODO: fix test linter errors
    files: [
      'test/**/*.ts',
      'test/**/*.js',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'src/**/*.spec.ts',
      'src/**/*.spec.tsx',
      'ui-test/**/*.js',
    ],
    rules: {
      'no-console': 'off',
      'import/no-commonjs': 'off',
      'max-nested-callbacks': ['error', 10], // allow describe/it/test nesting
    },
    plugins: {
      jest: pluginJest,
    },
    languageOptions: {
      globals: pluginJest.environments.globals.globals,
    },
    rules: {
      'jest/no-disabled-tests': 'warn',
      'jest/no-focused-tests': 'error',
      'jest/no-identical-title': 'error',
      'jest/prefer-to-have-length': 'warn',
      'jest/valid-expect': 'error',
    },
  },
  // Include all the extended configs
  eslintRecommended,
  typescriptRecommended,
  importRules,
  prettierRecommended,
  prettier, // Additional prettier config
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    // Plugin and rule configurations
    plugins: {
      '@typescript-eslint': ts,
      'simple-import-sort': simpleImportSort,
      react: react,
    },
    rules: {
      'array-bracket-newline': ['error', 'consistent'],
      strict: ['error', 'safe'],
      'block-scoped-var': 'error',
      complexity: 'warn',
      'default-case': 'error',
      'dot-notation': 'warn',
      eqeqeq: 'error',
      'guard-for-in': 'warn',
      'linebreak-style': ['warn', 'unix'],
      'no-alert': 'error',
      'no-case-declarations': 'error',
      'no-console': 'error',
      'no-constant-condition': 'error',
      'no-continue': 'warn',
      'no-div-regex': 'error',
      'no-empty': 'warn',
      'no-empty-pattern': 'error',
      'no-implicit-coercion': 'error',
      'prefer-arrow-callback': 'warn',
      'no-labels': 'error',
      'no-loop-func': 'error',
      'no-nested-ternary': 'warn',
      'no-script-url': 'error',
      'quote-props': ['error', 'as-needed'],
      'require-yield': 'error',
      'max-depth': ['error', 4],
      'require-await': 'error',
      'space-before-function-paren': [
        'error',
        {
          anonymous: 'never',
          named: 'never',
          asyncArrow: 'always',
        },
      ],
      'padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: 'if' },
        { blankLine: 'always', prev: '*', next: 'function' },
        { blankLine: 'always', prev: '*', next: 'return' },
      ],
      'no-useless-constructor': 'off',
      'no-dupe-class-members': 'off',
      curly: ['error', 'multi-line'],
      'object-curly-spacing': ['error', 'always'],
      'comma-dangle': ['error', 'always-multiline'],
      '@typescript-eslint/no-useless-constructor': 'error',
      '@typescript-eslint/no-unused-expressions': 'error',
      'react/react-in-jsx-scope': 'off',
      'max-nested-callbacks': ['error', 4],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'simple-import-sort/imports': [
        'error',
        {
          groups: [
            ['^@?\\w'], // Packages
            ['^\\u0000'], // Side effect imports
            ['^\\.\\.(?!/?$)', '^\\.\\./?$'], // Parent imports
            ['^\\./(?=.*/)(?!/?$)', '^\\.(?!/?$)', '^\\./?$'], // Other relative imports
            ['^.+\\.?(css)$'], // Style imports
          ],
        },
      ],
    },
  },
])

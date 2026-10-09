// ESLint flat config for an ES-module browser app with no runtime
// dependencies. `pnpm run lint` runs the eslint version that the lockfile
// pins. The app lists no config packages, so this file imports none. `no-undef` stays off
// because `tsc --noEmit` (checkJs + strict) already resolves identifiers with
// full DOM lib knowledge; ESLint here covers the style/logic rules tsc does not.
export default [
  // Agent worktrees live under .claude/worktrees/ inside the checkout. Their
  // work in progress is not part of this tree, and linting it fails the
  // pre-commit hook of the main checkout.
  { ignores: ['.claude/**'] },
  {
    files: [
      'src/**/*.js',
      'tests/**/*.js',
      'bench/**/*.js',
      'docs/gallery/**/*.js',
      'scripts/**/*.{js,mjs,cjs}',
      'site/**/*.js',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-shadow': 'error',
      'no-duplicate-imports': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-template-curly-in-string': 'error',
      'no-self-compare': 'error',
      'no-unreachable-loop': 'error',
      'no-constructor-return': 'error',
      'no-promise-executor-return': 'error',
      // require-atomic-updates is omitted: it false-positives on plain
      // "reassign shared state after a confirm dialog" patterns (eslint#11899).
      'no-else-return': 'error',
      'no-lonely-if': 'error',
      'object-shorthand': 'error',
      'prefer-template': 'error',
      'no-useless-concat': 'error',
      'no-throw-literal': 'error',
      'default-case-last': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  // The build scripts report their progress on standard output. build.cjs is
  // CommonJS, so `require` and `module` are its imports.
  { files: ['scripts/**/*.{js,mjs,cjs}'], rules: { 'no-console': 'off' } },
  { files: ['scripts/**/*.cjs'], languageOptions: { sourceType: 'commonjs' } },
  // The pure directories do not import the DOM widgets in ui/ or the wiring
  // modules in app/. A pure module that did would need a browser to load, and
  // its unit tests under `node --test` would fail. view/CharacterClaim.js
  // builds the character picker of a Player tab with the ui/ helpers, so it
  // is the one exception.
  {
    files: [
      'src/{map,entities,combat,data,campaign,party,quest,handout,time,log,dice,library,view,storage,util}/**/*.js',
    ],
    ignores: ['src/view/CharacterClaim.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { regex: '(^|/)(ui|app)/', message: 'A pure module does not import from ui/ or app/.' },
          ],
        },
      ],
    },
  },
];

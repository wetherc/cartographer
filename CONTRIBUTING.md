# Contributing to Campaign Builder

Thank you for your interest in this project.

## Core Philosophy

- **Framework-Free Vanilla JS:** The application logic is plain, modern JavaScript (ES modules). It uses standard browser APIs. The project has no runtime frameworks.
- **Build Step for Production:** Development happens on the source files. A build process bundles and minifies the assets for production. This process is a convenience for developers. It does not change the framework-free nature of the runtime code.
- **Separation of Concerns:** The code separates pure, stateful logic from the code that shows the UI in the DOM.

## Development Setup

This project uses `pnpm` to manage development tools and to run a local development server.

1.  **Install Dependencies:**
    The development environment uses `esbuild` for bundling, `typescript` for type checking, and `eslint` for linting. Run this command to install them:
    ```bash
    pnpm install
    ```

2.  **Run the Local Dev Server:**
    The project includes a live-reloading development server. The server rebuilds the assets each time you change a source file.
    ```bash
    pnpm run dev
    ```
    Open the local URL that appears in your terminal (usually `http://localhost:8080`) in your browser.

3.  **Make One Change:**
    [`docs/tutorial-first-code-change.md`](docs/tutorial-first-code-change.md) walks the whole loop once: change a module, test it, and see the result in the browser. [`docs/README.md`](docs/README.md) lists every other document and says what kind it is.

## Development Workflow

- **Production Build:**
  Run this command to generate a production build in the `dist/` directory:
  ```bash
  pnpm run build
  ```

- **Run Tests:**
  Tests use Node's built-in test runner and run against the source files, not the built assets.
  ```bash
  # Run the full test suite
  pnpm test

  # Same run, but list the name of every test
  TEST_VERBOSE=1 pnpm test
  ```
  The results group by the area under `src/`, with one line for each test file. Only a failing file lists its individual tests. See [`docs/testing.md`](docs/testing.md) for the format.

- **Run Linter:**
  ```bash
  pnpm run lint
  ```

- **Run Type Checker:**
  Types live in `src/types/*.ts` as declaration files. The `.js` files reference them with JSDoc comments (`@typedef {import('../types/map.js').Tile}`).
  ```bash
  pnpm run typecheck
  ```

- **Developer Guide:**
  `docs/dev-guide.html` is an interactive tour of the codebase. Open it in a browser to see the import map, the mount order of `src/main.js`, the packing layers of a save, and a checklist for a pull request. The page is generated, so do not edit it by hand. Rebuild it with this command:
  ```bash
  pnpm run guide
  ```
  Counts, import edges, mount order, registry entries, storage keys, code snippets, and save sizes are read out of the repository each time. The prose and the classifications live in `scripts/dev-guide/content.mjs`. Every file and symbol that the prose names is checked during the build, so a rename fails the build instead of leaving stale text behind. `pnpm run guide:check` reports whether the committed page matches the current tree.

- **Automated Checks:**
  The project provides a versioned pre-commit hook. The hook runs the linter, the test suite, and the type checker before each commit. It also regenerates the developer guide when a commit touches the source tree. The hook is optional, and it catches these errors before you push. Enable the hook once for each clone with this command:
  ```bash
  git config core.hooksPath hooks
  ```

## Making a Contribution

- Add unit tests for any new pure logic.
- If you change the UI or the canvas, open it in a browser. Make sure that it looks and works correctly.
- Keep pull requests focused on a single feature or bug fix.
- Before you submit a pull request, make sure that all automated checks pass.

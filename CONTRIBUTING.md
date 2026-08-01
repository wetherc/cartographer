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
  ```

- **Run Linter:**
  ```bash
  pnpm run lint
  ```

- **Run Type Checker:**
  Types live in `src/types/*.ts` as declaration files. The `.js` files reference them with JSDoc comments (`@typedef {import('../types/map.js').Tile}`).
  ```bash
  pnpm run typecheck
  ```

- **Automated Checks:**
  The project provides a versioned pre-commit hook. The hook runs the linter, the test suite, and the type checker before each commit. The hook is optional, and it catches these errors before you push. Enable the hook once for each clone with this command:
  ```bash
  git config core.hooksPath hooks
  ```

## Making a Contribution

- Add unit tests for any new pure logic.
- If you change the UI or the canvas, open it in a browser. Make sure that it looks and works correctly.
- Keep pull requests focused on a single feature or bug fix.
- Before you submit a pull request, make sure that all automated checks pass.

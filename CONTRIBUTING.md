# Contributing to Campaign Builder

First off, thank you for considering contributing! This document provides guidelines to help you get started.

## Core Philosophy

- **Framework-Free Vanilla JS:** The application logic is written in plain, modern JavaScript (ES modules) and interacts with standard browser APIs. There are no runtime frameworks.
- **Build Step for Production:** While development happens on source files, a build process is used to bundle and minify assets for optimized production deployment. This is a developer-facing convenience and does not change the framework-free nature of the runtime code.
- **Separation of Concerns:** The code is organized to separate pure, stateful logic from DOM/UI rendering code.

## Development Setup

This project uses `pnpm` for managing development tools and running a local development server.

1.  **Install Dependencies:**
    The development environment uses `esbuild` for bundling, `typescript` for type-checking, and `eslint` for linting. Install them by running:
    ```bash
    pnpm install
    ```

2.  **Run the Local Dev Server:**
    A live-reloading development server is included. It automatically rebuilds assets as you make changes to the source files.
    ```bash
    pnpm run dev
    ```
    Then open the local URL shown in your terminal (usually `http://localhost:8080`) in your browser.

## Development Workflow

- **Production Build:**
  To generate a production-ready build in the `dist/` directory, run:
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
  Types live in `src/types/*.ts` as declaration files. `.js` files reference them via JSDoc (`@typedef {import('../types/map.js').Tile}`).
  ```bash
  pnpm run typecheck
  ```

- **Automated Checks (Recommended):**
  A versioned pre-commit hook is provided to run the linter, test suite, and type checker automatically before each commit. Enable it once per clone with:
  ```bash
  git config core.hooksPath hooks
  ```

## Making a Contribution

- Add unit tests for any new pure logic.
- For any UI/canvas change, visually verify it in a browser to ensure it looks and feels right.
- Keep pull requests focused on a single feature or bug fix.
- Ensure all automated checks are passing before submitting a pull request.

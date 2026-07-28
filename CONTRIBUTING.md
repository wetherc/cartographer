# Contributing to Campaign Builder

First off, thank you for considering contributing! This document provides guidelines to help you get started.

## Core Philosophy

- **Zero Runtime Dependencies:** The core application (`index.html`, `src/`, `styles/`) is and should remain plain HTML, CSS, and JavaScript (ES modules). It should run in a modern browser without any build step.
- **Separation of Concerns:** The code is organized to separate pure, stateful logic from DOM/UI rendering code.
  - Pure logic (e.g., dice rolling, map calculations) is dependency-injected and belongs in modules that can be unit-tested.
  - DOM/UI wiring (`src/ui/`, event handlers) is kept thin and is tested visually.

## Development Setup

This project uses `pnpm` for managing development tools.

1.  **Install Dependencies:**
    While the application itself has no dependencies, the development environment uses `typescript` for type-checking and `eslint` for linting. Install them by running:
    ```bash
    pnpm install
    ```

2.  **Run the Local Server:**
    Serve the project root over HTTP (ES module imports don't work over `file://`). You can use any local server, but `http-server` is a simple choice.
    ```bash
    pnpx http-server -p 8934
    ```
    Then open `http://localhost:8934` in your browser.

## Development Workflow

Before committing, please ensure your changes pass all checks.

- **Run Tests:**
  Tests use Node's built-in test runner.
  ```bash
  # Run the full test suite
  pnpm test

  # Run tests for a single file (useful while iterating)
  node --test tests/some-module.test.js
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

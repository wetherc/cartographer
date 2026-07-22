See @README.md for a project overview.

# Code style
- Use plain HTML, CSS, and JavaScript and minimize/eliminate external dependencies
- Break files apart into logical, well-scoped components
- Include relevant unit tests, regression tests, and linting
- Emphasize brevity in code, but not at the expense of readability and maintainability

# Workflow
- Be sure to typecheck when you're done making a series of code changes
  - Ensure that types are declared (@tsconfig.json should allow for `.ts` files containing type declarations. Those types must then be used as JSDocs)
- Prefer running single tests, and not the whole test suite, for performance

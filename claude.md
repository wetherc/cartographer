See @README.md for a project overview.

# Communication style
- Communicate succinctly, without affect, and directly. Do not embellish, editorialize, or complain
- All git commit messages should be factual statements of the work completed. Use full sentences within paragraphs of text. Do not use bulleted lists to describe changes. Always describe the motivation for the changes being committed, how they achieve the stated goal, and any caveats or missing pieces of functionality

# Code style
- Use plain HTML, CSS, and JavaScript and minimize/eliminate external dependencies
- Break files apart into logical, well-scoped components
- Include relevant unit tests, regression tests, and linting
- Emphasize brevity in code, but not at the expense of readability and maintainability
- When unit testing / typechecking, always rely on `pnpm` rather than `npm`

# Workflow
- Be sure to typecheck when you're done making a series of code changes
  - Ensure that types are declared (@tsconfig.json should allow for `.ts` files containing type declarations. Those types must then be used as JSDocs)
- Prefer running single tests, and not the whole test suite, for performance
- Commit your changes to Git at a regular cadence
- Always unit test and lint your code before committing, ideally as a pre-commit hook
- Always use playwright to visually inspect changes. Assume that the project is running on `localhost:8934`

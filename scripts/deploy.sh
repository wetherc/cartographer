#!/bin/sh

# Abort on errors
set -e

# Install exactly what the lockfile pins. A stale lockfile fails here instead
# of resolving a newer bundler that emits the production output.
pnpm install --frozen-lockfile

# Build the project
echo "Building for production..."
pnpm run build

# Tag the source commit that this deploy is built from, so the published
# output can always be traced back to its source. The tag is local; push it
# with the release when the tree is clean.
VERSION=$(node -p "require('./package.json').version")
git tag -f "deploy-v$VERSION"

# Navigate into the build output directory
cd dist

# Initialize a new git repository, add and commit all files
git init
git add -A
git commit -m "Deploy version $VERSION"

# Deploy to the gh-pages branch on GitHub
echo "Deploying version $VERSION to GitHub Pages..."
git push -f https://github.com/wetherc/cartographer.git HEAD:gh-pages

cd -

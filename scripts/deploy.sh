#!/bin/sh

# Abort on errors
set -e

# Build the project
echo "Building for production..."
pnpm run build

# Navigate into the build output directory
cd dist

# Get version from package.json to use in the commit message
VERSION=$(node -p "require('../package.json').version")

# Initialize a new git repository, add and commit all files
git init
git add -A
git commit -m "Deploy version $VERSION"

# Deploy to the gh-pages branch on GitHub
echo "Deploying version $VERSION to GitHub Pages..."
git push -f https://github.com/wetherc/cartographer.git HEAD:gh-pages

cd -

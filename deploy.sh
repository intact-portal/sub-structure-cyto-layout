#!/bin/bash
set -e

# Ensure we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "Error: Deploy must be run from main branch. Current branch: $CURRENT_BRANCH"
    exit 1
fi

# Clean and build the project
echo "Cleaning dist folder..."
rm -rf dist

echo "Building..."
npm run build

# Setup Git LFS in dist
echo "Setting up Git LFS in dist..."
cd dist
git init
git lfs install

# Track LFS files BEFORE adding them
echo "data/*.cyjs filter=lfs diff=lfs merge=lfs -text" > .gitattributes

# Add all files and commit
echo "Committing..."
git add .gitattributes
git add -A
git commit -m "Deploy to GitHub Pages"

# Push to gh-pages branch
echo "Pushing to gh-pages..."
git push -f https://github.com/intact-portal/sub-structure-cyto-layout.git HEAD:gh-pages

# Cleanup
cd ..
rm -rf dist/.git

echo "Deployed successfully!"

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

# Compress large files (>100MB) to avoid GitHub's file size limit
echo "Compressing large data files..."
cd dist/data
for file in *.cyjs; do
    size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
    if [ "$size" -gt 104857600 ]; then
        echo "  Compressing $file ($(numfmt --to=iec-i --suffix=B $size 2>/dev/null || echo ${size}B))"
        gzip -9 "$file"
    fi
done
cd ../..

# Setup Git in dist (NO LFS - GitHub Pages doesn't serve LFS files)
echo "Setting up Git in dist..."
cd dist
git init

# Add all files and commit (actual files, not LFS pointers)
echo "Committing..."
git add -A
git commit -m "Deploy to GitHub Pages"

# Push to gh-pages branch
echo "Pushing to gh-pages..."
git push -f https://github.com/intact-portal/sub-structure-cyto-layout.git HEAD:gh-pages

# Cleanup
cd ..
rm -rf dist/.git

echo "Deployed successfully!"

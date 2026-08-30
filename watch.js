#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('👀 Watching src/index.html for changes...');

// Copy HTML file
function copyHTML() {
  const src = path.join(__dirname, 'src/index.html');
  const dest = path.join(__dirname, 'dist/index.html');

  try {
    fs.copyFileSync(src, dest);
    console.log('✅ Copied index.html to dist/');
  } catch (err) {
    console.error('❌ Error copying HTML:', err.message);
  }
}

// Initial copy
copyHTML();

// Watch for changes
fs.watch(path.join(__dirname, 'src/index.html'), (eventType) => {
  if (eventType === 'change') {
    console.log('📝 index.html changed, copying...');
    copyHTML();
  }
});

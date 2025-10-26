const fs = require('fs');
const path = require('path');

const sourcePath = path.join(__dirname, 'backend', 'build', 'contracts', 'ChatMetadata.json');
const destDir = path.join(__dirname, 'frontend', 'src', 'abis');
const destPath = path.join(destDir, 'ChatMetadata.json');

// Ensure destination directory exists
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

// Copy the file
fs.copyFileSync(sourcePath, destPath);

console.log(`Copied ${sourcePath} to ${destPath}`);

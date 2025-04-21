#!/usr/bin/env node

// This script builds standalone binaries for different platforms
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PLATFORMS = [
  { name: 'linux', arch: 'x64', target: 'node18-linux-x64' },
  { name: 'macos', arch: 'x64', target: 'node18-darwin-x64' },
  { name: 'macos', arch: 'arm64', target: 'node18-darwin-arm64' },
  { name: 'windows', arch: 'x64', target: 'node18-win-x64' }
];

const VERSION = require('../package.json').version;
const DIST_DIR = path.join(__dirname, '../dist');

async function main() {
  console.log('🛠️  Building binaries...');
  
  // Make sure dist directory exists
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }
  
  // Build TypeScript first
  console.log('📦 Building TypeScript...');
  execSync('yarn build', { stdio: 'inherit' });
  
  // Create a pkg-compatible entry file
  createPkgEntryFile();
  
  // Build binaries for each platform
  const binaries = [];
  
  for (const platform of PLATFORMS) {
    const pkgTarget = platform.target;
    const extension = platform.name === 'windows' ? '.exe' : '';
    const outputName = `datadog-migrator-${platform.name}-${platform.arch}-${VERSION}${extension}`;
    const outputPath = path.join(DIST_DIR, outputName);
    
    console.log(`🔨 Building for ${platform.name} (${platform.arch})...`);
    
    try {
      execSync(
        `pkg ./dist/cli-entry.js --target ${pkgTarget} --output ${outputPath} --compress GZip`,
        { stdio: 'inherit' }
      );
      
      binaries.push({ platform: platform.name, arch: platform.arch, path: outputPath });
      console.log(`✅ Built ${outputName}`);
    } catch (error) {
      console.error(`❌ Failed to build for ${platform.name} (${platform.arch}):`, error);
    }
  }
  
  // Generate checksums
  if (binaries.length > 0) {
    console.log('🔐 Generating checksums...');
    const checksumFile = path.join(DIST_DIR, 'SHA256SUMS.txt');
    let checksums = '';
    
    binaries.forEach(binary => {
      const fileName = path.basename(binary.path);
      // Generate checksum
      const checksum = execSync(`shasum -a 256 "${binary.path}"`, { encoding: 'utf8' });
      checksums += checksum;
    });
    
    fs.writeFileSync(checksumFile, checksums);
    console.log(`✅ Checksums written to ${checksumFile}`);
  }
  
  console.log('🎉 All done!');
}

// Create a special entry file for pkg that ensures
// all dependencies are correctly bundled
function createPkgEntryFile() {
  const entryPath = path.join(DIST_DIR, 'cli-entry.js');
  
  const content = `
  #!/usr/bin/env node
  
  // This file is used by pkg to create binaries
  // It ensures all dependencies are correctly bundled
  
  // In binary builds, __dirname is not the actual directory
  // So we need to handle paths differently
  if (process.pkg) {
    // Running from packaged binary
    try {
      require('./index.js');
    } catch (error) {
      console.error('Error starting application:', error);
      process.exit(1);
    }
  } else {
    // Running directly with Node
    require('./index.js');
  }
  `;
  
  fs.writeFileSync(entryPath, content);
  console.log('📄 Created pkg entry file');
}

main().catch(err => {
  console.error('Error building binaries:', err);
  process.exit(1);
});
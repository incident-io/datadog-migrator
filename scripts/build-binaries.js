#!/usr/bin/env node

// This script builds standalone binaries for different platforms
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLATFORMS = [
  { name: 'linux', arch: 'x64', target: 'node18-linux-x64' },
  { name: 'macos', arch: 'x64', target: 'node18-darwin-x64' },
  { name: 'macos', arch: 'arm64', target: 'node18-darwin-arm64' },
  { name: 'windows', arch: 'x64', target: 'node18-win-x64' }
];

const packageJson = require('../package.json');
const VERSION = packageJson.version;
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
      // Generate checksum - handle cross-platform differences
      let checksum;
      try {
        // Try macOS/Linux style
        checksum = execSync(`shasum -a 256 "${binary.path}"`, { encoding: 'utf8' });
      } catch (error) {
        try {
          // Try Windows style
          checksum = execSync(`certutil -hashfile "${binary.path}" SHA256 | findstr /v "hash"`, { encoding: 'utf8' });
          // Format Windows output to match Linux style
          const hash = checksum.trim().split('\r\n')[0].trim().replace(/\s+/g, '');
          checksum = `${hash}  ${fileName}\n`;
        } catch (windowsError) {
          console.error(`Could not generate checksum for ${fileName}`);
          return;
        }
      }
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
  
  // We need to use CommonJS in the entry file for pkg to work properly
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

// Run the main function
main().catch(err => {
  console.error('Error building binaries:', err);
  process.exit(1);
});
/**
 * Prepare build script - Downloads Playwright browsers before building
 * This ensures browsers are available for pre-bundling (Option B)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Preparing build with pre-bundled browsers...\n');

// Check if browsers are already installed
const playwrightPath = path.join(__dirname, '..', 'node_modules', 'playwright-core', '.local-browsers');
const msPlaywrightPath = process.platform === 'win32' 
  ? path.join(process.env.LOCALAPPDATA || '', 'ms-playwright')
  : process.platform === 'darwin'
  ? path.join(process.env.HOME, 'Library', 'Caches', 'ms-playwright')
  : path.join(process.env.HOME, '.cache', 'ms-playwright');

let browsersFound = false;

if (fs.existsSync(playwrightPath)) {
  const entries = fs.readdirSync(playwrightPath);
  if (entries.some(e => e.toLowerCase().startsWith('chromium-'))) {
    console.log('✅ Browsers found in node_modules/playwright-core/.local-browsers');
    browsersFound = true;
  }
}

if (!browsersFound && fs.existsSync(msPlaywrightPath)) {
  const entries = fs.readdirSync(msPlaywrightPath);
  if (entries.some(e => e.toLowerCase().startsWith('chromium-'))) {
    console.log('✅ Browsers found in system cache');
    browsersFound = true;
  }
}

if (!browsersFound) {
  console.log('📥 Downloading Chromium browser...');
  console.log('This may take a few minutes on first run.\n');
  
  try {
    execSync('npx playwright install chromium', { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    console.log('\n✅ Browser download complete!');
  } catch (error) {
    console.error('\n❌ Failed to download browsers:', error.message);
    process.exit(1);
  }
} else {
  console.log('✅ Browsers already installed, skipping download.');
}

console.log('\n📦 Copying browsers to build directory...');

// Create build/playwright-browsers directory
const buildBrowsersPath = path.join(__dirname, '..', 'build', 'playwright-browsers');
if (!fs.existsSync(buildBrowsersPath)) {
  fs.mkdirSync(buildBrowsersPath, { recursive: true });
}

// Copy browsers from ms-playwright to build directory
if (fs.existsSync(msPlaywrightPath)) {
  const entries = fs.readdirSync(msPlaywrightPath);
  for (const entry of entries) {
    const sourcePath = path.join(msPlaywrightPath, entry);
    const targetPath = path.join(buildBrowsersPath, entry);
    
    if (fs.statSync(sourcePath).isDirectory()) {
      console.log(`📋 Copying ${entry}...`);
      
      // Use xcopy on Windows for faster copying
      if (process.platform === 'win32') {
        try {
          execSync(`xcopy "${sourcePath}" "${targetPath}" /E /I /H /Y`, { stdio: 'ignore' });
        } catch (e) {
          // Fallback to Node.js copy
          fs.cpSync(sourcePath, targetPath, { recursive: true, force: true });
        }
      } else {
        fs.cpSync(sourcePath, targetPath, { recursive: true, force: true });
      }
    }
  }
  console.log('✅ Browsers copied to build directory');
} else {
  console.warn('⚠️  No browsers found to copy. The app may need to download them on first run.');
}

console.log('\n📦 Ready to build with pre-bundled browsers!');

// Also download Node.js for bundling
console.log('\n📥 Downloading Node.js for bundling...');
try {
  require('child_process').execSync('node scripts/download-node.js', { 
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
} catch (error) {
  console.error('Failed to download Node.js:', error.message);
  process.exit(1);
}

console.log('\n✅ Build preparation complete!');
console.log('Run "npm run dist" to build the application.\n');

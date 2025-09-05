/**
 * Downloads portable Node.js for bundling with the Electron app
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { createWriteStream } = require('fs');
const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);

const NODE_VERSION = 'v20.11.0'; // LTS version
const platform = process.platform;
const arch = process.arch;

// Determine the correct Node.js binary URL
let nodeUrl;
let nodeExeName;

if (platform === 'win32') {
  nodeUrl = `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-win-${arch}.zip`;
  nodeExeName = 'node.exe';
} else if (platform === 'darwin') {
  nodeUrl = `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-darwin-${arch}.tar.gz`;
  nodeExeName = 'node';
} else {
  nodeUrl = `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-${arch}.tar.gz`;
  nodeExeName = 'node';
}

const nodeDir = path.join(__dirname, '..', 'build', 'node');
const downloadPath = path.join(nodeDir, `node-${NODE_VERSION}.${platform === 'win32' ? 'zip' : 'tar.gz'}`);

async function downloadFile(url, dest) {
  const file = createWriteStream(dest);
  
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Node.js' } }, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      const totalBytes = parseInt(response.headers['content-length'], 10);
      let downloadedBytes = 0;
      
      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const progress = ((downloadedBytes / totalBytes) * 100).toFixed(1);
        process.stdout.write(`\rDownloading Node.js: ${progress}%`);
      });
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log('\nDownload complete!');
        resolve();
      });
      
      file.on('error', (err) => {
        fs.unlink(dest, () => {}); // Delete the file on error
        reject(err);
      });
    }).on('error', reject);
  });
}

async function extractNode() {
  console.log('Extracting Node.js...');
  
  if (platform === 'win32') {
    // For Windows, we'll just download the exe directly
    const nodeExeUrl = `https://nodejs.org/dist/${NODE_VERSION}/win-${arch}/node.exe`;
    const nodeExePath = path.join(nodeDir, 'node.exe');
    await downloadFile(nodeExeUrl, nodeExePath);
    console.log('Node.exe downloaded successfully!');
  } else {
    // For Unix systems, extract from tar.gz
    const tar = require('tar');
    await tar.x({
      file: downloadPath,
      cwd: nodeDir,
      strip: 1, // Remove the top-level directory
      filter: (path) => {
        // Only extract the node binary
        return path.endsWith('/bin/node');
      }
    });
    console.log('Node binary extracted successfully!');
  }
}

async function main() {
  try {
    // Create directory if it doesn't exist
    if (!fs.existsSync(nodeDir)) {
      fs.mkdirSync(nodeDir, { recursive: true });
    }
    
    // Check if Node.js is already downloaded
    const nodeExePath = path.join(nodeDir, nodeExeName);
    if (fs.existsSync(nodeExePath)) {
      console.log('Node.js already downloaded.');
      return;
    }
    
    console.log(`Downloading Node.js ${NODE_VERSION} for ${platform}-${arch}...`);
    
    if (platform === 'win32') {
      // For Windows, download the exe directly
      await extractNode();
    } else {
      // For other platforms, download and extract
      await downloadFile(nodeUrl, downloadPath);
      await extractNode();
      // Clean up the archive
      fs.unlinkSync(downloadPath);
    }
    
    console.log('Node.js setup complete!');
  } catch (error) {
    console.error('Error downloading Node.js:', error);
    process.exit(1);
  }
}

main();


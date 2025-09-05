/**
 * Simple wrapper to run Playwright CLI
 * This ensures proper module resolution in packaged app
 */

const path = require('path');

// Get command line arguments (remove first two: node and script path)
const args = process.argv.slice(2);

try {
  // Load and run Playwright CLI
  require('@playwright/test/cli');
} catch (error) {
  console.error('Failed to run Playwright:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}


import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

// Debug environment variables
console.log('[Config] Environment variables:');
console.log(`  HEADLESS: ${process.env.HEADLESS}`);
console.log(`  SECURE_MODE: ${process.env.SECURE_MODE}`);
console.log(`  MINIMIZED: ${process.env.MINIMIZED}`);

const baseURL = process.env.BASE_URL || 'http://localhost:3000';
const storageStatePath = path.resolve(__dirname, 'storage', 'auth.json');
const downloadDir = path.resolve(
	__dirname,
	process.env.DOWNLOAD_DIR || 'downloads'
);


fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });
fs.mkdirSync(downloadDir, { recursive: true });

export default defineConfig({
	testDir: './tests',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: [
		['list'],
		['html', { outputFolder: 'playwright-report', open: 'never' }],
	],
	use: {
		baseURL,
		trace: 'on-first-retry',
		video: 'retain-on-failure',
		screenshot: 'only-on-failure',
		acceptDownloads: true,
		ignoreHTTPSErrors: true,
	},
	projects: [
		{
			name: 'setup',
			testMatch: /auth\.setup\.spec\.ts/,
			use: { 
				baseURL, 
				channel: 'chrome',
				viewport: { width: 1920, height: 1080 },
				userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
				// Use persistent context to emulate a real profile
				// userDataDir is not a valid 'use' property; set via launchOptions under chromium
				launchOptions: {
					ignoreDefaultArgs: ['--enable-automation'],
					args: [
						'--disable-blink-features=AutomationControlled',
						'--window-size=1920,1080',
						'--window-position=-2400,-2400', // Start window off-screen
						'--no-first-run',
						'--no-default-browser-check',
						// Minimal args to reduce detection
					],
					// Use headless mode if requested
					headless: process.env.HEADLESS === 'true' || process.env.SECURE_MODE === 'true',
				}
			},
		},
		{
			name: 'setup-headed',
			testMatch: /auth\.setup\.headed\.spec\.ts/,
			use: {
				baseURL,
				channel: 'chrome',
				viewport: { width: 1920, height: 1080 },
				userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
				launchOptions: {
					args: [
						'--window-size=1920,1080',
						'--start-maximized',
						'--disable-blink-features=AutomationControlled',
						'--disable-features=IsolateOrigins,site-per-process',
						'--disable-site-isolation-trials',
					],
					ignoreDefaultArgs: ['--enable-automation'],
					headless: false,
				}
			},
		},
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'], baseURL, storageState: storageStatePath },
			dependencies: ['setup'],
		},
		{
			name: 'firefox',
			use: { ...devices['Desktop Firefox'], baseURL, storageState: storageStatePath },
			dependencies: ['setup'],
		},
		{
			name: 'webkit',
			use: { ...devices['Desktop Safari'], baseURL, storageState: storageStatePath },
			dependencies: ['setup'],
		},
	],
	outputDir: 'test-results',
});



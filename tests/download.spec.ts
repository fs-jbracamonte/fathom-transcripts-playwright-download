import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { env } from '../utils/env';

test.describe('data download', () => {
	test('navigate and download file', async ({ page, context }) => {
		await page.goto(env.baseURL + env.dataPagePath);

		const targetDownloadDir = env.downloadDir;
		fs.mkdirSync(targetDownloadDir, { recursive: true });
		await context.setDefaultNavigationTimeout(45_000);

		// Example: Navigate to the page/button that triggers a download.
		// Replace selectors below with real ones from your site.
		await page.getByRole('link', { name: /data|reports|downloads/i }).click();
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.getByRole('button', { name: /export|download/i }).click(),
		]);

		const suggestedName = download.suggestedFilename();
		const savePath = path.resolve(targetDownloadDir, suggestedName);
		await download.saveAs(savePath);

		// Assert the file exists and is non-empty
		const stats = fs.statSync(savePath);
		expect(stats.size).toBeGreaterThan(0);
	});
});



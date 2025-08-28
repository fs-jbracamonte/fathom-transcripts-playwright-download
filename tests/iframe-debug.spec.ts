import { test } from '@playwright/test';
import { env } from '../utils/env';

test.describe('iframe debug', () => {
	test('inspect iframe SSO buttons', async ({ page }) => {
		test.setTimeout(60_000);
		
		const targetUrl = env.baseURL + env.loginPath;
		console.info(`[iframe-debug] Navigating to: ${targetUrl}`);
		
		await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
		console.info(`[iframe-debug] Current URL: ${page.url()}`);
		
		// Wait for page to stabilize
		await page.waitForTimeout(3000);
		
		// Check all iframes
		const iframes = await page.locator('iframe').all();
		console.info(`[iframe-debug] Found ${iframes.length} iframe(s)`);
		
		if (iframes.length === 0) {
			console.info('[iframe-debug] No iframes found on page');
			return;
		}
		
		for (let i = 0; i < iframes.length; i++) {
			const iframe = iframes[i];
			const src = await iframe.getAttribute('src');
			const id = await iframe.getAttribute('id');
			const name = await iframe.getAttribute('name');
			const className = await iframe.getAttribute('class');
			
			console.info(`[iframe-debug] Iframe ${i}:`);
			console.info(`  - src: ${src}`);
			console.info(`  - id: ${id}`);
			console.info(`  - name: ${name}`);
			console.info(`  - class: ${className}`);
			
			// Get frame dimensions
			const box = await iframe.boundingBox();
			if (box) {
				console.info(`  - dimensions: ${box.width}x${box.height} at (${box.x}, ${box.y})`);
			}
			
			// Try to access frame content
			const frame = await iframe.contentFrame();
			if (!frame) {
				console.info(`  - Cannot access frame content (likely cross-origin)`);
				continue;
			}
			
			console.info(`  - Frame content is accessible`);
			
			// Look for buttons in the frame
			const buttons = await frame.evaluate(() => {
				const btns = [];
				document.querySelectorAll('button, [role="button"], div[onclick], a').forEach((el) => {
					const text = el.textContent?.trim();
					if (text && text.length > 0) {
						btns.push({
							tag: el.tagName.toLowerCase(),
							text: text.substring(0, 50),
							hasGoogle: text.toLowerCase().includes('google'),
							hasMicrosoft: text.toLowerCase().includes('microsoft'),
							className: el.className,
							id: el.id,
						});
					}
				});
				return btns;
			});
			
			if (buttons.length > 0) {
				console.info(`  - Found ${buttons.length} clickable elements in frame:`);
				buttons.forEach(btn => {
					if (btn.hasGoogle || btn.hasMicrosoft) {
						console.info(`    *** SSO: ${btn.tag} "${btn.text}" (id: ${btn.id}, class: ${btn.className})`);
					} else {
						console.info(`    - ${btn.tag}: "${btn.text}"`);
					}
				});
			}
			
			// Try to click Google button if found
			const googleButton = frame.locator('button:has-text("Google"), [role="button"]:has-text("Google"), div:has-text("Google")[onclick]').first();
			const googleCount = await googleButton.count();
			
			if (googleCount > 0) {
				console.info(`  - Found Google button in iframe!`);
				
				try {
					// Check button state
					const isVisible = await googleButton.isVisible({ timeout: 1000 });
					const isEnabled = await googleButton.isEnabled({ timeout: 1000 });
					const text = await googleButton.textContent();
					
					console.info(`    - visible: ${isVisible}`);
					console.info(`    - enabled: ${isEnabled}`);
					console.info(`    - text: "${text?.trim()}"`);
					
					// Get computed styles
					const styles = await googleButton.evaluate(el => {
						const computed = window.getComputedStyle(el);
						return {
							display: computed.display,
							visibility: computed.visibility,
							pointerEvents: computed.pointerEvents,
							cursor: computed.cursor,
						};
					});
					console.info(`    - styles: ${JSON.stringify(styles)}`);
					
					// Try clicking
					console.info(`    - Attempting to click...`);
					
					// Set up popup listener
					const popupPromise = page.waitForEvent('popup', { timeout: 3000 }).catch(() => null);
					
					await googleButton.click({ timeout: 5000 });
					console.info(`    - Click successful!`);
					
					// Check for popup or navigation
					const popup = await popupPromise;
					if (popup) {
						console.info(`    - Popup opened! URL: ${popup.url()}`);
						await popup.close();
					} else {
						console.info(`    - No popup detected, checking for navigation...`);
						await page.waitForTimeout(2000);
						const newUrl = page.url();
						if (newUrl !== targetUrl) {
							console.info(`    - Navigated to: ${newUrl}`);
						} else {
							console.info(`    - No navigation occurred`);
						}
					}
					
				} catch (e) {
					console.error(`    - Failed to interact with Google button: ${e}`);
				}
			}
		}
		
		// Take screenshots
		await page.screenshot({ path: 'iframe-debug-full.png', fullPage: true });
		console.info('[iframe-debug] Full page screenshot saved as iframe-debug-full.png');
		
		// Also try the main page buttons for comparison
		console.info('[iframe-debug] Checking main page for buttons...');
		const mainPageGoogle = await page.locator('button:has-text("Google")').count();
		const mainPageMicrosoft = await page.locator('button:has-text("Microsoft")').count();
		console.info(`  - Google buttons in main page: ${mainPageGoogle}`);
		console.info(`  - Microsoft buttons in main page: ${mainPageMicrosoft}`);
		
		console.info('[iframe-debug] Debug complete');
	});
});

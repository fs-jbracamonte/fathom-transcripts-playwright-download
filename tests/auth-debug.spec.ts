import { test } from '@playwright/test';
import { env } from '../utils/env';

test.describe('auth debug', () => {
	test('diagnose login page', async ({ page }) => {
		test.setTimeout(60_000);
		
		const targetUrl = env.baseURL + env.loginPath;
		console.info(`[debug] Navigating to: ${targetUrl}`);
		
		// Navigate with full logging
		await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
		console.info(`[debug] Current URL: ${page.url()}`);
		
		// Wait for page to stabilize
		await page.waitForTimeout(3000);
		
		// Take a screenshot
		await page.screenshot({ path: 'login-page.png', fullPage: true });
		console.info('[debug] Screenshot saved as login-page.png');
		
		// Check for iframes
		const iframeCount = await page.locator('iframe').count();
		console.info(`[debug] Number of iframes: ${iframeCount}`);
		
		if (iframeCount > 0) {
			for (let i = 0; i < iframeCount; i++) {
				const iframe = page.locator('iframe').nth(i);
				const src = await iframe.getAttribute('src');
				const name = await iframe.getAttribute('name');
				console.info(`[debug] Iframe ${i}: src="${src}", name="${name}"`);
			}
		}
		
		// Find all buttons and links with "Google" text
		const googleElements = await page.evaluate(() => {
			const elements = [];
			
			// Check all buttons
			document.querySelectorAll('button').forEach((btn, index) => {
				if (btn.textContent?.toLowerCase().includes('google')) {
					elements.push({
						type: 'button',
						index,
						text: btn.textContent?.trim(),
						visible: btn.offsetParent !== null,
						disabled: btn.disabled,
						onclick: !!btn.onclick,
						listeners: !!btn._listeners,
						className: btn.className,
						id: btn.id,
					});
				}
			});
			
			// Check all links
			document.querySelectorAll('a').forEach((link, index) => {
				if (link.textContent?.toLowerCase().includes('google') || 
					link.href?.includes('google')) {
					elements.push({
						type: 'link',
						index,
						text: link.textContent?.trim(),
						href: link.href,
						visible: link.offsetParent !== null,
						className: link.className,
						id: link.id,
					});
				}
			});
			
			// Check divs with role="button"
			document.querySelectorAll('[role="button"]').forEach((div, index) => {
				if (div.textContent?.toLowerCase().includes('google')) {
					elements.push({
						type: 'role-button',
						index,
						text: div.textContent?.trim(),
						visible: (div as HTMLElement).offsetParent !== null,
						className: div.className,
						id: div.id,
					});
				}
			});
			
			// Check for any element with onclick containing 'google'
			document.querySelectorAll('*').forEach((el) => {
				const onclick = el.getAttribute('onclick');
				if (onclick?.toLowerCase().includes('google')) {
					elements.push({
						type: el.tagName.toLowerCase(),
						text: el.textContent?.trim()?.substring(0, 50),
						onclick: onclick.substring(0, 100),
						className: el.className,
						id: el.id,
					});
				}
			});
			
			return elements;
		});
		
		console.info('[debug] Found Google-related elements:');
		googleElements.forEach(el => {
			console.info(`[debug]   - ${JSON.stringify(el)}`);
		});
		
		// Try to find the Google button using various selectors
		const selectors = [
			'button:has-text("Google")',
			'[role="button"]:has-text("Google")',
			'button:has-text("Sign in with Google")',
			'button:has-text("Continue with Google")',
			'a:has-text("Google")',
			'button[aria-label*="Google"]',
			'div:has-text("Google")[onclick]',
			'*[onclick*="google"]',
		];
		
		console.info('[debug] Testing selectors:');
		for (const selector of selectors) {
			try {
				const count = await page.locator(selector).count();
				if (count > 0) {
					const firstElement = page.locator(selector).first();
					const isVisible = await firstElement.isVisible({ timeout: 1000 }).catch(() => false);
					const text = await firstElement.textContent({ timeout: 1000 }).catch(() => 'N/A');
					console.info(`[debug]   ✓ "${selector}": found ${count}, visible=${isVisible}, text="${text?.trim()}"`);
				} else {
					console.info(`[debug]   ✗ "${selector}": not found`);
				}
			} catch (e) {
				console.info(`[debug]   ✗ "${selector}": error - ${e}`);
			}
		}
		
		// Check page readiness
		const readyState = await page.evaluate(() => document.readyState);
		console.info(`[debug] Document ready state: ${readyState}`);
		
		// Check for any JavaScript errors on the page
		page.on('console', msg => {
			if (msg.type() === 'error') {
				console.error(`[debug] Console error: ${msg.text()}`);
			}
		});
		
		// Wait and see if anything changes
		console.info('[debug] Waiting 5 seconds to see if page updates...');
		await page.waitForTimeout(5000);
		
		// Check again for Google buttons
		const googleButtonsAfter = await page.locator('button:has-text("Google")').count();
		console.info(`[debug] Google buttons after wait: ${googleButtonsAfter}`);
		
		// Try to click the Google button if found
		if (googleButtonsAfter > 0) {
			console.info('[debug] Attempting to click Google button...');
			const btn = page.locator('button:has-text("Google")').first();
			
			try {
				// Check button state
				const isEnabled = await btn.isEnabled();
				const isVisible = await btn.isVisible();
				const isEditable = await btn.isEditable().catch(() => false);
				console.info(`[debug] Button state: enabled=${isEnabled}, visible=${isVisible}, editable=${isEditable}`);
				
				// Get computed styles
				const styles = await btn.evaluate(el => {
					const computed = window.getComputedStyle(el);
					return {
						display: computed.display,
						visibility: computed.visibility,
						pointerEvents: computed.pointerEvents,
						position: computed.position,
						zIndex: computed.zIndex,
					};
				});
				console.info(`[debug] Button styles: ${JSON.stringify(styles)}`);
				
				// Try clicking
				await btn.click({ timeout: 5000 });
				console.info('[debug] Button clicked successfully!');
				
				// Wait to see what happens
				await page.waitForTimeout(3000);
				console.info(`[debug] URL after click: ${page.url()}`);
				
				// Check for popups
				const pages = page.context().pages();
				console.info(`[debug] Number of pages/tabs: ${pages.length}`);
				
			} catch (e) {
				console.error(`[debug] Failed to click button: ${e}`);
				await page.screenshot({ path: 'click-error.png' });
			}
		}
		
		console.info('[debug] Diagnostic complete');
	});
});

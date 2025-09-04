import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { env } from '../utils/env';

const storageStatePath = path.resolve(__dirname, '..', 'storage', 'auth.json');

// Get transcript path from environment or use default
const getTranscriptPath = () => {
	const customPath = process.env.TRANSCRIPT_PATH;
	if (customPath && customPath.trim()) {
		return customPath;
	}
	return path.join(__dirname, '..', 'transcripts');
};

test.describe('auth setup', () => {
	test('login and save storage state', async ({ page, context }) => {
		// Setup flows can be slow; extend the overall test timeout
		test.setTimeout(900_000);
		
		// Minimize window if requested (only in headed mode)
		if (env.minimized && !env.headless) {
			try {
				// Move window off-screen instead of making it tiny
				await page.evaluate(() => {
					window.moveTo(-2000, -2000);
				});
			} catch {
				// Some browsers may block window manipulation
				// This is fine, the window will just stay visible
			}
		}
		
		// Configure timeouts
		const targetUrl = env.baseURL + env.loginPath;
		await page.setDefaultNavigationTimeout(env.navTimeoutMs);
		await page.setDefaultTimeout(env.detectTimeoutMs);

		// Minimal stealth approach - only mask the most obvious automation indicator
		// The new headless mode should handle most detection issues
		if (env.headless) {
			await page.addInitScript(() => {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				Object.defineProperty(navigator, 'webdriver', { get: () => false });
			});
		}

		// Navigate to login page
		console.log(`[Auth] Navigating to login page...`);
		try {
			await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
			
			// Wait for the page to be fully interactive
			await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
		} catch (e) {
			console.error(`[Auth] Navigation failed: ${String(e)}`);
			throw e;
		}



		// Define selectors for authentication buttons
		const googleSsoButton = page.locator(
			'button:has-text("Google"), ' +
			'button.chakra-button:has-text("Google"), ' +
			'button[type="button"]:has-text("Google"), ' +
			'[role="button"]:has-text("Google")'
		);
		
		const microsoftSsoButton = page.locator(
			'button:has-text("Microsoft"), ' +
			'button.chakra-button:has-text("Microsoft"), ' +
			'button[type="button"]:has-text("Microsoft"), ' +
			'[role="button"]:has-text("Microsoft")'
		);
		
		const passwordEmailInput = page.locator('input[name="email"], input[type="email"]');
		
		// Wait for page to stabilize
		await page.waitForTimeout(2000);
		await page.waitForLoadState('domcontentloaded');

		const waitTimeout = env.detectTimeoutMs;
		// Bounded readiness check (attached), then we scroll-to-view before clicking
		const [googleReady, msReady] = await Promise.all([
			googleSsoButton.first().waitFor({ state: 'attached', timeout: waitTimeout }).then(() => true).catch(() => false),
			microsoftSsoButton.first().waitFor({ state: 'attached', timeout: waitTimeout }).then(() => true).catch(() => false),
		]);
		console.info(`[auth] provider=${env.authProvider} visible: google=${googleReady} microsoft=${msReady}`);

		const wantGoogle = env.authProvider === 'google' || env.authProvider === 'auto';
		const wantMicrosoft = env.authProvider === 'microsoft' || env.authProvider === 'auto';

		if (wantGoogle && googleReady) {
		console.info('[auth] Attempting Google SSO login...');
		
		// Get the first Google button
			const btn = googleSsoButton.first();
		
		// Debug: Check button properties
		const boundingBox = await btn.boundingBox().catch(() => null);
		console.info(`[auth] Button bounding box:`, boundingBox);
		
		const isEnabled = await btn.isEnabled().catch(() => false);
		console.info(`[auth] Button is enabled: ${isEnabled}`);
		
		// Ensure button is clickable
		try {
			// Check initial visibility
			const isVisible = await btn.isVisible({ timeout: 1000 }).catch(() => false);
			console.info(`[auth] Button initial visibility: ${isVisible}`);
			
			if (!isVisible) {
				console.info('[auth] Button not immediately visible, trying to scroll into view...');
				await btn.scrollIntoViewIfNeeded({ timeout: 5000 }).catch((e) => {
					console.info(`[auth] Scroll failed: ${e.message}`);
				});
			}
			
			// Try waiting for attached state first (less strict than visible)
			await btn.waitFor({ state: 'attached', timeout: 5000 });
		} catch (e) {
			console.error('[Auth] Failed to find Google SSO button');
			await page.screenshot({ path: 'google-button-error.png', fullPage: true });
			throw new Error('Google SSO button not accessible');
		}

		// Click the button and handle both popup and redirect scenarios
		let target = page;
		try {
			// Set up popup listener before clicking
			const popupPromise = page.waitForEvent('popup').catch(() => null);
			
			console.log('[Auth] Clicking Google SSO button...');
			
			// Try different click strategies
			let clicked = false;
			
			try {
				// First try a normal click
				await btn.click({ timeout: 5000 });
				clicked = true;
							} catch (clickError) {
					try {
						// If normal click fails, try force click
						await btn.click({ force: true, timeout: 5000 });
						clicked = true;
					} catch (forceClickError) {
					// As last resort, try JavaScript click
					await page.evaluate(() => {
											const buttons = Array.from(document.querySelectorAll('button'));
					const googleButton = buttons.find(btn => {
						const text = btn.textContent?.trim();
						return text?.toLowerCase().includes('google') || 
						       text === 'Google' ||
						       btn.getAttribute('aria-label')?.toLowerCase().includes('google');
					});
						if (googleButton) {
							(googleButton as HTMLElement).click();
							return true;
						}
						throw new Error('Could not find Google button via JavaScript');
					});
					clicked = true;
				}
			}
				
				if (!clicked) {
					throw new Error('Failed to click Google SSO button with any method');
				}
				
				// Resolve target as popup if present, else stay on current page
				const popup = await page.waitForEvent('popup', { timeout: 10000 }).catch(() => null);
				const redirected = await page
					.waitForURL((url) => /accounts\.google\.com|google\.com\/signin/i.test(url.href), { timeout: 15000 })
					.then(() => page)
					.catch(() => null);
				const maybeTarget = popup ?? redirected ?? page;
				await maybeTarget.waitForLoadState('domcontentloaded').catch(() => {});
				target = maybeTarget;
			} catch (e) {
				console.error('[Auth] Failed to handle Google SSO:', e);
				throw e;
			}

		// Handle Google login flow
		try {
			// Check for unsafe browser warning
			const unsafeWarning = target.locator('text=/this browser.*not secure|unsafe browser|browser.*isn.*secure/i').first();
			const hasWarning = await unsafeWarning.isVisible({ timeout: 2000 }).catch(() => false);
			
							if (hasWarning) {
				// Try to find and click continue/advanced button
				const continueOptions = [
					target.locator('button:has-text("Advanced")'),
					target.locator('a:has-text("Advanced")'),
					target.locator('text="Advanced"'),
					target.locator('button:has-text("Continue")'),
					target.locator('button:has-text("I understand the risks")')
				];
				
				let clickedAdvanced = false;
									for (const option of continueOptions) {
					const isVisible = await option.isVisible({ timeout: 1000 }).catch(() => false);
					if (isVisible) {
						await option.click();
						clickedAdvanced = true;
						await target.waitForTimeout(1000);
						break;
					}
				}
				
				if (clickedAdvanced) {
					// After clicking Advanced, look for "Proceed" or "Go to" link
					const proceedOptions = [
						target.locator('a:has-text("Proceed to accounts.google.com")'),
						target.locator('a:has-text("Go to accounts.google.com")'),
						target.locator('text=/Proceed.*unsafe|Continue.*unsafe/i'),
						target.locator('a[id*="proceed"]')
					];
					
											for (const proceed of proceedOptions) {
						const isVisible = await proceed.isVisible({ timeout: 1000 }).catch(() => false);
						if (isVisible) {
							await proceed.click();
							await target.waitForTimeout(2000);
							break;
						}
					}
				}
			}
			
			// Wait for page to stabilize
			await target.waitForTimeout(2000);
			
			// Try multiple email field selectors
			const emailSelectors = [
				'input#identifierId',
				'input[type="email"]',
				'input[name="identifier"]',
				'input[name="Email"]',
				'input[autocomplete*="username"]',
				'input[autocomplete="email"]'
			];
			
			let emailField = null;
			for (const selector of emailSelectors) {
				try {
					const field = target.locator(selector).first();
					const isVisible = await field.isVisible({ timeout: 1000 }).catch(() => false);
					if (isVisible) {
						emailField = field;
						break;
					}
				} catch (e) {
					// Try next selector
				}
			}
			
			if (!emailField) {
				// Take screenshot if we can't find email field
				await target.screenshot({ path: 'google-email-page.png' });
				throw new Error('Could not find email field. Screenshot saved to google-email-page.png');
			}
			
			await emailField.click(); // Click to focus
			await emailField.fill(env.username);
			// Mask email in secure mode for demos
			const displayEmail = env.secureMode 
				? env.username.replace(/^(.{2}).*(@.*)$/, '$1****$2')
				: env.username;
			console.log(`[Auth] Logging in as: ${displayEmail}`);
			
			// Click Next button after email
			const nextButton = target.locator('button:has-text("Next"), div[role="button"]:has-text("Next"), span:has-text("Next")').first();
			await nextButton.click();
			
			// Wait for navigation/page change
			await target.waitForTimeout(2000);
			
			// Check for account selection screen (Google sometimes shows this)
			const accountSelector = target.locator(`div[data-identifier="${env.username}"], div:has-text("${env.username}")`).first();
			const hasAccountSelector = await accountSelector.isVisible({ timeout: 1000 }).catch(() => false);
			
			if (hasAccountSelector) {
				await accountSelector.click();
				await target.waitForTimeout(1000);
			}
			
			// Wait for password field with more flexible selectors
			
			// Try multiple password field selectors
			const passwordSelectors = [
				'input[type="password"]:visible',
				'input[type="password"]:not([aria-hidden="true"])',
				'input[name="password"]',
				'input[name="Passwd"]',
				'input[autocomplete="current-password"]',
				'#password input',
				'input[jsname="YPqjbf"]' // Google's specific jsname for password
			];
			
			let passwordField = null;
			for (const selector of passwordSelectors) {
				try {
					const field = target.locator(selector).first();
					const isVisible = await field.isVisible({ timeout: 1000 }).catch(() => false);
					if (isVisible) {
						passwordField = field;
						break;
					}
				} catch (e) {
					// Try next selector
				}
			}
			
			if (!passwordField) {
				// If no visible password field found, take a screenshot and try to find any password input
				await target.screenshot({ path: 'google-password-page.png' });
				console.error('[Auth] Password field not found');
				
				// Try to find any password input even if hidden
				passwordField = target.locator('input[type="password"]').first();
			}
			
			// Type password securely (less visible in demos)
			// Using pressSequentially with delay:0 to type instantly but less visibly
			await passwordField.click(); // Focus the field first
			await passwordField.pressSequentially(env.password, { delay: 0 });
			
			// Click Sign In button - Google may use different text
			const signInButton = target.locator(
				'button:has-text("Next"), ' +
				'div[role="button"]:has-text("Next"), ' +
				'button:has-text("Sign in"), ' +
				'button:has-text("Continue"), ' +
				'span:has-text("Next")'
			).first();
			
			await signInButton.click();
			
			// Wait a bit for the page to load
			await target.waitForTimeout(3000);
			
			// Check for 2FA/verification screens
			const twoFactorSelectors = [
				'text=/verify|verification|two-step|2-step|confirm.*identity|authenticate/i',
				'text=/get.*code|enter.*code|verification.*code/i',
				'text=/check.*phone|text.*message/i',
				'text=/authenticator.*app/i',
				'button:has-text("Try another way")',
				'div:has-text("2-Step Verification")',
				'div:has-text("Verify it\'s you")',
				'h1:has-text("2-Step Verification")',
				'[data-error-code="auth/requires-recent-login"]'
			];
			
			let has2FA = false;
						for (const selector of twoFactorSelectors) {
				try {
					const element = target.locator(selector).first();
					if (await element.isVisible({ timeout: 1000 }).catch(() => false)) {
						has2FA = true;
						break;
					}
				} catch (e) {
					// Try next selector
				}
			}
			
			if (has2FA) {
				console.log('\n================================================');
				console.log('📱 2FA VERIFICATION REQUIRED');
				console.log('================================================');
				console.log('Please complete the 2FA verification on your phone or authenticator app.');
				
				// In debug mode, pause for manual interaction
				if (process.env.PWDEBUG === '1' || process.env.PWDEBUG === 'console') {
					console.log('🔍 DEBUG MODE: Click "Resume" in the Playwright Inspector when ready');
					console.log('================================================\n');
					await page.pause(); // This will open the Playwright Inspector
				} else {
					console.log('The script will wait up to 3 minutes for you to complete it...');
					console.log('(Tip: Run with PWDEBUG=1 for debug mode with manual control)');
					console.log('================================================\n');
				}
				
				// Wait for user to complete 2FA - check for redirect to app
				const maxWaitTime = 180000; // 180 seconds (3 minutes)
				const checkInterval = 2000; // Check every 2 seconds
				const startTime = Date.now();
				
				while (Date.now() - startTime < maxWaitTime) {
					// Check if we've been redirected back to the app
					const currentUrl = target.url();
					
					if (currentUrl.includes(env.baseURL)) {
						console.info('[auth] 2FA completed successfully! Redirected to app.');
						break;
					}
					
					// Check if we're on a success page or different domain
					if (!currentUrl.includes('accounts.google.com') && !currentUrl.includes('google.com/signin')) {
						console.info('[auth] 2FA appears to be completed, proceeding...');
						break;
					}
					
					// Also check for any success indicators
					const successIndicators = [
						'text=/success|approved|verified/i',
						'text=/you\'re all set/i'
					];
					
					for (const indicator of successIndicators) {
						if (await target.locator(indicator).isVisible({ timeout: 500 }).catch(() => false)) {
							console.info('[auth] 2FA success indicator found');
							break;
						}
					}
					
					await target.waitForTimeout(checkInterval);
					const elapsed = Math.floor((Date.now() - startTime) / 1000);
					if (elapsed % 10 === 0) { // Log every 10 seconds
						console.info(`[auth] Waiting for 2FA completion... (${elapsed}s / ${maxWaitTime/1000}s)`);
					}
				}
				
				if (Date.now() - startTime >= maxWaitTime) {
					throw new Error('Timeout waiting for 2FA completion (3 minutes). Try running with PWDEBUG=1 for manual control.');
				}
			}
			
			// Wait for redirect back to the app
			if (target !== page) {
				// If using popup, wait for it to close
				await page.waitForLoadState('networkidle').catch(() => {
					console.info('[auth] Network not idle, continuing...');
				});
				console.info('[auth] Popup flow completed');
			} else {
				// If using redirect, wait for navigation back to app
				await page.waitForURL((url) => url.href.includes(env.baseURL), { timeout: 15000 }).catch(() => {
					console.info('[auth] Still on Google page, checking for additional steps...');
				});
				console.info('[auth] Redirect flow completed');
			}
		} catch (e) {
			console.error('[auth] Failed during Google login flow:', e);
			// Take a screenshot for debugging
			await target.screenshot({ path: 'google-sso-error.png' });
			throw e;
		}
		} else if (wantMicrosoft && msReady) {
			const btn = microsoftSsoButton.first();
			await btn.scrollIntoViewIfNeeded().catch(() => {});
			await btn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
			const popupPromise = page.waitForEvent('popup', { timeout: waitTimeout }).catch(() => null);
			await btn.click({ timeout: waitTimeout, force: true }).catch(() => {});
			const popup = await popupPromise;
			const target = popup ?? page;
			await target.waitForLoadState('domcontentloaded').catch(() => {});

			// Microsoft SSO typical selectors
			await target.locator('input[type="email"], input[name="loginfmt"]').fill(env.username);
			await Promise.all([
				target.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {}),
				target.getByRole('button', { name: /next|sign in/i }).click(),
			]);
			await target.locator('input[type="password"]').fill(env.password);
			await Promise.all([
				target.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}),
				target.getByRole('button', { name: /sign in|next/i }).click(),
			]);

			// Optional: handle "Stay signed in"
			const staySignedIn = target.getByRole('button', { name: /^yes$/i });
			if (await staySignedIn.isVisible().catch(() => false)) {
				await staySignedIn.click();
			}

			await page.waitForLoadState('networkidle').catch(() => {});
		} else {
			await page.locator('input[name="email"]').fill(env.username);
			await page.locator('button[type="submit"]', { hasText: /log in/i }).click();
			await page.waitForSelector('input[name="password"]', { state: 'visible' });
			await page.locator('input[name="password"]').fill(env.password);
			await Promise.all([
				page.waitForNavigation({ waitUntil: 'networkidle' }),
				page.getByRole('button', { name: /sign in|log in|login|submit/i }).click(),
			]);
		}

		await expect(page).toHaveURL(new RegExp(env.baseURL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

		// Check if scrolling is disabled
		if (env.skipScroll) {
			console.info('[auth] Scrolling disabled (SKIP_SCROLL=true), saving auth state without scrolling...');
		} else {
			// Ensure we're actually on the meetings page and ready to scroll
			console.info('[auth] Waiting for page to be ready for scrolling...');
			
			// Use timeout to prevent infinite waiting
			await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
				console.info('[auth] Page has continuous network activity, proceeding anyway...');
			});
			
			// Alternative: wait for DOM to be ready
			await page.waitForLoadState('domcontentloaded');
			
			// Give the page a moment to render
			await page.waitForTimeout(2000);
			
			// Check if we need to manually pause in debug mode for scrolling
			if (process.env.PWDEBUG === '1' || process.env.PWDEBUG === 'console') {
				console.log('\n================================================');
				console.log('🖱️ DEBUG MODE: Ready to scroll for meetings');
				console.log('The script will now automatically scroll to load all meetings.');
				console.log('Click "Resume" in the Inspector to start automatic scrolling.');
				console.log('================================================\n');
				await page.pause(); // Pause to let user see the meetings page
			}

			// Scroll to load all dynamically generated meetings
			console.log('[Auth] Loading all meetings by scrolling...');
			
			// Check if page is scrollable
			const pageInfo = await page.evaluate(() => {
				return {
					scrollHeight: document.documentElement.scrollHeight,
					clientHeight: document.documentElement.clientHeight,
					isScrollable: document.documentElement.scrollHeight > document.documentElement.clientHeight,
					currentScroll: window.pageYOffset || document.documentElement.scrollTop
				};
			});
			

			
			// Wait for initial meetings to load
			console.info('[auth] Waiting for initial meetings to load...');
			try {
				// Wait for at least one meeting link to appear
				await page.waitForSelector('a[href*="fathom.video/calls/"]', { timeout: 10000 });
				console.info('[auth] Initial meetings detected, waiting for page to stabilize...');
				await page.waitForTimeout(3000); // Give time for more meetings to load
			} catch (e) {
				console.warn('[auth] No meetings found initially, will try scrolling anyway...');
			}
			

			
			// Visual indicator that scrolling is starting
			await page.evaluate(() => {
				// Create a temporary visual indicator
				const indicator = document.createElement('div');
				indicator.id = 'scroll-indicator';
				indicator.innerHTML = '📜 Loading all meetings by scrolling...';
				indicator.style.cssText = `
					position: fixed;
					top: 20px;
					right: 20px;
					background: #4CAF50;
					color: white;
					padding: 15px 25px;
					border-radius: 8px;
					font-size: 16px;
					font-weight: bold;
					z-index: 999999;
					box-shadow: 0 4px 6px rgba(0,0,0,0.2);
					animation: pulse 1s infinite;
				`;
				document.body.appendChild(indicator);
				
				// Add pulse animation
				const style = document.createElement('style');
				style.textContent = `
					@keyframes pulse {
						0% { transform: scale(1); }
						50% { transform: scale(1.05); }
						100% { transform: scale(1); }
					}
				`;
				document.head.appendChild(style);
			});
			
			// Function to scroll and load all content (aligned with headed logic)
			const scrollToLoadAll = async () => {
				let previousHeight = 0;
				let currentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
				let previousMeetingCount = 0;
				let currentMeetingCount = await page.evaluate(() => document.querySelectorAll('a[href*="fathom.video/calls/"]').length);
				let scrollAttempts = 0;
				const maxScrollAttempts = 60; // increased
				let noNewContentCount = 0;
				const maxNoNewContent = 5; // a bit more patience
				
				console.info('');
				console.info('[auth] Starting scroll to load all meetings...');
				console.info(`[auth] Initial state: ${currentMeetingCount} meetings visible, page height: ${currentHeight}px`);
				
				await page.evaluate(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); });
				await page.waitForTimeout(1000);
				while (scrollAttempts < maxScrollAttempts && noNewContentCount < maxNoNewContent) {
					scrollAttempts++;
					previousHeight = currentHeight;
					previousMeetingCount = currentMeetingCount;
					
					await page.evaluate(({ attempt, meetingCount }: { attempt: number, meetingCount: number }) => {
						const indicator = document.getElementById('scroll-indicator');
						if (indicator) (indicator as HTMLElement).innerHTML = `📜 Scrolling... (Pass ${attempt}) - ${meetingCount} meetings found`;
					}, { attempt: scrollAttempts, meetingCount: currentMeetingCount });
					
					console.info(`[auth] Scroll attempt ${scrollAttempts}: ${currentMeetingCount} meetings, height ${currentHeight}px`);
					
					// Perform multiple scroll actions to trigger lazy loading
					await page.evaluate(() => { window.scrollTo(0, document.documentElement.scrollHeight); });
					await page.waitForTimeout(700);
					await page.evaluate(() => { const els = document.querySelectorAll('*'); if (els.length > 0) (els[els.length-1] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'end' }); });
					await page.waitForTimeout(500);
					await page.evaluate(() => { window.scrollTo(0, document.documentElement.scrollHeight + 1500); });
					await page.waitForTimeout(500);
					await page.evaluate(() => { window.dispatchEvent(new Event('scroll')); document.dispatchEvent(new Event('scroll')); });
					await page.keyboard.press('End');
					await page.waitForTimeout(500);
					await page.mouse.wheel(0, 1200);
					await page.waitForTimeout(2000);
					
					// Check for loading indicators
					const loadingIndicator = page.locator('[class*="loading"], [class*="spinner"], [class*="loader"], [data-testid*="loading"]').first();
					if (await loadingIndicator.isVisible().catch(() => false)) { 
						console.info('[auth] Waiting for loading indicator to disappear...'); 
						await loadingIndicator.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => { 
							console.info('[auth] Loader still visible, continuing...'); 
						}); 
					}
					
					// Update counts
					currentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
					currentMeetingCount = await page.evaluate(() => document.querySelectorAll('a[href*="fathom.video/calls/"]').length);
					
					// Check if we loaded new content (meetings or height)
					const newMeetingsFound = currentMeetingCount > previousMeetingCount;
					const newHeightAdded = currentHeight > previousHeight;
					
					if (newMeetingsFound || newHeightAdded) { 
						if (newMeetingsFound) {
							console.info(`[auth] ✅ Found ${currentMeetingCount - previousMeetingCount} new meetings (total: ${currentMeetingCount})`);
						}
						if (newHeightAdded) {
							console.info(`[auth] ✅ Page grew by ${currentHeight - previousHeight}px`);
						}
						noNewContentCount = 0; 
					} else { 
						noNewContentCount++; 
						console.info(`[auth] No new content (streak ${noNewContentCount}/${maxNoNewContent}) - Still at ${currentMeetingCount} meetings`); 
					}
				}
				if (noNewContentCount >= maxNoNewContent) console.info(`[auth] Stopped: No new content after ${maxNoNewContent} attempts`);
				else if (scrollAttempts >= maxScrollAttempts) console.info(`[auth] Stopped: Reached maximum attempts (${maxScrollAttempts})`);
				await page.evaluate(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); });
				await page.waitForTimeout(500);
				await page.evaluate(() => { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }); });
				await page.waitForTimeout(1000);
				const meetingLinks = await page.evaluate(() => {
					const links = document.querySelectorAll('a[href*="fathom.video/calls/"]');
					const uniqueLinks = new Set<string>();
					links.forEach(link => { const href = (link as HTMLAnchorElement).href; if (href && href.includes('fathom.video/calls/')) uniqueLinks.add(href); });
					return Array.from(uniqueLinks);
				});
				// Update final count on indicator
				await page.evaluate((count) => {
					const indicator = document.getElementById('scroll-indicator');
					if (indicator) {
						if (count > 0) { 
							indicator.innerHTML = `✅ Found ${count} meeting(s)!`; 
							(indicator as HTMLElement).style.background = '#4CAF50'; 
						} else { 
							indicator.innerHTML = `✅ Scrolling complete!`; 
							(indicator as HTMLElement).style.background = '#2196F3'; 
						}
					}
				}, meetingLinks.length);
				await page.waitForTimeout(2000);
				await page.evaluate(() => { const indicator = document.getElementById('scroll-indicator'); if (indicator) { (indicator as HTMLElement).style.transition = 'opacity 1s ease-out'; (indicator as HTMLElement).style.opacity = '0'; setTimeout(() => indicator.remove(), 1000); } });
				return meetingLinks;
			}
			
			let allMeetingLinks: string[] = [];
			
			try {
				allMeetingLinks = await scrollToLoadAll();
			} catch (error) {
				console.warn('[auth] Error during scrolling:', error);
				console.info('[auth] Continuing with authentication despite scroll error...');
				// Remove indicator on error
				await page.evaluate(() => {
					const indicator = document.getElementById('scroll-indicator');
					if (indicator) indicator.remove();
				});
			}
			
			// Log total meetings found
			console.info('');
			console.info('================================================');
			console.info(`📊 MEETING DISCOVERY COMPLETE`);
			console.info(`Found ${allMeetingLinks.length} total meetings on the page`);
			if (process.env.TRANSCRIPT_PATH) {
				console.info(`Transcripts will be saved to: ${getTranscriptPath()}`);
			}
			console.info('================================================');
			console.info('');
			
			// Visit each meeting page if configured to do so
			const maxMeetingsToVisit = Number(process.env.MAX_MEETINGS_TO_VISIT || '0');
			const shouldVisitMeetings = maxMeetingsToVisit > 0 && allMeetingLinks.length > 0;
			
			if (shouldVisitMeetings) {
				const meetingsToVisit = allMeetingLinks.slice(0, maxMeetingsToVisit);
				console.info('================================================');
				console.info(`📊 VISITING ${meetingsToVisit.length} OUT OF ${allMeetingLinks.length} MEETINGS`);
				console.info('================================================');
				console.info('');
				
				// Track success and failures
				const extractionResults: { 
					successful: string[], 
					failed: { url: string, reason: string }[] 
				} = { 
					successful: [], 
					failed: [] 
				};
				
				for (let i = 0; i < meetingsToVisit.length; i++) {
					const meetingUrl = meetingsToVisit[i];
					const meetingId = meetingUrl.split('/').pop();
					
					console.info(`[auth] Visiting meeting ${i + 1}/${meetingsToVisit.length}: ${meetingId}`);
					
					try {
						// Navigate to the meeting page with retry logic for timeouts
						let pageLoaded = false;
						let pageLoadAttempts = 0;
						const maxPageLoadAttempts = 3;
						
						while (!pageLoaded && pageLoadAttempts < maxPageLoadAttempts) {
							try {
								if (pageLoadAttempts > 0) {
									console.info(`[auth] Retry ${pageLoadAttempts}/${maxPageLoadAttempts} for loading meeting page...`);
									// Refresh/reload the page on retry
									await page.waitForTimeout(2000); // Wait before retry
								}
								
								await page.goto(meetingUrl, { 
									waitUntil: 'domcontentloaded',
									timeout: 30000 
								});
								
								// Wait a bit for the page to load
								await page.waitForTimeout(3000);
								
								pageLoaded = true;
								console.info(`[auth] ✅ Successfully loaded meeting page ${meetingId}`);
							} catch (pageError: any) {
								pageLoadAttempts++;
								if (pageError.name === 'TimeoutError') {
									console.warn(`[auth] Timeout loading meeting page (attempt ${pageLoadAttempts}/${maxPageLoadAttempts}): ${pageError.message}`);
									if (pageLoadAttempts >= maxPageLoadAttempts) {
										throw new Error(`Failed to load meeting page after ${maxPageLoadAttempts} attempts due to timeout`);
									}
								} else {
									throw pageError; // Re-throw non-timeout errors
								}
							}

						}
						
						if (!pageLoaded) {
							throw new Error('Failed to load meeting page');
						}
						
						// Optional: Wait for specific elements that indicate the page loaded
						await page.waitForSelector('body', { timeout: 5000 }).catch(() => {
							console.info('[auth] Meeting page body not found, continuing...');
						});
						
						console.info(`[auth] ✅ Successfully visited meeting ${meetingId}`);
						
						// Extract meeting name and date
						let meetingName = 'Unknown Meeting';
						let meetingDate = 'Unknown Date';
						
						try {
							// Extract meeting name from the editable span
							meetingName = await page.locator('[data-video-call-chip-name] span[contenteditable="true"]')
								.textContent()
								.catch(() => 'Unknown Meeting') || 'Unknown Meeting';
							
							// Extract meeting date
							meetingDate = await page.locator('video-call-chip .text-small.font-medium.text-gray-90')
								.textContent()
								.catch(() => 'Unknown Date') || 'Unknown Date';
							
							console.info(`[auth] Meeting: "${meetingName}" - ${meetingDate}`);
						} catch (error) {
							console.warn('[auth] Could not extract meeting details:', error);
						}
						
						// Try to get transcript with retry logic
						let transcriptExtracted = false;
						let retryCount = 0;
						const maxRetries = 5; // Increased from 3 to 5 for better success rate
						const transcriptExtractionStartTime = Date.now();
						const maxTranscriptExtractionTime = 120000; // 2 minutes max per meeting
						
						while (!transcriptExtracted && retryCount < maxRetries) {
							// Check if we've exceeded the maximum time
							if (Date.now() - transcriptExtractionStartTime > maxTranscriptExtractionTime) {
								console.error(`[auth] Transcript extraction timeout after ${maxTranscriptExtractionTime/1000}s for meeting ${meetingId}`);
								break;
							}
							
							try {
								if (retryCount > 0) {
									console.info(`[auth] Retry attempt ${retryCount}/${maxRetries} for transcript extraction...`);
									// Wait longer between retries to avoid rate limiting
									await page.waitForTimeout(3000 + (retryCount * 1000)); // Incremental backoff
									
									// Reload the page for retry with timeout handling
									try {
										await page.goto(meetingUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
										await page.waitForTimeout(4000); // Give more time for page to stabilize
									} catch (reloadError: any) {
										console.warn(`[auth] Failed to reload page on retry ${retryCount}: ${reloadError.message}`);
										// Continue anyway to try extraction
									}
								}
								
								console.info('[auth] Looking for Transcript TAB to switch views...');
								
								// Store current URL to check if we're still on the same page
								const currentPageUrl = page.url();
								
															// Wait for the page to be fully interactive before looking for tabs
							await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
								console.info('[auth] Page has continuous network activity, proceeding...');
							});
							
							// STEP 1: Click on the Transcript TAB to switch to transcript view
							const transcriptTabSelectors = [
								// Look for tab elements specifically
								'[role="tab"]:has-text("Transcript")',
								'button[role="tab"]:has-text("Transcript")',
								'div[role="tab"]:has-text("Transcript")',
								'a[role="tab"]:has-text("Transcript")',
								// Look for unselected transcript tab
								'[aria-selected="false"]:has-text("Transcript")',
								// Generic tab selectors  
								'button:text-is("Transcript")',
								'.tab:has-text("Transcript")',
								'.tabs button:has-text("Transcript")',
								'nav button:has-text("Transcript")',
								// Data attributes
								'[data-tab="transcript"]',
								'[data-testid*="transcript-tab"]'
							];
								
								let transcriptTabFound = false;
								
								// Try to find and click the Transcript tab
								for (const selector of transcriptTabSelectors) {
									try {
										const tab = page.locator(selector).first();
										if (await tab.isVisible({ timeout: 1000 }).catch(() => false)) {
											// Check if tab is already selected
											const isSelected = await tab.getAttribute('aria-selected').catch(() => null);
											if (isSelected === 'true') {
												console.info('[auth] Transcript tab is already selected');
												transcriptTabFound = true;
												break;
											}
											
											console.info(`[auth] Found transcript tab with selector: ${selector}, clicking...`);
											await tab.click({ timeout: 5000 });
											transcriptTabFound = true;
											
											// Wait for tab content to switch
											console.info('[auth] Waiting for transcript content to load...');
											await page.waitForTimeout(3000);
											break;
										}
									} catch (e) {
										// Continue to next selector
									}
								}
								
								if (!transcriptTabFound) {
									console.warn('[auth] No Transcript tab found, page might already be showing transcript or has different layout');
								}
								
								// STEP 2: Now look for and click the "Copy Transcript" button
								console.info('[auth] Looking for Copy Transcript button...');
								
								// Try multiple copy button selectors
								const copyButtonSelectors = [
									'button:has-text("Copy Transcript")',
									'button:text-is("Copy Transcript")',
									'button[aria-label*="copy transcript" i]',
									'[role="button"]:has-text("Copy Transcript")',
									// Sometimes it might just say "Copy" when in transcript view
									'button:text-is("Copy")',
									'button[title*="Copy" i]',
									// Icon buttons with copy functionality
									'button[data-action="copy-transcript"]',
									'button[data-testid*="copy-transcript"]'
								];
								
								let copyButton = null;
								let copyButtonVisible = false;
								
								// Try multiple attempts to find the copy button
								let copyButtonSearchAttempts = 0;
								const maxCopyButtonAttempts = 3;
								
								while (!copyButtonVisible && copyButtonSearchAttempts < maxCopyButtonAttempts) {
									// Check if page is still valid
									try {
										await page.evaluate(() => true);
									} catch (e) {
										console.warn('[auth] Page no longer accessible, skipping copy button search');
										break;
									}
									
									for (const selector of copyButtonSelectors) {
										try {
											const button = page.locator(selector).first();
											if (await button.isVisible({ timeout: 1000 }).catch(() => false)) {
												copyButton = button;
												copyButtonVisible = true;
												console.info(`[auth] Found copy button with selector: ${selector}`);
												break;
											}
										} catch (e) {
											// Continue to next selector
										}
									}
									
									if (!copyButtonVisible) {
										copyButtonSearchAttempts++;
										if (copyButtonSearchAttempts < maxCopyButtonAttempts) {
											console.info(`[auth] Copy button not found yet, waiting... (attempt ${copyButtonSearchAttempts}/${maxCopyButtonAttempts})`);
											await page.waitForTimeout(2000);
										}
									}
								}
								
								let transcriptText = null;
								
								if (copyButtonVisible && copyButton) {
									console.info('[auth] Clicking Copy Transcript button...');
									
									// Set up clipboard read before clicking
									try {
										// Grant clipboard permissions
										await context.grantPermissions(['clipboard-read', 'clipboard-write']);
										
										// Wait for any loading overlays to disappear
										const loaderSelectors = [
											'ui-loader',
											'.loader',
											'.loading',
											'[class*="loading"]',
											'[class*="spinner"]',
											'[aria-busy="true"]'
										];
										
										for (const selector of loaderSelectors) {
											const loader = page.locator(selector).first();
											if (await loader.isVisible({ timeout: 500 }).catch(() => false)) {
												console.info(`[auth] Waiting for loader to disappear: ${selector}`);
												await loader.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {
													console.warn('[auth] Loader still visible after 10s, attempting click anyway');
												});
											}
										}
										
										// Click the copy button with force option to bypass any remaining overlays
										try {
											await copyButton.click({ force: true, timeout: 10000 });
										} catch (clickError: any) {
											console.warn('[auth] Failed to click copy button:', clickError.message);
											// Try alternative click method
											try {
												await page.evaluate((selector) => {
													const button = document.querySelector(selector);
													if (button) {
														(button as HTMLElement).click();
													}
												}, copyButtonSelectors[0]);
											} catch (e) {
												console.warn('[auth] Alternative click method also failed');
											}
										}
										
										await page.waitForTimeout(2000);
										
										// Prefer clipboard; if API is unavailable, fall back to DOM extraction
										const clipboardAvailable = await page.evaluate(() => !!(navigator && (navigator as any).clipboard)).catch(() => false);
										if (clipboardAvailable) {
											// Try to read from clipboard
											transcriptText = await page.evaluate(async () => {
												try {
													const text = await navigator.clipboard.readText();
													console.log('Clipboard text length:', text ? text.length : 0);
													return text;
												} catch (e) {
													console.error('Failed to read clipboard:', e);
													return null;
												}
											}).catch((error) => {
												console.warn('[auth] Could not read clipboard:', (error as any).message || error);
												return null;
											});
											
											// If clipboard read failed, check for success indicator
											if (!transcriptText) {
												console.info('[auth] Clipboard read failed, checking for success indicators...');
												const successToast = await page.locator('text=/copied|success/i').isVisible({ timeout: 2000 }).catch(() => false);
												if (successToast) {
													console.info('[auth] Copy success indicator found, but could not retrieve text from clipboard');
												}
											}
										} else {
											console.info('[auth] Clipboard API not available, attempting DOM transcript extraction...');
											transcriptText = await page.evaluate(() => {
												// Try common transcript containers
												const selectors = [
													'[data-testid*="transcript"]',
													'[class*="transcript"]',
													'[aria-label*="transcript" i]',
													'section[aria-label*="transcript" i]',
													'main [class*="transcript"]'
												];
												for (const selector of selectors) {
													const container = document.querySelector(selector) as HTMLElement | null;
													if (container) {
														const nodes = container.querySelectorAll('li, p, div');
														const lines: string[] = [];
														nodes.forEach((n) => {
															const t = (n as HTMLElement).innerText?.trim();
															if (t) lines.push(t);
														});
														const text = (lines.join('\n').trim() || (container as any).innerText?.trim() || container.textContent?.trim() || '').trim();
														if (text && text.length > 0) return text;
													}
												}
												return null;
											}).catch(() => null as any);
										}
									} catch (error) {
										console.warn('[auth] Error during transcript copy operation:', error);
									}
								} else {
									console.warn('[auth] Copy Transcript button not found after tab click');
								}
								
								// Save transcript if we got it
								if (transcriptText && transcriptText.length > 100) {
										// Create filename from date AND meeting ID to avoid collisions
										const sanitizedDate = meetingDate.replace(/[^a-z0-9]/gi, '_').toLowerCase();
										const sanitizedName = meetingName.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 30);
										const filename = `transcript_${sanitizedDate}_${sanitizedName}_${meetingId}.txt`;
										const transcriptsDir = getTranscriptPath();
										const filepath = path.join(transcriptsDir, filename);
										
										// Ensure transcripts directory exists
										fs.mkdirSync(transcriptsDir, { recursive: true });
										
										// Save transcript to file
										const content = `Meeting: ${meetingName}
Date: ${meetingDate}
Meeting ID: ${meetingId}
URL: ${meetingUrl}
Extracted: ${new Date().toISOString()}
${'='.repeat(80)}

${transcriptText}`;
										
																															fs.writeFileSync(filepath, content, 'utf-8');
										console.info(`[auth] 📄 Transcript saved to: ${filepath}`);
										transcriptExtracted = true;
										extractionResults.successful.push(`${meetingName} (${meetingId})`);	
								} else {
									if (transcriptText) {
										console.warn('[auth] Transcript text too short or invalid, not saving');
									} else {
										console.warn('[auth] Could not extract transcript from clipboard');
									}
								}
							} catch (error) {
								console.warn(`[auth] Error extracting transcript (attempt ${retryCount + 1}/${maxRetries}):`, error);
							}
							
							retryCount++;
						}
						
						if (!transcriptExtracted) {
							console.error(`[auth] ❌ Failed to extract transcript for meeting ${meetingId} after ${maxRetries} attempts`);
							extractionResults.failed.push({ 
								url: meetingUrl, 
								reason: `Failed after ${maxRetries} attempts - transcript button or content not accessible` 
							});
						}
						
						// Add a small delay between meetings to avoid rate limiting
						if (i < meetingsToVisit.length - 1) {
							await page.waitForTimeout(1000);
						}
					} catch (error) {
						console.warn(`[auth] Failed to visit meeting ${meetingId}:`, error);
						extractionResults.failed.push({ 
							url: meetingUrl, 
							reason: `Failed to visit meeting page: ${error}` 
						});
						// Continue with next meeting even if one fails
					}
				}
				
				// Navigate back to the main page
				console.info('[auth] Returning to main page...');
				await page.goto(env.baseURL, { waitUntil: 'domcontentloaded' });
				await page.waitForTimeout(2000);
				
				// Display extraction summary
				console.info('');
				console.info('================================================');
				console.info('📊 TRANSCRIPT EXTRACTION SUMMARY');
				console.info('================================================');
				console.info(`✅ Successfully extracted: ${extractionResults.successful.length}/${meetingsToVisit.length} transcripts`);
				console.info(`❌ Failed to extract: ${extractionResults.failed.length}/${meetingsToVisit.length} transcripts`);
				console.info('');
				
				if (extractionResults.successful.length > 0) {
					console.info('✅ SUCCESSFUL EXTRACTIONS:');
					extractionResults.successful.forEach((meeting, index) => {
						console.info(`   ${index + 1}. ${meeting}`);
					});
					console.info('');
				}
				
				if (extractionResults.failed.length > 0) {
					console.info('❌ FAILED EXTRACTIONS:');
					extractionResults.failed.forEach((failure, index) => {
						console.info(`   ${index + 1}. Meeting: ${failure.url.split('/').pop()}`);
						console.info(`      Reason: ${failure.reason}`);
					});
					console.info('');
					console.info('💡 TIP: For failed extractions, try:');
					console.info('   - Running the script again (some failures are temporary)');
					console.info('   - Increasing timeout values in the script');
					console.info('   - Running with PWDEBUG=1 to manually handle edge cases');
				}
				
				console.info('================================================');
				console.info('✅ MEETING VISITS COMPLETE');
				console.info('================================================');
				console.info('');
			} else if (allMeetingLinks.length > 0) {
				console.info('[auth] Meeting visits disabled. Set MAX_MEETINGS_TO_VISIT env var to visit meetings.');
			}
		} // End of scrolling section

		fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });
		await context.storageState({ path: storageStatePath });
	});
});



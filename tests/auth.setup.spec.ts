import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { env } from '../utils/env';

const storageStatePath = path.resolve(__dirname, '..', 'storage', 'auth.json');

test.describe('auth setup', () => {
	test('login and save storage state', async ({ page, context }) => {
		// Setup flows can be slow; extend the overall test timeout
		test.setTimeout(120_000);
		
		// Minimize window if requested (alternative to headless for demos)
		if (env.minimized && !env.headless) {
			await page.evaluate(() => {
				window.moveTo(0, 0);
				window.resizeTo(1, 1);
			}).catch(() => {
				// Some browsers may block window manipulation
			});
		}
		
		// Configure timeouts
		const targetUrl = env.baseURL + env.loginPath;
		await page.setDefaultNavigationTimeout(env.navTimeoutMs);
		await page.setDefaultTimeout(env.detectTimeoutMs);

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
			const popupPromise = page.waitForEvent('popup', { timeout: 5000 });
			
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
			
			// Wait for either popup or navigation
			const popup = await popupPromise.catch(() => null);
			
			if (popup) {
				target = popup;
				await popup.waitForLoadState('domcontentloaded');
			} else {
				// Check if we were redirected to Google login page
				await page.waitForTimeout(2000); // Brief wait for redirect
				const currentUrl = page.url();
				if (currentUrl.includes('accounts.google.com')) {
					target = page;
				} else {
					throw new Error('Neither popup nor redirect occurred after clicking Google button');
				}
			}
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
			await page.waitForTimeout(2000);
			

			
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
			
			// Function to scroll and load all content
			const scrollToLoadAll = async () => {
				let previousHeight = 0;
				let currentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
				let scrollAttempts = 0;
				const maxScrollAttempts = 20; // Prevent infinite scrolling
				let noNewContentCount = 0;
				const maxNoNewContent = 3; // Stop after 3 attempts with no new content
				
				console.info(`[auth] Initial page height: ${currentHeight}px`);
				
				// Initial scroll to top to show starting point
				await page.evaluate(() => {
					window.scrollTo({ top: 0, behavior: 'smooth' });
				});
				await page.waitForTimeout(1000);
				
				while (scrollAttempts < maxScrollAttempts && noNewContentCount < maxNoNewContent) {
					scrollAttempts++;
					previousHeight = currentHeight;
					
					// Update visual indicator
					await page.evaluate((attempt) => {
					const indicator = document.getElementById('scroll-indicator');
					if (indicator) {
						indicator.innerHTML = `📜 Scrolling... (Pass ${attempt})`;
					}
					}, scrollAttempts);
					
					// More aggressive scrolling - multiple techniques
					console.info(`[auth] Scroll attempt ${scrollAttempts}: Starting from height ${currentHeight}px`);
					
					// Method 1: Standard scroll to bottom
					await page.evaluate(() => {
						window.scrollTo(0, document.documentElement.scrollHeight);
					});
					await page.waitForTimeout(500);
					
					// Method 2: Scroll into view of last element
					await page.evaluate(() => {
						const elements = document.querySelectorAll('*');
						if (elements.length > 0) {
							elements[elements.length - 1].scrollIntoView({ behavior: 'smooth', block: 'end' });
						}
					});
					await page.waitForTimeout(500);
					
					// Method 3: Force scroll beyond current height
					await page.evaluate(() => {
						window.scrollTo(0, document.documentElement.scrollHeight + 1000);
					});
					await page.waitForTimeout(500);
					
					// Method 4: Trigger scroll event manually
					await page.evaluate(() => {
						window.dispatchEvent(new Event('scroll'));
						document.dispatchEvent(new Event('scroll'));
					});
					
					// Method 5: Use keyboard to scroll (sometimes more reliable for lazy loading)
					await page.keyboard.press('End');
					await page.waitForTimeout(500);
					
					// Method 6: Mouse wheel scroll
					await page.mouse.wheel(0, 1000);
					await page.waitForTimeout(500);
					
					// Wait longer for lazy loading to trigger
					console.info(`[auth] Waiting for new content to load...`);
					await page.waitForTimeout(2000);
					
					// Check if there's a loading indicator and wait for it to disappear
					const loadingIndicator = page.locator('[class*="loading"], [class*="spinner"], [class*="loader"], [data-testid*="loading"]').first();
					if (await loadingIndicator.isVisible().catch(() => false)) {
						console.info('[auth] Waiting for loading indicator to disappear...');
						await loadingIndicator.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {
							console.info('[auth] Loading indicator still visible, continuing...');
						});
					}
					
					// Get new height after scroll and wait
					currentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
					
					// Check if we've loaded new content
					if (currentHeight > previousHeight) {
						console.info(`[auth] ✅ Loaded more content! Page height: ${previousHeight}px -> ${currentHeight}px (${currentHeight - previousHeight}px added)`);
						noNewContentCount = 0; // Reset counter when new content loads
					} else {
						noNewContentCount++;
						console.info(`[auth] No new content loaded. Same height: ${currentHeight}px (attempt ${noNewContentCount}/${maxNoNewContent})`);
					}
				}
				
				// Log final status
				if (noNewContentCount >= maxNoNewContent) {
					console.info(`[auth] Stopped scrolling: No new content after ${maxNoNewContent} attempts`);
				} else if (scrollAttempts >= maxScrollAttempts) {
					console.info(`[auth] Stopped scrolling: Reached maximum attempts (${maxScrollAttempts})`);
				}
				
				// Final scroll to top then bottom to ensure everything is loaded
				await page.evaluate(() => {
					window.scrollTo({ top: 0, behavior: 'smooth' });
				});
				await page.waitForTimeout(500);
				await page.evaluate(() => {
					window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
				});
				await page.waitForTimeout(1000);
				
				// Extract all meeting links from the page
				const meetingLinks = await page.evaluate(() => {
					// Find all links to fathom.video/calls
					const links = document.querySelectorAll('a[href*="fathom.video/calls/"]');
					const uniqueLinks = new Set<string>();
					
					links.forEach(link => {
						const href = (link as HTMLAnchorElement).href;
						if (href && href.includes('fathom.video/calls/')) {
							uniqueLinks.add(href);
						}
					});
					
					return Array.from(uniqueLinks);
				});
				
				console.info(`[auth] Found ${meetingLinks.length} meeting link(s)`);
				
				// Update indicator with final count
				await page.evaluate((count) => {
					const indicator = document.getElementById('scroll-indicator');
					if (indicator) {
						if (count > 0) {
							indicator.innerHTML = `✅ Found ${count} meeting(s)!`;
							indicator.style.background = '#4CAF50';
						} else {
							indicator.innerHTML = `✅ Scrolling complete!`;
							indicator.style.background = '#2196F3';
						}
					}
				}, meetingLinks.length);
				
				if (meetingLinks.length > 0) {
					console.info(`[auth] Meeting URLs extracted:`);
					meetingLinks.forEach((link, index) => {
						console.info(`  [${index + 1}/${meetingLinks.length}] ${link}`);
					});
				} else {
					console.info('[auth] No meeting links found on the page.');
				}
				
								// Keep indicator visible for 3 seconds then fade out
				await page.waitForTimeout(3000);
				await page.evaluate(() => {
					const indicator = document.getElementById('scroll-indicator');
					if (indicator) {
						indicator.style.transition = 'opacity 1s ease-out';
						indicator.style.opacity = '0';
						setTimeout(() => indicator.remove(), 1000);
					}
				});
				
				// Return the meeting links from the function
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
			
			// Visit each meeting page if configured to do so
			const maxMeetingsToVisit = Number(process.env.MAX_MEETINGS_TO_VISIT || '0');
			const shouldVisitMeetings = maxMeetingsToVisit > 0 && allMeetingLinks.length > 0;
			
			if (shouldVisitMeetings) {
				const meetingsToVisit = allMeetingLinks.slice(0, maxMeetingsToVisit);
				console.info('');
				console.info('================================================');
				console.info(`📊 VISITING ${meetingsToVisit.length} MEETING PAGE(S)`);
				console.info('================================================');
				console.info('');
				
				for (let i = 0; i < meetingsToVisit.length; i++) {
					const meetingUrl = meetingsToVisit[i];
					const meetingId = meetingUrl.split('/').pop();
					
					console.info(`[auth] Visiting meeting ${i + 1}/${meetingsToVisit.length}: ${meetingId}`);
					
					try {
						// Navigate to the meeting page
						await page.goto(meetingUrl, { 
							waitUntil: 'domcontentloaded',
							timeout: 30000 
						});
						
						// Wait a bit for the page to load
						await page.waitForTimeout(3000);
						
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
						
						// Try to get transcript
						try {
							console.info('[auth] Looking for Transcript button...');
							
							// Store current URL to check if we're still on the same page
							const currentPageUrl = page.url();
							
							// Find and click the Transcript button
							const transcriptButton = page.locator('button:has-text("Transcript")').first();
							const transcriptButtonVisible = await transcriptButton.isVisible({ timeout: 5000 }).catch(() => false);
							
							if (transcriptButtonVisible) {
								console.info('[auth] Clicking Transcript button...');
								await transcriptButton.click({ timeout: 5000 }).catch((e) => {
									console.warn('[auth] Failed to click Transcript button:', e.message);
								});
								await page.waitForTimeout(2000);
								
								// Check if we're still on the same page
								if (page.url() !== currentPageUrl) {
									console.warn('[auth] Page navigated after clicking Transcript button, skipping transcript extraction');
									throw new Error('Page navigated away from meeting');
								}
								
								// First try to extract transcript text directly from the page
								let transcriptText = null;
								console.info('[auth] Looking for transcript text on page...');
								
								// Common selectors for transcript content
								const transcriptSelectors = [
									'[class*="transcript"]',
									'[data-testid*="transcript"]',
									'[role="article"]',
									'.transcript-content',
									'.transcript-text',
									'pre', // Sometimes transcripts are in pre tags
								];
								
								for (const selector of transcriptSelectors) {
									try {
										const element = page.locator(selector).first();
										if (await element.isVisible({ timeout: 1000 }).catch(() => false)) {
											const text = await element.textContent();
											if (text && text.length > 100) { // Assume transcript is at least 100 chars
												console.info(`[auth] Found transcript text using selector: ${selector}`);
												transcriptText = text;
												break;
											}
										}
									} catch (e) {
										// Continue to next selector
									}
								}
								
								// If we couldn't find transcript text directly, try the Copy button
								if (!transcriptText) {
									const copyButton = page.locator('button:has-text("Copy Transcript")').first();
									const copyButtonVisible = await copyButton.isVisible({ timeout: 5000 }).catch(() => false);
									
									if (copyButtonVisible) {
										console.info('[auth] Clicking Copy Transcript button...');
										
										// Set up clipboard read before clicking
										try {
											// Grant clipboard permissions
											await context.grantPermissions(['clipboard-read', 'clipboard-write']);
											
											// Click the copy button
											await copyButton.click();
											await page.waitForTimeout(1500);
											
											// Try to read from clipboard with better error handling
											transcriptText = await page.evaluate(async () => {
												try {
													// Check if page is still active
													if (!window || !navigator || !navigator.clipboard) {
														console.error('Clipboard API not available');
														return null;
													}
													
													const text = await navigator.clipboard.readText();
													console.log('Clipboard text length:', text ? text.length : 0);
													return text;
												} catch (e) {
													console.error('Failed to read clipboard:', e);
													// Try alternative method
													try {
														// Sometimes the clipboard content is available via document.execCommand
														const textarea = document.createElement('textarea');
														document.body.appendChild(textarea);
														textarea.focus();
														document.execCommand('paste');
														const text = textarea.value;
														document.body.removeChild(textarea);
														return text || null;
													} catch (e2) {
														console.error('Alternative clipboard read also failed:', e2);
														return null;
													}
												}
											}).catch((error) => {
												console.warn('[auth] Could not read clipboard:', error.message);
												return null;
											});
											
											// If clipboard read failed, try looking for a success message or toast
											if (!transcriptText) {
												console.info('[auth] Clipboard read failed, checking for success indicators...');
												
												// Look for success toast/notification
												const successToast = await page.locator('text=/copied|success/i').isVisible({ timeout: 2000 }).catch(() => false);
												if (successToast) {
													console.info('[auth] Copy success indicator found, but could not retrieve text');
													// Mark as successful copy even if we couldn't read the text
													transcriptText = '[Transcript was copied but could not be retrieved from clipboard]';
												}
											}
										} catch (error) {
											console.warn('[auth] Error during transcript copy operation:', error);
										}
									} else {
										console.info('[auth] Copy Transcript button not found');
									}
								}
								
								if (transcriptText) {
										// Create filename from date
										const sanitizedDate = meetingDate.replace(/[^a-z0-9]/gi, '_').toLowerCase();
										const filename = `fathom_transcript_${sanitizedDate}.txt`;
										const filepath = path.join('transcripts', filename);
										
										// Ensure transcripts directory exists
										fs.mkdirSync('transcripts', { recursive: true });
										
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
									} else {
										console.warn('[auth] Could not read transcript from clipboard');
									}
							} else {
								console.info('[auth] Transcript button not found on this meeting page');
							}
						} catch (error) {
							console.warn('[auth] Error extracting transcript:', error);
						}
						
						// Add a small delay between meetings to avoid rate limiting
						if (i < meetingsToVisit.length - 1) {
							await page.waitForTimeout(1000);
						}
					} catch (error) {
						console.warn(`[auth] Failed to visit meeting ${meetingId}:`, error);
						// Continue with next meeting even if one fails
					}
				}
				
				// Navigate back to the main page
				console.info('[auth] Returning to main page...');
				await page.goto(env.baseURL, { waitUntil: 'domcontentloaded' });
				await page.waitForTimeout(2000);
				
				console.info('');
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



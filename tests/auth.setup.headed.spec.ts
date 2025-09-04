import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { env } from '../utils/env';

const storageStatePath = path.resolve(__dirname, '..', 'storage', 'auth.json');

async function addScrollIndicator(page: Page) {
	await page.evaluate(() => {
		const el = document.createElement('div');
		el.id = 'scroll-indicator';
		el.textContent = '📜 Preparing to scroll...';
		el.style.cssText = 'position:fixed;top:16px;right:16px;background:#4F8CFF;color:#fff;padding:10px 14px;border-radius:8px;font-weight:600;z-index:999999;box-shadow:0 6px 18px rgba(0,0,0,.25)';
		document.body.appendChild(el);
	});
}

async function updateScrollIndicator(page: Page, text: string) {
	await page.evaluate((t: string) => {
		const el = document.getElementById('scroll-indicator');
		if (el) el.textContent = t;
	}, text);
}

async function removeScrollIndicator(page: Page) {
	await page.evaluate(() => { const el = document.getElementById('scroll-indicator'); if (el) el.remove(); });
}

test.describe('auth setup (headed/debug preserved)', () => {
	test('login and extract via headed flow', async ({ page, context }) => {
		// Increase overall timeout for many meetings
		test.setTimeout(900_000); // 15 minutes
		page.setDefaultNavigationTimeout(Math.max(env.navTimeoutMs, 60_000));
		page.setDefaultTimeout(env.detectTimeoutMs);

		// Navigate to login
		await page.goto(env.baseURL + env.loginPath, { waitUntil: 'domcontentloaded' });
		await page.waitForLoadState('networkidle').catch(() => {});
		console.info(`[auth] Headed landed at: ${page.url()}`);

		// Prefer Google/MS legacy selectors; fall back to password
		const googleBtn = page.locator('button:has-text("Google"), [role="button"]:has-text("Google")').first();
		const msBtn = page.locator('button:has-text("Microsoft"), [role="button"]:has-text("Microsoft")').first();

		if (env.authProvider !== 'password' && await googleBtn.isVisible().catch(() => false)) {
			console.info('[auth] Headed clicking Google SSO');
			const popupPromise = page.waitForEvent('popup').catch(() => null);
			await googleBtn.click({ timeout: env.detectTimeoutMs }).catch(() => {});
			const popup = await popupPromise;
			const target = popup ?? page;
			await target.waitForLoadState('domcontentloaded').catch(() => {});
			await target.locator('input#identifierId, input[type="email"]').first().fill(env.username).catch(() => {});
			await target.locator('button:has-text("Next"), div[role="button"]:has-text("Next"), span:has-text("Next")').first().click({ timeout: 5000 }).catch(() => {});
			await target.waitForTimeout(1000);
			await target.locator('input[type="password"], input[name="Passwd"]').first().fill(env.password).catch(() => {});
			await target.locator('button:has-text("Next"), div[role="button"]:has-text("Next"), span:has-text("Next")').first().click({ timeout: 5000 }).catch(() => {});
			await page.waitForURL(u => u.href.includes(env.baseURL), { timeout: 60_000 }).catch(() => {});
		} else if (env.authProvider !== 'password' && await msBtn.isVisible().catch(() => false)) {
			console.info('[auth] Headed clicking Microsoft SSO');
			const popupPromise = page.waitForEvent('popup').catch(() => null);
			await msBtn.click({ timeout: env.detectTimeoutMs, force: true }).catch(() => {});
			const target = (await popupPromise) ?? page;
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
			await page.waitForURL(u => u.href.includes(env.baseURL), { timeout: 60_000 }).catch(() => {});
		} else {
			console.info('[auth] Headed password flow');
			await page.locator('input[name="email"], input[type="email"], #user_email, input[name="user[email]"]').first().fill(env.username);
			await page.locator('button[type="submit"]').filter({ hasText: /log in|login|sign in|submit/i }).first().click();
			await page.waitForSelector('input[type="password"], #user_password, input[name="user[password]"]', { state: 'visible' });
			await page.locator('input[type="password"], #user_password, input[name="user[password]"]').first().fill(env.password);
			await Promise.all([
				page.waitForNavigation({ waitUntil: 'networkidle' }),
				page.getByRole('button', { name: /sign in|log in|login|submit/i }).click(),
			]);
		}

		console.info('[auth] Headed login complete, saving storage state');
		fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });
		await context.storageState({ path: storageStatePath }).catch(() => {});

		// Go to data page and scroll (restored previous working logic) with more passes
		await page.goto(env.baseURL + env.dataPagePath, { waitUntil: 'domcontentloaded' }).catch(() => {});
		await page.waitForLoadState('networkidle').catch(() => {});
		await page.waitForTimeout(2000);

		// Visual indicator (restored)
		await page.evaluate(() => {
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
			const style = document.createElement('style');
			style.textContent = `@keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }`;
			document.head.appendChild(style);
		});

		const scrollToLoadAll = async () => {
			let previousHeight = 0;
			let currentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
			let scrollAttempts = 0;
			const maxScrollAttempts = 60; // increased
			let noNewContentCount = 0;
			const maxNoNewContent = 5; // a bit more patience
			console.info(`[auth] Initial page height: ${currentHeight}px`);
			await page.evaluate(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); });
			await page.waitForTimeout(1000);
			while (scrollAttempts < maxScrollAttempts && noNewContentCount < maxNoNewContent) {
				scrollAttempts++;
				previousHeight = currentHeight;
				await page.evaluate((attempt) => {
					const indicator = document.getElementById('scroll-indicator');
					if (indicator) (indicator as HTMLElement).innerHTML = `📜 Scrolling... (Pass ${attempt})`;
				}, scrollAttempts);
				console.info(`[auth] Scroll attempt ${scrollAttempts}: Starting from height ${currentHeight}px`);
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
				const loadingIndicator = page.locator('[class*="loading"], [class*="spinner"], [class*="loader"], [data-testid*="loading"]').first();
				if (await loadingIndicator.isVisible().catch(() => false)) { console.info('[auth] Waiting for loading indicator to disappear...'); await loadingIndicator.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => { console.info('[auth] Loader still visible, continuing...'); }); }
				currentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
				if (currentHeight > previousHeight) { console.info(`[auth] ✅ Loaded +${currentHeight - previousHeight}px`); noNewContentCount = 0; }
				else { noNewContentCount++; console.info(`[auth] No new content (streak ${noNewContentCount}/${maxNoNewContent})`); }
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
			await page.evaluate((count) => {
				const indicator = document.getElementById('scroll-indicator');
				if (indicator) {
					if (count > 0) { indicator.innerHTML = `✅ Found ${count} meeting(s)!`; (indicator as HTMLElement).style.background = '#4CAF50'; }
					else { indicator.innerHTML = `✅ Scrolling complete!`; (indicator as HTMLElement).style.background = '#2196F3'; }
				}
			}, (await page.evaluate(() => document.querySelectorAll('a[href*="fathom.video/calls/"]').length)) as any);
			await page.waitForTimeout(2000);
			await page.evaluate(() => { const indicator = document.getElementById('scroll-indicator'); if (indicator) { (indicator as HTMLElement).style.transition = 'opacity 1s ease-out'; (indicator as HTMLElement).style.opacity = '0'; setTimeout(() => indicator.remove(), 1000); } });
			return meetingLinks;
		};

		let allMeetingLinks: string[] = [];
		try { allMeetingLinks = await scrollToLoadAll(); } catch (error) {
			console.warn('[auth] Error during scrolling:', error);
			console.info('[auth] Continuing with authentication despite scroll error...');
			await page.evaluate(() => { const indicator = document.getElementById('scroll-indicator'); if (indicator) indicator.remove(); });
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
						meetingName = await page.locator('[data-video-call-chip-name] span[contenteditable="true"]').
							textContent()
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
							
							let copyButton: ReturnType<Page['locator']> | null = null;
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
							
							let transcriptText: string | null = null;
							
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
									
									// Try to read from clipboard
									transcriptText = await page.evaluate(async () => {
										try {
											if (!window || !navigator || !navigator.clipboard) {
												console.error('Clipboard API not available');
												return null;
											}
											
											const text = await navigator.clipboard.readText();
											console.log('Clipboard text length:', text ? text.length : 0);
											return text;
										} catch (e) {
											console.error('Failed to read clipboard:', e);
											return null;
										}
									}).catch((error: any) => {
										console.warn('[auth] Could not read clipboard:', error.message);
										return null as any;
									});
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

		fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });
		await context.storageState({ path: storageStatePath });
	});
});

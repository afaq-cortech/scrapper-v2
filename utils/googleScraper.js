const { chromium } = require("playwright");
const config = require("../config");
const BusinessDataExtractor = require("./businessDataExtractor");
const HistoryManager = require("./historyManager");
require("dotenv").config();

class GoogleScraper {
	constructor() {
		this.browser = null;
		this.context = null;
		this.page = null;
		this.llmExtractor = new BusinessDataExtractor();
		this.historyManager = new HistoryManager();
		this.isInitialized = false;
		this.maxRetries = 3;
	}

	async initialize() {
		if (this.isInitialized) {
			console.log("Scraper already initialized");
			return true;
		}

		try {
			console.log("Initializing Playwright scraper...");

			this.browser = await chromium.launch({
				headless: config.HEADLESS_MODE,
				args: config.PLAYWRIGHT?.ARGS || [
					"--no-sandbox",
					"--disable-setuid-sandbox",
					"--disable-dev-shm-usage",
				],
			});

			const contextOptions = {
				viewport: { width: 1920, height: 1080 },
				userAgent:
					config.USER_AGENTS[
						Math.floor(Math.random() * config.USER_AGENTS.length)
					],
				locale: "en-US",
				timezoneId: "America/New_York",
				javaScriptEnabled: true,
				hasTouch: false,
				isMobile: false,
				bypassCSP: true,
			};

			this.context = await this.browser.newContext(contextOptions);
			this.page = await this.context.newPage();
			await this._setupPage();

			this.isInitialized = true;
			console.log("Playwright scraper initialized successfully");
			
			// Show history statistics if enabled
			if (config.HISTORY?.ENABLED && config.HISTORY?.SHOW_STATS) {
				this.historyManager.showStats();
			}
			
			return true;
		} catch (error) {
			console.error("Failed to initialize Playwright scraper:", error.message);
			await this._cleanup();
			return false;
		}
	}

	async _setupPage() {
		try {
			this.page.setDefaultTimeout(45000);
			this.page.setDefaultNavigationTimeout(45000);

			await this.page.route("**/*", (route) => {
				const resourceType = route.request().resourceType();
				const url = route.request().url();

				const isCaptchaPage =
					this.page.url().includes("google.com/sorry") ||
					this.page.url().includes("recaptcha") ||
					this.page.url().includes("captcha");

				if (isCaptchaPage) {
					console.log(`🔓 Allowing resource: ${url} (CAPTCHA page)`);
					route.continue();
					return;
				}

				if (["image", "font", "media"].includes(resourceType)) {
					route.abort();
					return;
				}

				const blockedDomains = [
					"google-analytics.com",
					"googletagmanager.com",
					"facebook.com",
					"doubleclick.net",
					"googlesyndication.com",
				];

				if (blockedDomains.some((domain) => url.includes(domain))) {
					route.abort();
					return;
				}

				route.continue();
			});
		} catch (error) {
			console.error("Error setting up page:", error.message);
			throw error;
		}
	}

	async handleCaptcha() {
		try {
			// Wait for page to stabilize first
			await this.page.waitForTimeout(3000);

			const currentUrl = this.page.url();

			// Check for 500 error page first
			if (currentUrl.includes("google.com/sorry/index")) {
				try {
					const pageContent = await this.page.content();
					if (
						pageContent.includes("500. That's an error") ||
						pageContent.includes("server encountered an error")
					) {
						console.log("Detected 500 error page, not a CAPTCHA");
						return false;
					}
				} catch (error) {
					// If we can't get content, assume it's a CAPTCHA
					console.log("Could not read page content, assuming CAPTCHA");
				}
			}

			// Enhanced CAPTCHA indicators
			const captchaKeywords = [
				"unusual traffic from your computer network",
				"verify you're human",
				"security check",
				"captcha",
				"recaptcha",
				"prove you're not a robot",
				"i'm not a robot",
				"select all images with",
				"click on all images",
				"robot verification",
				"automated requests",
				"temporarily blocked",
				"rate limit",
				"too many requests",
				"please try again",
				"verify you are human",
				"complete the security check",
				"checking your browser",
				"one more step",
				"verify your identity"
			];

			// Check if we're on a CAPTCHA page
			const isCaptchaPage =
				currentUrl.includes("google.com/sorry") ||
				currentUrl.includes("recaptcha") ||
				currentUrl.includes("captcha") ||
				currentUrl.includes("challenge") ||
				currentUrl.includes("verify");

			let hasCaptcha = false;

			if (isCaptchaPage) {
				hasCaptcha = true;
			} else {
				// Also check page content for CAPTCHA indicators
				try {
					const pageContent = await this.page.content();
					hasCaptcha = captchaKeywords.some((keyword) =>
						pageContent.toLowerCase().includes(keyword.toLowerCase())
					);
				} catch (error) {
					// If we can't get content, assume no CAPTCHA
					hasCaptcha = false;
				}
			}

			if (!hasCaptcha) {
				return false;
			}

			console.log("\n🚨 CAPTCHA DETECTED! 🚨");
			console.log("=" .repeat(50));
			console.log("Please solve the CAPTCHA manually in the browser window.");
			console.log("The scraper will wait for you to complete it.");
			console.log("=" .repeat(50));
			console.log("💡 Instructions:");
			console.log("   1. Look at the browser window that opened");
			console.log("   2. Complete the CAPTCHA challenge");
			console.log("   3. Wait for the page to redirect to search results");
			console.log("   4. The scraper will automatically continue");
			console.log("=" .repeat(50));

			// Enable all resources for CAPTCHA solving
			await this._enableAllResources();

			// Wait for user to solve CAPTCHA manually
			// Check at configurable intervals if CAPTCHA is still present
			let attempts = 0;
			const maxWaitTime = (config.CAPTCHA?.MAX_WAIT_TIME || 600) * 1000; // Convert to milliseconds
			const checkInterval = config.CAPTCHA?.CHECK_INTERVAL || 5000; // Check every 5 seconds
			const progressInterval = config.CAPTCHA?.PROGRESS_UPDATE_INTERVAL || 30000; // Progress updates every 30 seconds

			while (attempts < maxWaitTime) {
				await this.page.waitForTimeout(checkInterval);
				attempts += checkInterval;

				try {
					// Check if we've been redirected to search results
					const newUrl = this.page.url();
					if (
						newUrl.includes("google.com/search") &&
						!newUrl.includes("sorry") &&
						!newUrl.includes("captcha") &&
						!newUrl.includes("challenge")
					) {
						console.log("✅ CAPTCHA solved! Redirected to search results.");
						await this.page.waitForTimeout(3000); // Wait for page to fully load
						return true;
					}

					// Check if CAPTCHA is still present
					const currentContent = await this.page.content();
					const stillHasCaptcha = captchaKeywords.some((keyword) =>
						currentContent.toLowerCase().includes(keyword.toLowerCase())
					);

					if (!stillHasCaptcha && 
						!newUrl.includes("sorry") && 
						!newUrl.includes("captcha") &&
						!newUrl.includes("challenge")) {
						console.log("✅ CAPTCHA appears to be solved! Continuing...");
						await this.page.waitForTimeout(3000); // Wait a bit more for page to load
						return true;
					}

					// Show progress at configurable intervals
					if (attempts % progressInterval === 0) {
						const minutesElapsed = Math.floor(attempts / 60000);
						const secondsElapsed = Math.floor((attempts % 60000) / 1000);
						console.log(
							`⏳ Still waiting for CAPTCHA to be solved... (${minutesElapsed}m ${secondsElapsed}s elapsed)`
						);
						console.log("💡 Make sure to complete the CAPTCHA in the browser window");
					}
				} catch (error) {
					// If we can't check content, the page might be navigating
					if (attempts % progressInterval === 0) {
						console.log(`⏳ Page is loading... (${Math.floor(attempts / 60000)}m elapsed)`);
					}
				}
			}

			const maxWaitMinutes = Math.floor(maxWaitTime / 60000);
			console.log(`\n⏰ TIMEOUT: Maximum wait time (${maxWaitMinutes} minutes) reached.`);
			console.log("Please try running the scraper again later.");
			console.log("💡 Tip: Try using a different network or VPN if CAPTCHAs persist.");
			return false;
		} catch (error) {
			console.error("Error handling CAPTCHA:", error.message);
			return false;
		}
	}

	async _enableAllResources() {
		try {
			// Remove all route handlers to allow all resources
			await this.page.unroute("**/*");

			// Wait a moment for resources to start loading
			await this.page.waitForTimeout(1000);

			console.log("✅ All resources enabled for CAPTCHA solving");
		} catch (error) {
			console.error("Error enabling resources:", error.message);
		}
	}

	async rotateProxy() {
		console.log("Proxy rotation disabled");
		return false;
	}

	async _isBlocked() {
		try {
			const pageContent = await this.page.content();
			const currentUrl = this.page.url();

			// Check for various blocking indicators
			const blockingIndicators = [
				"unusual traffic from your computer network",
				"verify you're human",
				"security check",
				"captcha",
				"recaptcha",
				"prove you're not a robot",
				"i'm not a robot",
				"google.com/sorry/index",
				"our systems have detected unusual traffic",
				"please complete the security check",
			];

			const isBlocked = blockingIndicators.some(
				(indicator) =>
					pageContent.toLowerCase().includes(indicator.toLowerCase()) ||
					currentUrl.includes(indicator)
			);

			return isBlocked;
		} catch (error) {
			return false;
		}
	}

	async refreshProxies() {
		try {
			console.log("Proxy functionality disabled");
			return true;
		} catch (error) {
			console.error("Error refreshing proxies:", error.message);
			return false;
		}
	}

	async searchGoogle(searchTerm, maxResults = 50, searchPurpose = null) {
		if (!this.isInitialized) {
			throw new Error("Scraper not initialized. Call initialize() first.");
		}

		console.log(`Searching Google for: "${searchTerm}"`);

		// Get previously scraped URLs if history is enabled
		let scrapedUrls = [];
		let smartStartPosition = 0;
		if (config.HISTORY?.ENABLED) {
			scrapedUrls = this.historyManager.getScrapedUrls(searchTerm);
			if (scrapedUrls.length > 0) {
				// Calculate smart starting position (start from where we left off)
				smartStartPosition = scrapedUrls.length;
				console.log(`📚 Found ${scrapedUrls.length} previously scraped URLs for "${searchTerm}"`);
				console.log(`🚀 Smart start: Beginning search from position ${smartStartPosition + 1} instead of position 1`);
			}
		}

	let allResults = [];
	let newUniqueResults = [];
	let page = null;
	const maxPages = 20; // Safety limit to prevent infinite searching
	const scrapedUrlsSet = new Set(scrapedUrls);

		try {
			page = await this.context.newPage();

			// Set additional stealth measures
			await page.setExtraHTTPHeaders({
				Accept:
					"text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
				"Accept-Language": "en-US,en;q=0.5",
				"Accept-Encoding": "gzip, deflate",
				Connection: "keep-alive",
				"Upgrade-Insecure-Requests": "1",
			});

		let start = smartStartPosition;
		const resultsPerPage = 10;
		let currentPage = Math.floor(smartStartPosition / resultsPerPage) + 1;

		console.log(`\n📄 Starting Google search pagination:`);
		console.log(`   Target: ${maxResults} NEW unique results`);
		console.log(`   Results per page: ${resultsPerPage}`);
		console.log(`   Starting from position: ${smartStartPosition + 1}`);
		console.log(`   Starting page: ${currentPage}`);
		console.log(`   Max pages to search: ${maxPages}\n`);

		while (newUniqueResults.length < maxResults && currentPage <= maxPages) {
				const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(
					searchTerm
				)}&start=${start}&num=${resultsPerPage}`;

			console.log(`\n🔍 Page ${currentPage}:`);
			console.log(`   Fetching results ${start + 1}-${start + resultsPerPage}`);
			console.log(`   Progress: ${newUniqueResults.length}/${maxResults} NEW unique results found`);

				await page.goto(searchUrl, {
					waitUntil: "domcontentloaded",
					timeout: config.PLAYWRIGHT?.TIMEOUT || 60000,
				});

				// Check for CAPTCHA
				const captchaHandled = await this.handleCaptcha();
				if (captchaHandled) {
					console.log("✅ CAPTCHA solved! Continuing with search...");
					await page.waitForTimeout(3000);
				}

				// Wait for results to load
				await this.waitForSearchResults(page);

				// Extract results using multiple selector strategies
				const pageResults = await this.extractSearchResults(page);

				if (pageResults.length === 0) {
					console.log("No results found on this page, stopping pagination");
					break;
				}

			allResults.push(...pageResults);
			
			// Filter for new unique URLs
			const newResults = pageResults.filter(result => !scrapedUrlsSet.has(result.url));
			newUniqueResults.push(...newResults);
			
			// Add new URLs to the scraped set to avoid duplicates within this session
			newResults.forEach(result => scrapedUrlsSet.add(result.url));
			
			console.log(`   Extracted ${pageResults.length} results from page`);
			console.log(`   Found ${newResults.length} NEW unique results`);
			console.log(`   Total NEW unique results: ${newUniqueResults.length}`);
			
			// If we're getting very few new results despite smart positioning, warn about potential position drift
			if (smartStartPosition > 0 && pageResults.length > 0 && newResults.length === 0) {
				console.log(`   ⚠️ No new results found - search results may have shifted since last scrape`);
			}

			// Check if we have enough new unique results
			if (newUniqueResults.length >= maxResults) {
				console.log(`\n✅ Target number of NEW unique results (${maxResults}) reached`);
				break;
			}

				// Check for next page link using multiple selectors
				const nextPageSelectors = [
					'a[aria-label="Next page"]',
					'#pnnext',
					'a:has-text("Next")',
					'a:has-text(">")',
				];

				let hasNextPage = false;
				for (const selector of nextPageSelectors) {
					if (await page.locator(selector).count() > 0) {
						hasNextPage = true;
						break;
					}
				}

				if (!hasNextPage) {
					console.log(`\n🛑 No more pages available (last page: ${currentPage})`);
					break;
				}

				console.log(`   Moving to page ${currentPage + 1}...`);
				
				start += resultsPerPage;
				currentPage++;
				
				// Random delay between pages
				const delay = Math.floor(Math.random() * 3000) + 2000;
				console.log(`   Waiting ${delay}ms before next page...`);
				await this.randomDelay(2000, 5000);
			}

		// Add new URLs to history if enabled
		if (config.HISTORY?.ENABLED && newUniqueResults.length > 0) {
			const newUrls = newUniqueResults.map(result => result.url);
			this.historyManager.addUrls(searchTerm, newUrls);
			this.historyManager.saveHistory();
		}

		// Return only the requested number of NEW unique results
		const results = newUniqueResults.slice(0, maxResults);
		
		console.log(`\n📊 Search Summary:`);
		console.log(`   Started from position: ${smartStartPosition + 1} (skipped ${smartStartPosition} known URLs)`);
		console.log(`   Total pages searched: ${currentPage - Math.floor(smartStartPosition / resultsPerPage) - 1}`);
		console.log(`   Total results found: ${allResults.length}`);
		console.log(`   Previously scraped: ${scrapedUrls.length}`);
		console.log(`   NEW unique results: ${newUniqueResults.length}`);
		console.log(`   Returning: ${results.length} results`);
		
		console.log(
			`\n✅ Google search completed: ${results.length} NEW unique results for "${searchTerm}"`
		);

		return results;
		} catch (error) {
			console.error("Google search error:", error);
			throw error;
		} finally {
			if (page) {
				await page.close();
			}
		}
	}

	async waitForSearchResults(page) {
		// Try multiple strategies to wait for results
		const waitStrategies = [
			() => page.waitForSelector("div.g", { timeout: 10000 }),
			() => page.waitForSelector("[data-async-context]", { timeout: 10000 }),
			() => page.waitForSelector(".tF2Cxc", { timeout: 10000 }),
			() => page.waitForLoadState("networkidle", { timeout: 15000 }),
		];

		for (const strategy of waitStrategies) {
			try {
				await strategy();
				return;
			} catch (error) {
				continue;
			}
		}

		// Final fallback - just wait a bit
		await page.waitForTimeout(3000);
	}

	async extractSearchResults(page) {
		return await page.evaluate(() => {
			const results = [];

			// Enhanced selectors for better reliability
			const selectors = {
				searchResults: [
					"div.g", // Classic selector
					"div[data-ved]", // Data attribute selector
					"div.Ww4FFb", // New organic result selector
					".tF2Cxc", // Alternative selector
					"[data-async-context] .g", // Contextual selector
				],
				title: ["h3", "h3 span", ".DKV0Md", ".LC20lb"],
				link: ["a[href]", "h3 a", ".yuRUbf a"],
				snippet: [".VwiC3b", ".s3v9rd", ".hgKElc", ".st"],
			};

			// Try each selector strategy until we find results
			for (const resultSelector of selectors.searchResults) {
				const elements = document.querySelectorAll(resultSelector);

				if (elements.length > 0) {
					console.log(
						`Found ${elements.length} elements with selector: ${resultSelector}`
					);

					elements.forEach((element) => {
						const result = extractSingleResult(element, selectors);
						if (result && result.url && result.title) {
							results.push(result);
						}
					});

					if (results.length > 0) {
						break; // Success with this selector
					}
				}
			}

			function extractSingleResult(element, selectors) {
				let title = null;
				let url = null;
				let snippet = null;

				// Extract title
				for (const titleSelector of selectors.title) {
					const titleElement = element.querySelector(titleSelector);
					if (titleElement && titleElement.textContent.trim()) {
						title = titleElement.textContent.trim();
						break;
					}
				}

				// Extract URL
				for (const linkSelector of selectors.link) {
					const linkElement = element.querySelector(linkSelector);
					if (linkElement && linkElement.href) {
						url = linkElement.href;
						// Skip Google's internal URLs
						if (!url.includes("google.com") && !url.startsWith("javascript:")) {
							break;
						}
						url = null;
					}
				}

				// Extract snippet
				for (const snippetSelector of selectors.snippet) {
					const snippetElement = element.querySelector(snippetSelector);
					if (snippetElement && snippetElement.textContent.trim()) {
						snippet = snippetElement.textContent.trim();
						break;
					}
				}

				return { title, url, snippet };
			}

			return results;
		});
	}

	async randomDelay(min, max) {
		const delay = Math.floor(Math.random() * (max - min + 1)) + min;
		return new Promise((resolve) => setTimeout(resolve, delay));
	}

	async getAllSearchResultLinks() {
		try {
			console.log("🔗 Extracting ALL links from Google search results...");

			// Wait for page to load
			await this.page.waitForLoadState("networkidle", { timeout: 10000 });

			// Extract all links from the page
			const allLinks = await this.page.$$eval("a[href]", (anchors) => {
				const links = [];
				const seenUrls = new Set();

				for (const anchor of anchors) {
					const href = anchor.getAttribute("href");
					const text = anchor.textContent.trim();

					// Filter for external links (not Google's own pages)
					if (
						href &&
						href.startsWith("http") &&
						!href.includes("google.com") &&
						!href.includes("youtube.com") &&
						!href.includes("maps.google.com") &&
						!href.includes("translate.google.com") &&
						!href.includes("accounts.google.com") &&
						!href.includes("support.google.com") &&
						!href.includes("policies.google.com") &&
						!href.includes("webcache.googleusercontent.com") &&
						!seenUrls.has(href) &&
						text.length > 2
					) {
						// Skip Google UI elements
						const skipTexts = [
							"Sign in",
							"Settings",
							"Privacy",
							"Terms",
							"About",
							"Help",
							"Feedback",
							"Images",
							"Videos",
							"Maps",
							"News",
							"Shopping",
							"Books",
							"Flights",
							"Finance",
							"Translate",
							"All",
							"More",
							"Tools",
							"SafeSearch",
							"Search tools",
							"Any time",
							"Past hour",
							"Past 24 hours",
							"Past week",
							"Past month",
							"Past year",
							"Verbatim",
							"All results",
							"Related searches",
							"People also ask",
							"Sponsored",
							"Ad",
							"Advertisement",
							"Learn more",
							"View all",
							"See more",
							"Show more",
							"Load more",
							"Next",
							"Previous",
						];

						const shouldSkip = skipTexts.some((skipText) =>
							text.toLowerCase().includes(skipText.toLowerCase())
						);

						if (!shouldSkip) {
							links.push({
								url: href,
								title: text,
								position: links.length + 1,
							});
							seenUrls.add(href);
						}
					}
				}

				return links;
			});

			console.log(`✅ Found ${allLinks.length} unique external links`);
			return allLinks;
		} catch (error) {
			console.error("Error extracting links:", error.message);
			return [];
		}
	}
	async _extractSearchResults() {
		try {
			try {
				await this.page.waitForLoadState("networkidle", { timeout: 20000 });
			} catch (waitError) {
				console.log("Network idle timeout, but continuing with extraction...");
			}
			await this.page.waitForTimeout(2000); // Extra wait for dynamic content

			console.log("🔍 Extracting search results and GMB listings...");

			// First extract GMB listings that appear at the top of search results
			const gmbListings = await this._extractGMBListings();
			console.log(`🏢 Found ${gmbListings.length} GMB listings`);

			// Then extract regular search results
			const results = await this.page.$$eval(
				".g, .tF2Cxc, .MjjYud, [data-sokoban-container], .NUnG9d, .ULSxyf, .xpd, .rc, .r, .result, [data-ved], [jscontroller], [data-hveid], .yuRUbf, .NUnG9d, .ULSxyf, .g-blk, .xpd, .rc, .r, .result, [data-ved], [jscontroller], [data-hveid], .yuRUbf, .NUnG9d, .ULSxyf, .g-blk",
				(elements) => {
					const results = [];

					for (let i = 0; i < Math.min(elements.length, 20); i++) {
						try {
							const element = elements[i];

							// Find all links in this result container
							const allLinks = element.querySelectorAll("a[href]");
							let mainLink = null;
							let title = "";
							let description = "";

							// Look for the main title link (usually the first prominent one)
							for (const link of allLinks) {
								const href = link.getAttribute("href");
								if (
									href &&
									!href.includes("google.com") &&
									href.startsWith("http")
								) {
									const linkText = link.textContent.trim();

									// Check if this looks like a main title link
									const hasTitle = link.querySelector(
										'h3, [role="heading"], .LC20lb, .DKV0Md'
									);
									const isMainLink =
										hasTitle ||
										linkText.length > 10 ||
										link.classList.contains("zReHs") ||
										link.classList.contains("LC20lb");

									if (isMainLink) {
										mainLink = href;
										title = linkText || link.getAttribute("title") || "";
										break;
									}
								}
							}

							// If no main link found, get the first valid link
							if (!mainLink) {
								for (const link of allLinks) {
									const href = link.getAttribute("href");
									if (
										href &&
										!href.includes("google.com") &&
										href.startsWith("http")
									) {
										mainLink = href;
										title =
											link.textContent.trim() ||
											link.getAttribute("title") ||
											"";
										break;
									}
								}
							}

							// Get description from comprehensive selectors for current and legacy Google layouts
							const descSelectors = [
								"[data-sncf]",
								".VwiC3b",
								".s3v9rd",
								".st",
								".aCOpRe",
								".LC20lb",
								".DKV0Md",
								".N54PNb",
								".VwiC3b",
								".yXK7lf",
								".MUxGbd",
								".lyLwlc",
								".s3v9rd",
								".st",
								".aCOpRe",
								".LC20lb",
								".DKV0Md",
								".N54PNb",
								".VwiC3b",
								".yXK7lf",
								".MUxGbd",
								".lyLwlc",
								".s3v9rd",
								".st",
								".aCOpRe",
								".LC20lb",
								".DKV0Md",
								".N54PNb",
								".VwiC3b",
								".yXK7lf",
								".MUxGbd",
								".lyLwlc",
								".s3v9rd",
								".st",
								".aCOpRe",
								".LC20lb",
								".DKV0Md",
								".N54PNb",
							];

							for (const selector of descSelectors) {
								const descElement = element.querySelector(selector);
								if (descElement && descElement.textContent.trim()) {
									description = descElement.textContent.trim();
									break;
								}
							}

							// Extract contact info from description
							const phoneRegex =
								/(\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4})/g;
							const emailRegex =
								/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

							const phones = description.match(phoneRegex) || [];
							const emails = description.match(emailRegex) || [];

							if (mainLink && title) {
								results.push({
									position: i + 1,
									title: title,
									link: mainLink,
									description: description,
									phones: [...new Set(phones)],
									emails: [...new Set(emails)],
									source: "Google Search",
								});
							}
						} catch (error) {
							// Skip this result if there's an error
							continue;
						}
					}

					return results;
				}
			);

			console.log(`✅ Successfully extracted ${results.length} search results`);

			// If we didn't get enough results, try the fallback method
			if (results.length < 5) {
				console.log("⚠️ Not enough results, trying fallback method...");
				const fallbackResults = await this._fallbackExtraction();
				if (fallbackResults.length > results.length) {
					console.log(
						`✅ Fallback method found ${fallbackResults.length} additional results`
					);
					return [...gmbListings, ...fallbackResults];
				}
			}

			// Combine GMB listings with regular search results
			return [...gmbListings, ...results];
		} catch (error) {
			console.error("Error extracting search results:", error.message);

			// Fallback to basic extraction
			try {
				console.log("🔄 Trying fallback extraction method...");
				const fallbackResults = await this._fallbackExtraction();
				console.log(`✅ Fallback extracted ${fallbackResults.length} results`);
				return [...gmbListings, ...fallbackResults];
			} catch (fallbackError) {
				console.error(
					"Fallback extraction also failed:",
					fallbackError.message
				);
				return [];
			}
		}
	}

	async _extractGMBListings() {
		try {
			// Extract GMB listings that appear at the top of Google search results
			const gmbListings = await this.page.$$eval(
				'[data-attrid="kc:/local:local result"], .VkpGBb, .Nv2PK, .THOPZb, .rllt__details, .rllt__details div, [jscontroller="Ckp8Xc"], [data-ved]',
				(elements) => {
					const listings = [];
					
					for (const element of elements) {
						try {
							// Check if this is a GMB listing by looking for common GMB indicators
							const hasGMBIndicators = 
								element.querySelector('[data-attrid="kc:/local:local result"]') ||
								element.querySelector('.VkpGBb') ||
								element.querySelector('.Nv2PK') ||
								element.querySelector('.THOPZb') ||
								element.textContent.includes('Directions') ||
								element.textContent.includes('Call') ||
								element.textContent.includes('Website') ||
								element.querySelector('[data-attrid="kc:/collection/knowledge_panels/has_phone:phone"]');

							if (!hasGMBIndicators) continue;

							// Extract business name
							const nameElement = element.querySelector('[data-attrid="title"]') || 
											 element.querySelector('h3') || 
											 element.querySelector('.dbg0pd') ||
											 element.querySelector('.rllt__details h3');
							const name = nameElement ? nameElement.textContent.trim() : '';

							// Extract address
							const addressElement = element.querySelector('[data-attrid="kc:/location/location:address"]') ||
											   element.querySelector('.LrzXr') ||
											   element.querySelector('.rllt__details .rllt__details div');
							const address = addressElement ? addressElement.textContent.trim() : '';

							// Extract phone number
							const phoneElement = element.querySelector('[data-attrid="kc:/collection/knowledge_panels/has_phone:phone"]') ||
											 element.querySelector('.LrzXr.zdqRlf.kno-fv') ||
											 element.querySelector('span[data-attrid="kc:/collection/knowledge_panels/has_phone:phone"]');
							const phone = phoneElement ? phoneElement.textContent.trim() : '';

							// Extract rating
							const ratingElement = element.querySelector('.Aq14fc') ||
											  element.querySelector('[data-attrid="kc:/collection/knowledge_panels/has_review:rating"]') ||
											  element.querySelector('.rllt__details .rllt__details div');
							const rating = ratingElement ? ratingElement.textContent.trim() : '';

							// Extract review count
							const reviewElement = element.querySelector('.hqzQac') ||
											  element.querySelector('[data-attrid="kc:/collection/knowledge_panels/has_review:review_count"]');
							const reviewCount = reviewElement ? reviewElement.textContent.trim() : '';

							// Extract website link
							const websiteElement = element.querySelector('a[data-attrid="kc:/collection/knowledge_panels/has_website:website"]') ||
											   element.querySelector('a[href*="http"]:not([href*="google.com"])');
							const website = websiteElement ? websiteElement.href : '';

							// Extract business category
							const categoryElement = element.querySelector('.YhemCb') ||
												element.querySelector('[data-attrid="kc:/business/chain:category"]');
							const category = categoryElement ? categoryElement.textContent.trim() : '';

							if (name && name.length > 2) {
								listings.push({
									position: listings.length + 1,
									title: name,
									link: website || `https://www.google.com/search?q=${encodeURIComponent(name)}`,
									description: `${address} ${phone} ${rating} ${reviewCount}`.trim(),
									phones: phone ? [phone] : [],
									emails: [],
									source: "Google My Business",
									// GMB-specific fields
									address: address,
									rating: rating,
									reviewCount: reviewCount,
									category: category,
									website: website,
									extractedAt: new Date().toISOString()
								});
							}
						} catch (error) {
							console.log('Error extracting GMB listing:', error);
							continue;
						}
					}
					
					return listings;
				}
			);

			return gmbListings;
		} catch (error) {
			console.error("Error extracting GMB listings:", error);
			return [];
		}
	}

	async _fallbackExtraction() {
		try {
			console.log("🔄 Using comprehensive fallback extraction...");

			// Get all links that look like search results, with better filtering
			const links = await this.page.$$eval("a[href]", (anchors) => {
				const results = [];
				let position = 1;
				const seenUrls = new Set();

				for (const anchor of anchors) {
					const href = anchor.getAttribute("href");
					const text = anchor.textContent.trim();

					if (
						href &&
						!href.includes("google.com") &&
						!href.includes("youtube.com") &&
						!href.includes("maps.google.com") &&
						href.startsWith("http") &&
						text.length > 5 &&
						!seenUrls.has(href) &&
						position <= 30
					) {
						// Get more results

						// Skip navigation and utility links
						const skipTexts = [
							"Sign in",
							"Settings",
							"Privacy",
							"Terms",
							"About",
							"Help",
							"Feedback",
						];
						if (!skipTexts.some((skipText) => text.includes(skipText))) {
							results.push({
								position: position++,
								title: text,
								link: href,
								description: "",
								phones: [],
								emails: [],
								source: "Google Search (Fallback)",
							});
							seenUrls.add(href);
						}
					}
				}

				return results;
			});

			console.log(`✅ Fallback method extracted ${links.length} unique URLs`);
			return links;
		} catch (error) {
			console.error("Fallback extraction failed:", error.message);
			return [];
		}
	}

	async scrapeContactInfo(url, searchPurpose = null, keyword = null) {
		try {
			console.log(`Scraping contact info from: ${url}`);
			console.log(`Search purpose: ${searchPurpose}`);
			console.log(`Keyword: ${keyword}`);

			await this.page.goto(url);
			await this.page.waitForLoadState("networkidle");

			// Use Playwright's built-in text extraction
			const text = (await this.page.textContent("body")) || "";

			// Use LLM for intelligent data extraction if available and purpose is specified
			if (searchPurpose && this.llmExtractor.isAvailable()) {
				console.log(
					`Using LLM to extract relevant contact info for: "${searchPurpose}"`
				);

				const llmExtraction = await this.llmExtractor.extractData(
					text,
					searchPurpose,
					keyword || "unknown"
				);

				if (llmExtraction && llmExtraction.isRelevant) {
					// Convert LLM extraction to expected format
					const phones = llmExtraction.phone ? [llmExtraction.phone] : [];
					const emails = llmExtraction.email ? [llmExtraction.email] : [];

					console.log(
						`LLM extracted relevant data: ${emails.length} emails, ${phones.length} phones`
					);
					return { phones, emails };
				} else {
					console.log(`LLM determined data not relevant to purpose`);
					return { phones: [], emails: [] };
				}
			}

			// Fallback to basic extraction
			console.log(`Using basic extraction (no LLM or purpose specified)`);

			// Phone patterns
			const phonePatterns = [
				/(\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4})/g,
				/(\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4})/g,
			];

			// Email pattern
			const emailPattern = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

			let phones = [];
			let emails = [];

			// Extract phones
			phonePatterns.forEach((pattern) => {
				const matches = text.match(pattern) || [];
				phones = [...phones, ...matches];
			});

			// Extract emails
			const emailMatches = text.match(emailPattern) || [];
			emails = [...emails, ...emailMatches];

			// Clean and deduplicate
			phones = [...new Set(phones)].filter(
				(phone) => phone.replace(/\D/g, "").length >= 10
			);
			emails = [...new Set(emails)].filter(
				(email) =>
					!email.includes("example.") &&
					!email.includes("test@") &&
					email.includes(".")
			);

			return { phones, emails };
		} catch (error) {
			console.log(`Failed to scrape ${url}:`, error.message);
			return { phones: [], emails: [] };
		}
	}

	async _loadMoreResults() {
		try {
			console.log("📜 Attempting to load more results by scrolling...");

			// Scroll to the bottom of the page to trigger more results
			await this.page.evaluate(() => {
				window.scrollTo(0, document.body.scrollHeight);
			});

			// Wait a bit for potential new content to load
			await this.page.waitForTimeout(2000);

			// Check if there's a "More results" button and click it
			try {
				const moreButton = await this.page.$(
					'input[value="More results"], a[aria-label="More results"], #pnnext'
				);
				if (moreButton) {
					console.log('🔘 Found "More results" button, clicking...');
					await moreButton.click();
					await this.page.waitForTimeout(3000);
				}
			} catch (error) {
				console.log('No "More results" button found or clickable');
			}

			console.log("✅ Scroll and load more attempt completed");
		} catch (error) {
			console.log("⚠️ Could not load more results:", error.message);
		}
	}

	async _debugPageState() {
		try {
			const currentUrl = this.page.url();
			console.log(`🔍 Debug: Current URL: ${currentUrl}`);

			// Check if we're on a search page
			if (currentUrl.includes("google.com/search")) {
				console.log("✅ On Google search page");

				// Count potential search result elements
				const resultCounts = await this.page.$$eval("*", (elements) => {
					const counts = {};
					const selectors = [
						".g",
						".tF2Cxc",
						".MjjYud",
						"[data-sokoban-container]",
					];

					selectors.forEach((selector) => {
						counts[selector] = document.querySelectorAll(selector).length;
					});

					// Also count all links
					counts["a[href]"] = document.querySelectorAll("a[href]").length;

					return counts;
				});

				console.log("📊 Element counts:", resultCounts);

				// Check for any visible text that might indicate search results
				const pageText = await this.page.textContent("body");
				if (pageText.includes("About") && pageText.includes("results")) {
					console.log("✅ Page contains search result indicators");
				} else {
					console.log("⚠️ Page doesn't seem to contain search results");
				}
			} else {
				console.log("⚠️ Not on Google search page");
			}
		} catch (error) {
			console.error("Debug error:", error.message);
		}
	}

	async _cleanup() {
		try {
			if (this.page) await this.page.close();
			if (this.context) await this.context.close();
			if (this.browser) await this.browser.close();
			this.isInitialized = false;
		} catch (error) {
			console.error("Error during cleanup:", error.message);
		}
	}

	async close() {
		try {
			// Save history before closing
			if (config.HISTORY?.ENABLED) {
				this.historyManager.saveHistory();
			}
			
			await this._cleanup();
			console.log("Playwright scraper closed successfully");
		} catch (error) {
			console.error("Error closing Playwright scraper:", error.message);
		}
	}

	// Get history statistics
	getHistoryStats() {
		if (config.HISTORY?.ENABLED) {
			return this.historyManager.getStats();
		}
		return null;
	}

	// Show history statistics
	showHistoryStats() {
		if (config.HISTORY?.ENABLED) {
			this.historyManager.showStats();
		}
	}

	// Clear history for a specific keyword
	clearKeywordHistory(keyword) {
		if (config.HISTORY?.ENABLED) {
			this.historyManager.clearKeywordHistory(keyword);
		}
	}

	// Clear all history
	clearAllHistory() {
		if (config.HISTORY?.ENABLED) {
			this.historyManager.clearAllHistory();
		}
	}

	// List all history files
	listHistoryFiles() {
		if (config.HISTORY?.ENABLED) {
			return this.historyManager.listHistoryFiles();
		}
		return [];
	}

	// Get current date
	getCurrentDate() {
		if (config.HISTORY?.ENABLED) {
			return this.historyManager.getCurrentDate();
		}
		return null;
	}

	// Get scraper status
	getStatus() {
		return {
			isInitialized: this.isInitialized,
			hasBrowser: !!this.browser,
			hasContext: !!this.context,
			hasPage: !!this.page,
			// currentProxy: this.currentProxy, // Proxy rotation disabled
		};
	}
}

module.exports = GoogleScraper;

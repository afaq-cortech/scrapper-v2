const { chromium } = require("playwright");
const config = require("../config");
require("dotenv").config();

class GMBScraper {
	constructor() {
		this.browser = null;
		this.context = null;
		this.page = null;
		this.isInitialized = false;
		this.maxRetries = config.GMB?.RETRY_ATTEMPTS || 3;
	}

	async initialize() {
		if (this.isInitialized) {
			console.log("🏢 GMB Scraper already initialized");
			return true;
		}

		try {
			console.log("🏢 Initializing GMB Scraper with separate Chromium instance...");

			// Launch separate browser instance for GMB scraping
			this.browser = await chromium.launch({
				headless: config.GMB?.HEADLESS || false,
				args: [
					...config.PLAYWRIGHT?.ARGS,
					"--disable-blink-features=AutomationControlled",
					"--disable-features=VizDisplayCompositor",
					"--disable-ipc-flooding-protection",
				],
			});

			const contextOptions = {
				viewport: { width: 1920, height: 1080 },
				userAgent: this._getRandomUserAgent(),
				locale: "en-US",
				timezoneId: "America/New_York",
				javaScriptEnabled: true,
				hasTouch: false,
				isMobile: false,
				bypassCSP: true,
				permissions: ["geolocation"],
			};

			this.context = await this.browser.newContext(contextOptions);
			this.page = await this.context.newPage();
			
			await this._setupPage();
			await this._addStealthScripts();

			this.isInitialized = true;
			console.log("✅ GMB Scraper initialized successfully");
			return true;
		} catch (error) {
			console.error("❌ Failed to initialize GMB Scraper:", error.message);
			await this._cleanup();
			return false;
		}
	}

	async _setupPage() {
		try {
			this.page.setDefaultTimeout(config.GMB?.EXTRACTION_TIMEOUT || 30000);
			this.page.setDefaultNavigationTimeout(config.GMB?.EXTRACTION_TIMEOUT || 30000);

			// Set up resource blocking for better performance
			await this.page.route("**/*", (route) => {
				const resourceType = route.request().resourceType();
				const url = route.request().url();

				// Allow all resources for GMB pages as they might be needed for proper rendering
				if (url.includes("google.com/maps") || url.includes("business.google.com")) {
					route.continue();
					return;
				}

				// Block unnecessary resources for other pages
				if (["image", "font", "media"].includes(resourceType)) {
					route.abort();
					return;
				}

				const blockedDomains = [
					"google-analytics.com",
					"googletagmanager.com",
					"facebook.com",
					"doubleclick.net",
				];

				if (blockedDomains.some((domain) => url.includes(domain))) {
					route.abort();
					return;
				}

				route.continue();
			});
		} catch (error) {
			console.error("Error setting up GMB page:", error.message);
			throw error;
		}
	}

	async _addStealthScripts() {
		try {
			// Add stealth scripts to avoid detection
			await this.page.addInitScript(() => {
				// Remove webdriver property
				delete navigator.__proto__.webdriver;
				
				// Mock plugins
				Object.defineProperty(navigator, 'plugins', {
					get: () => [1, 2, 3, 4, 5],
				});
				
				// Mock languages
				Object.defineProperty(navigator, 'languages', {
					get: () => ['en-US', 'en'],
				});
				
				// Mock permissions
				const originalQuery = window.navigator.permissions.query;
				window.navigator.permissions.query = (parameters) => (
					parameters.name === 'notifications' ?
						Promise.resolve({ state: Notification.permission }) :
						originalQuery(parameters)
				);
			});
		} catch (error) {
			console.error("Error adding stealth scripts:", error.message);
		}
	}

	_getRandomUserAgent() {
		const userAgents = config.USER_AGENTS || [
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
		];
		return userAgents[Math.floor(Math.random() * userAgents.length)];
	}

	async scrapeGMBListings(searchTerm, maxResults = null) {
		if (!this.isInitialized) {
			throw new Error("GMB Scraper not initialized. Call initialize() first.");
		}

		const targetResults = maxResults || config.GMB?.MAX_RESULTS_PER_SEARCH || 20;
		console.log(`🏢 Searching GMB listings for: "${searchTerm}" (target: ${targetResults} results)`);

		try {
			// Try multiple search strategies to get more results
			let allListings = [];
			
			// Strategy 1: Standard Google Maps search
			console.log(`🗺️ Strategy 1: Standard Google Maps search`);
			const listings1 = await this._searchWithStrategy(searchTerm, targetResults, 'standard');
			allListings.push(...listings1);
			
			// If we don't have enough results, try alternative strategies
			if (allListings.length < targetResults) {
				console.log(`🔄 Need more results (${allListings.length}/${targetResults}), trying alternative strategies...`);
				
				// Strategy 2: Search with "near me" modifier
				const nearMeSearch = `${searchTerm} near me`;
				console.log(`🗺️ Strategy 2: Searching with "near me": ${nearMeSearch}`);
				const listings2 = await this._searchWithStrategy(nearMeSearch, targetResults - allListings.length, 'nearme');
				
				// Merge results avoiding duplicates
				const existingNames = new Set(allListings.map(l => l.name));
				const newListings2 = listings2.filter(l => !existingNames.has(l.name));
				allListings.push(...newListings2);
			}
			
			// Strategy 3: Try with location-specific search if still not enough
			if (allListings.length < targetResults && searchTerm.includes(' ')) {
				const parts = searchTerm.split(' ');
				if (parts.length >= 2) {
					const locationSpecific = `${parts[0]} in ${parts.slice(1).join(' ')}`;
					console.log(`🗺️ Strategy 3: Location-specific search: ${locationSpecific}`);
					const listings3 = await this._searchWithStrategy(locationSpecific, targetResults - allListings.length, 'location');
					
					const existingNames = new Set(allListings.map(l => l.name));
					const newListings3 = listings3.filter(l => !existingNames.has(l.name));
					allListings.push(...newListings3);
				}
			}

			// Remove duplicates and limit to target
			const uniqueListings = allListings.slice(0, targetResults);
			
			console.log(`✅ GMB search completed: ${uniqueListings.length} unique listings found for "${searchTerm}"`);
			return uniqueListings;

		} catch (error) {
			console.error(`❌ Error scraping GMB listings for "${searchTerm}":`, error.message);
			throw error;
		}
	}

	async _searchWithStrategy(searchTerm, maxResults, strategy) {
		try {
			// Navigate to Google Maps search
			const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(searchTerm)}`;
			console.log(`🗺️ Navigating to: ${searchUrl}`);
			
			await this.page.goto(searchUrl, {
				waitUntil: "domcontentloaded",
				timeout: config.GMB?.EXTRACTION_TIMEOUT || 30000,
			});

			// Wait for initial load
			await this.page.waitForTimeout(config.GMB?.WAIT_FOR_LOAD || 5000);

			// Wait for search results to appear
			await this._waitForGMBResults();

			// Debug: Check what elements are available (only for first strategy)
			if (strategy === 'standard') {
				await this._debugPageElements();
			}

			// Scroll to load more results if needed
			const allListings = await this._extractAllGMBListings(maxResults);

			console.log(`📊 Strategy "${strategy}" found: ${allListings.length} listings`);
			return allListings;

		} catch (error) {
			console.error(`❌ Error with strategy "${strategy}":`, error.message);
			return [];
		}
	}

	async _waitForGMBResults() {
		const waitStrategies = [
			// Google Maps specific selectors
			() => this.page.waitForSelector('[role="main"] [role="article"]', { timeout: 10000 }),
			() => this.page.waitForSelector('.Nv2PK', { timeout: 10000 }),
			() => this.page.waitForSelector('.bfdHYd', { timeout: 10000 }),
			() => this.page.waitForSelector('[data-result-index]', { timeout: 10000 }),
			() => this.page.waitForSelector('.lI9IFe', { timeout: 10000 }),
			() => this.page.waitForSelector('[jsaction*="pane"]', { timeout: 10000 }),
		];

		for (const strategy of waitStrategies) {
			try {
				await strategy();
				console.log("✅ GMB results loaded");
				return;
			} catch (error) {
				continue;
			}
		}

		// Fallback wait
		console.log("⚠️ Using fallback wait for GMB results");
		await this.page.waitForTimeout(5000);
	}

	async _extractAllGMBListings(targetResults) {
		let allListings = [];
		let previousCount = 0;
		let scrollAttempts = 0;
		const maxScrollAttempts = config.GMB?.SCROLL_ATTEMPTS || 3;

		while (allListings.length < targetResults && scrollAttempts < maxScrollAttempts) {
			// Extract current visible listings
			const currentListings = await this._extractVisibleGMBListings();
			
			// Merge with existing listings (avoid duplicates)
			const existingUrls = new Set(allListings.map(listing => listing.url || listing.name));
			const newListings = currentListings.filter(listing => 
				!existingUrls.has(listing.url || listing.name)
			);
			
			allListings.push(...newListings);
			
			console.log(`📊 Extracted ${currentListings.length} listings, ${newListings.length} new, total: ${allListings.length}`);

			// If we haven't found new results, try scrolling
			if (allListings.length === previousCount) {
				scrollAttempts++;
				console.log(`📜 Scrolling to load more results (attempt ${scrollAttempts}/${maxScrollAttempts})`);
				
				await this._scrollToLoadMore();
				await this.page.waitForTimeout(3000);
			} else {
				previousCount = allListings.length;
				scrollAttempts = 0; // Reset scroll attempts if we found new results
			}

			// Break if we have enough results
			if (allListings.length >= targetResults) {
				break;
			}
		}

		// Click on listings to get detailed contact information
		if (config.GMB?.CLICK_FOR_DETAILS && !config.GMB?.ULTRA_FAST_MODE && allListings.length > 0) {
			console.log(`🔍 Clicking on listings to get detailed contact information...`);
			allListings = await this._getDetailedContactInfo(allListings);
		} else if (config.GMB?.ULTRA_FAST_MODE) {
			console.log(`⚡ Ultra fast mode: Skipping detail clicks for maximum speed`);
		}

		// Filter listings to only include those with contact info if required
		if (config.GMB?.REQUIRE_CONTACT) {
			const listingsWithContact = allListings.filter(listing => 
				listing.phone || listing.email
			);
			console.log(`📞 Filtered to ${listingsWithContact.length} listings with contact info (from ${allListings.length} total)`);
			return listingsWithContact.slice(0, targetResults);
		}

		// Return only the requested number of results
		return allListings.slice(0, targetResults);
	}

	async _extractVisibleGMBListings() {
		try {
			return await this.page.evaluate((extractFields) => {
				const listings = [];
				
				// Google Maps specific selectors for business listing containers
				// Based on debug output, we know these exist: .Nv2PK, .bfdHYd, .lI9IFe
				const selectors = [
					'.bfdHYd',                         // Individual business card (confirmed exists)
					'.Nv2PK',                          // Business listing container (confirmed exists)  
					'.lI9IFe',                         // Listing item (confirmed exists)
					'[data-result-index]',             // Indexed results
					'[role="main"] [role="article"]',  // Main articles in Google Maps
					'[jsaction*="pane"]',              // Pane elements
					'.VkpGBb',                         // Alternative container
					'[data-cid]',                      // Business with CID
					'[data-feature-id]'                // Feature ID elements
				];

				let elements = [];
				for (const selector of selectors) {
					elements = document.querySelectorAll(selector);
					if (elements.length > 0) {
						console.log(`Found ${elements.length} elements with selector: ${selector}`);
						break;
					}
				}

				// Extract data from each element
				elements.forEach((element, index) => {
					try {
						// Debug: Log element info for first few elements
						if (index < 3) {
							console.log(`Element ${index} preview:`, element.textContent.substring(0, 100));
						}
						
						const listing = {
							position: index + 1,
							source: "Google My Business"
						};

						// Extract business name
						if (extractFields.NAME) {
							const nameSelectors = [
								'.qBF1Pd',                    // Primary name selector
								'.DUwDvf',                    // Alternative name selector
								'.fontHeadlineSmall',         // Headline text
								'[data-attrid="title"]',      // Title attribute
								'h3',                         // Standard heading
								'.dbg0pd',                    // Name container
								'[role="heading"]',           // Heading role
								'.rllt__details h3',          // Details heading
								'a[data-cid] div',            // Business link name
								'[jsaction*="click"] div',    // Clickable name
								'a[href*="place"] span',      // Place link span
								'div[role="button"] span'     // Button span
							];
							
							for (const selector of nameSelectors) {
								const nameElement = element.querySelector(selector);
								if (nameElement && nameElement.textContent.trim()) {
									listing.name = nameElement.textContent.trim();
									listing.title = listing.name;
									if (index < 3) console.log(`Found name with selector ${selector}: ${listing.name}`);
									break;
								}
							}
							
							// If no name found with specific selectors, try text parsing
							if (!listing.name) {
								const allText = element.textContent || '';
								const lines = allText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
								
								// Look for the first substantial line that's not a rating or address
								for (const line of lines) {
									if (line.length > 3 && 
										!line.match(/^\d+\.\d+/) && // Not a rating like "4.5"
										!line.match(/^\(\d+\)/) && // Not review count like "(123)"
										!line.match(/^\d+\s+(min|km|mi)/) && // Not distance
										!line.includes('·') && // Not category with separator
										line.length < 50) { // Not too long to be a description
										listing.name = line;
										listing.title = line;
										if (index < 3) console.log(`Found name from text parsing: ${listing.name}`);
										break;
									}
								}
							}
						}

						// Extract phone number
						if (extractFields.PHONE) {
							const phoneSelectors = [
								'[data-attrid*="phone"]',      // Phone attribute
								'[aria-label*="phone"]',       // Phone aria label
								'[aria-label*="Phone"]',       // Phone aria label (capitalized)
								'[aria-label*="Call"]',        // Call button aria label
								'.UsdlK',                      // Phone container
								'[data-value*="+"]',           // Phone data value
								'span[jsaction*="phone"]',     // Phone action
								'[role="button"][aria-label*="Call"]', // Call button
								'button[aria-label*="Call"]',  // Call button alternative
								'button[data-value*="+"]',     // Button with phone data
								'[jsaction*="call"]'           // Call action
							];
							
							for (const selector of phoneSelectors) {
								const phoneElement = element.querySelector(selector);
								if (phoneElement) {
									const phoneText = phoneElement.textContent || 
													phoneElement.getAttribute('data-value') || 
													phoneElement.getAttribute('aria-label') || 
													phoneElement.getAttribute('title') || '';
									
									// Look for phone patterns in the text
									const phoneMatch = phoneText.match(/[\+]?[1]?[\s\-\.]?\(?[0-9]{3}\)?[\s\-\.]?[0-9]{3}[\s\-\.]?[0-9]{4}/);
									if (phoneMatch) {
										listing.phone = phoneMatch[0].trim();
										if (index < 3) console.log(`Found phone with selector ${selector}: ${listing.phone}`);
										break;
									}
								}
							}
							
							// Also search in the entire element text for phone numbers
							if (!listing.phone) {
								const elementText = element.textContent || '';
								const phoneMatch = elementText.match(/[\+]?[1]?[\s\-\.]?\(?[0-9]{3}\)?[\s\-\.]?[0-9]{3}[\s\-\.]?[0-9]{4}/);
								if (phoneMatch) {
									listing.phone = phoneMatch[0].trim();
									if (index < 3) console.log(`Found phone from text parsing: ${listing.phone}`);
								}
							}
						}

						// Extract email (less common in GMB listings, but check anyway)
						if (extractFields.EMAIL) {
							const textContent = element.textContent || '';
							const emailMatch = textContent.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
							if (emailMatch) {
								listing.email = emailMatch[0];
							}
						}

						// Extract address
						if (extractFields.ADDRESS) {
							const addressSelectors = [
								'.W4Efsd:last-child',              // Last W4Efsd element (often address)
								'.W4Efsd[data-attrid*="address"]', // Address attribute
								'.LrzXr',                          // Address container
								'[data-attrid*="address"]',        // Address data attribute
								'[aria-label*="Address"]',         // Address aria label
								'span[jsaction*="address"]',       // Address action
								'.rogA2c',                         // Address text container
								'[data-value*="Address"]'          // Address data value
							];
							
							for (const selector of addressSelectors) {
								const addressElement = element.querySelector(selector);
								if (addressElement && addressElement.textContent.trim()) {
									const addressText = addressElement.textContent.trim();
									// Filter out obvious non-address text
									if (addressText.length > 10 && !addressText.match(/^[0-9\.\s\-\(\)]+$/)) {
										listing.address = addressText;
										break;
									}
								}
							}
						}

						// Extract website
						if (extractFields.WEBSITE) {
							const websiteSelectors = [
								'a[href*="http"]:not([href*="google.com"])',  // Direct external links
								'[data-attrid*="website"]',                   // Website attribute
								'[aria-label*="Website"]',                    // Website aria label
								'button[aria-label*="Website"]',              // Website button
								'[jsaction*="website"]'                       // Website action
							];
							
							for (const selector of websiteSelectors) {
								const websiteElement = element.querySelector(selector);
								if (websiteElement) {
									const websiteUrl = websiteElement.href || 
													 websiteElement.getAttribute('data-value') || 
													 websiteElement.getAttribute('data-url');
									if (websiteUrl && !websiteUrl.includes('google.com')) {
										listing.website = websiteUrl;
										listing.url = websiteUrl;
										if (index < 3) console.log(`Found website: ${listing.website}`);
										break;
									}
								}
							}
						}

						// Set default URL if no website found
						if (!listing.url && listing.name) {
							listing.url = `https://www.google.com/search?q=${encodeURIComponent(listing.name)}`;
						}

						// Add extraction timestamp
						listing.extractedAt = new Date().toISOString();

						// Only add if we have a name
						if (listing && listing.name && listing.name.length > 2) {
							listings.push(listing);
						} else if (index < 3) {
							console.log(`Element ${index} failed extraction - no valid name found`);
						}

					} catch (error) {
						console.log(`Error extracting listing ${index}:`, error);
					}
				});

				console.log(`Extracted ${listings.length} valid listings from ${elements.length} elements`);
				return listings;
			}, config.GMB?.EXTRACT_FIELDS || {});

		} catch (error) {
			console.error("Error extracting visible GMB listings:", error.message);
			return [];
		}
	}

	async _scrollToLoadMore() {
		try {
			console.log("🔄 Attempting multiple scroll strategies to load more results...");
			
			// Strategy 1: Scroll within the results panel multiple times
			for (let i = 0; i < 3; i++) {
				await this.page.evaluate(() => {
					// Try to find the scrollable results container
					const scrollableSelectors = [
						'[role="main"]',
						'.m6QErb .siAUzd', // More specific selector
						'.siAUzd',
						'#pane',
						'[data-value="Search results"]'
					];

					let scrollContainer = null;
					for (const selector of scrollableSelectors) {
						scrollContainer = document.querySelector(selector);
						if (scrollContainer) {
							console.log(`Found scrollable container: ${selector}`);
							break;
						}
					}

					if (scrollContainer) {
						const currentScrollTop = scrollContainer.scrollTop;
						scrollContainer.scrollTop = scrollContainer.scrollHeight;
						console.log(`Scrolled from ${currentScrollTop} to ${scrollContainer.scrollTop}`);
					} else {
						// Fallback to window scroll
						window.scrollTo(0, document.body.scrollHeight);
						console.log("Used window scroll fallback");
					}
				});
				
				await this.page.waitForTimeout(1500); // Wait for content to load
			}

			// Strategy 2: Try keyboard navigation
			await this.page.keyboard.press('End');
			await this.page.waitForTimeout(1000);
			
			// Strategy 3: Multiple Page Down presses
			for (let i = 0; i < 5; i++) {
				await this.page.keyboard.press('PageDown');
				await this.page.waitForTimeout(500);
			}
			
			// Strategy 4: Try to click "Show more results" button if it exists
			try {
				const moreButton = await this.page.locator('text="Show more results", text="More results", [aria-label*="more"], [aria-label*="More"]').first();
				if (await moreButton.count() > 0) {
					console.log("🔘 Found 'More results' button, clicking...");
					await moreButton.click();
					await this.page.waitForTimeout(2000);
				}
			} catch (error) {
				// Button not found, continue
			}
			
			// Strategy 5: Simulate mouse wheel scrolling
			await this.page.mouse.wheel(0, 1000);
			await this.page.waitForTimeout(1000);
			
			console.log("✅ Completed all scroll strategies");
			
		} catch (error) {
			console.log("Error scrolling:", error.message);
		}
	}

	async _debugPageElements() {
		try {
			const debugInfo = await this.page.evaluate(() => {
				const info = {
					url: window.location.href,
					title: document.title,
					bodyText: document.body ? document.body.textContent.substring(0, 200) : 'No body',
					elementCounts: {}
				};

				// Check for various selectors
				const selectorsToCheck = [
					'[role="main"]',
					'[role="article"]', 
					'[role="main"] [role="article"]',
					'.Nv2PK',
					'.bfdHYd',
					'[data-result-index]',
					'.lI9IFe',
					'[data-cid]',
					'[data-feature-id]',
					'a[href*="place"]',
					'div[jsaction]',
					'h3',
					'[aria-label*="stars"]'
				];

				selectorsToCheck.forEach(selector => {
					const elements = document.querySelectorAll(selector);
					info.elementCounts[selector] = elements.length;
				});

				return info;
			});

		} catch (error) {
			console.log("Debug error:", error.message);
		}
	}

	async _getDetailedContactInfo(listings) {
		const maxClicks = Math.min(listings.length, config.GMB?.MAX_DETAIL_CLICKS || 3);
		const detailedListings = [];
		const fastMode = config.GMB?.FAST_MODE || false;

		console.log(`🔍 Getting detailed info for ${maxClicks} listings${fastMode ? ' (fast mode)' : ''}...`);

		// Fast mode: Try to extract contact info without clicking first
		if (fastMode) {
			console.log(`⚡ Fast mode: Attempting to extract contact info from search results...`);
			const fastExtracted = await this._fastExtractContactInfo(listings);
			
			// Count how many already have contact info
			const withContact = fastExtracted.filter(l => l.phone || l.email).length;
			console.log(`⚡ Fast extraction found contact info for ${withContact} listings`);
			
			// If we have enough contact info, return early
			if (withContact >= maxClicks) {
				console.log(`⚡ Fast mode success: Found enough contact info without clicking`);
				return fastExtracted;
			}
			
			// Otherwise, continue with clicking for remaining listings
			listings = fastExtracted;
		}

		for (let i = 0; i < maxClicks; i++) {
			const listing = { ...listings[i] }; // Clone the listing
			
			// Skip if already has contact info (from fast extraction)
			if (fastMode && (listing.phone || listing.email)) {
				console.log(`⚡ Skipping ${listing.name} - already has contact info`);
				detailedListings.push(listing);
				continue;
			}
			
			try {
				console.log(`📱 Clicking on listing ${i + 1}: ${listing.name}`);
				
				// Find and click the listing element
				const clicked = await this._clickOnListing(listing.name, i);
				
				if (clicked) {
					// Reduced wait time for faster processing
					await this.page.waitForTimeout(config.GMB?.DETAIL_WAIT_TIME || 1500);
					
					// Extract detailed contact information
					const detailedInfo = await this._extractDetailedInfo();
					
					// Merge detailed info with existing listing data
					Object.assign(listing, detailedInfo);
					
					console.log(`✅ Got details for ${listing.name}: Phone=${listing.phone || 'N/A'}, Email=${listing.email || 'N/A'}`);
					
					// Fast navigation back
					await this._fastGoBack();
				} else {
					console.log(`⚠️ Could not click on listing: ${listing.name}`);
				}
				
			} catch (error) {
				console.log(`❌ Error getting details for ${listing.name}:`, error.message);
			}
			
			detailedListings.push(listing);
			
			// Reduced delay between clicks for speed
			if (fastMode) {
				await this.page.waitForTimeout(500);
			} else {
				await this.page.waitForTimeout(1000);
			}
		}

		// Add remaining listings without detailed info
		for (let i = maxClicks; i < listings.length; i++) {
			detailedListings.push(listings[i]);
		}

		return detailedListings;
	}

	async _clickOnListing(listingName, index) {
		try {
			const fastMode = config.GMB?.FAST_MODE || false;
			
			// In fast mode, prioritize index-based clicking (fastest)
			const clickStrategies = fastMode ? [
				// Fast Strategy 1: Click by index (fastest, no text matching)
				async () => {
					const elements = await this.page.locator('.bfdHYd, .Nv2PK, .lI9IFe').all();
					if (elements.length > index) {
						await elements[index].click({ timeout: 3000 });
						return true;
					}
					return false;
				},
				
				// Fast Strategy 2: Click by partial text (reduced timeout)
				async () => {
					const element = await this.page.locator(`text*="${listingName.substring(0, 10)}"`).first();
					if (await element.count() > 0) {
						await element.click({ timeout: 2000 });
						return true;
					}
					return false;
				}
			] : [
				// Regular strategies for non-fast mode
				async () => {
					const element = await this.page.locator(`text="${listingName}"`).first();
					if (await element.count() > 0) {
						await element.click();
						return true;
					}
					return false;
				},
				
				async () => {
					const element = await this.page.locator(`text*="${listingName.substring(0, 15)}"`).first();
					if (await element.count() > 0) {
						await element.click();
						return true;
					}
					return false;
				},
				
				async () => {
					const elements = await this.page.locator('.bfdHYd, .Nv2PK, .lI9IFe').all();
					if (elements.length > index) {
						await elements[index].click();
						return true;
					}
					return false;
				},
				
				async () => {
					const element = await this.page.locator(`[role="button"]:has-text("${listingName}"), a:has-text("${listingName}"), div[jsaction]:has-text("${listingName}")`).first();
					if (await element.count() > 0) {
						await element.click();
						return true;
					}
					return false;
				}
			];

			for (const strategy of clickStrategies) {
				try {
					if (await strategy()) {
						return true;
					}
				} catch (error) {
					continue; // Try next strategy
				}
			}

			return false;
		} catch (error) {
			console.log(`Error clicking on listing: ${error.message}`);
			return false;
		}
	}

	async _extractDetailedInfo() {
		try {
			return await this.page.evaluate(() => {
				const info = {};

				// Extract phone number from detail page
				const phoneSelectors = [
					'[data-attrid*="phone"]',
					'[aria-label*="phone"]',
					'[aria-label*="Phone"]',
					'[aria-label*="Call"]',
					'button[aria-label*="Call"]',
					'[data-value*="+"]',
					'[href^="tel:"]',
					'.rogA2c', // Phone number container
					'[jsaction*="phone"]',
					'[data-phone]'
				];

				for (const selector of phoneSelectors) {
					const element = document.querySelector(selector);
					if (element) {
						const text = element.textContent || 
									element.getAttribute('data-value') || 
									element.getAttribute('aria-label') || 
									element.getAttribute('href') || '';
						
						const phoneMatch = text.match(/[\+]?[1]?[\s\-\.]?\(?[0-9]{3}\)?[\s\-\.]?[0-9]{3}[\s\-\.]?[0-9]{4}/);
						if (phoneMatch) {
							info.phone = phoneMatch[0].trim();
							break;
						}
					}
				}

				// Extract email from detail page
				const emailSelectors = [
					'[href^="mailto:"]',
					'[data-attrid*="email"]',
					'[aria-label*="email"]',
					'[aria-label*="Email"]',
					'[data-email]'
				];

				for (const selector of emailSelectors) {
					const element = document.querySelector(selector);
					if (element) {
						const text = element.textContent || 
									element.getAttribute('href') || 
									element.getAttribute('data-value') || '';
						
						const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
						if (emailMatch) {
							info.email = emailMatch[0];
							break;
						}
					}
				}

				// Also search in all text content for phone/email
				if (!info.phone || !info.email) {
					const allText = document.body.textContent || '';
					
					if (!info.phone) {
						const phoneMatch = allText.match(/[\+]?[1]?[\s\-\.]?\(?[0-9]{3}\)?[\s\-\.]?[0-9]{3}[\s\-\.]?[0-9]{4}/);
						if (phoneMatch) {
							info.phone = phoneMatch[0].trim();
						}
					}
					
					if (!info.email) {
						const emailMatch = allText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
						if (emailMatch) {
							info.email = emailMatch[0];
						}
					}
				}

				// Extract website if not already found
				if (!info.website) {
					const websiteElement = document.querySelector('a[href*="http"]:not([href*="google.com"])');
					if (websiteElement) {
						info.website = websiteElement.href;
					}
				}

				return info;
			});
		} catch (error) {
			console.log(`Error extracting detailed info: ${error.message}`);
			return {};
		}
	}

	async _goBackToSearchResults() {
		try {
			// Try multiple strategies to go back
			const backStrategies = [
				// Strategy 1: Use browser back button
				async () => {
					await this.page.goBack();
					return true;
				},
				
				// Strategy 2: Click back button if visible
				async () => {
					const backButton = this.page.locator('[aria-label*="Back"], [aria-label*="back"], button:has-text("Back")').first();
					if (await backButton.count() > 0) {
						await backButton.click();
						return true;
					}
					return false;
				},
				
				// Strategy 3: Press Escape key
				async () => {
					await this.page.keyboard.press('Escape');
					return true;
				}
			];

			for (const strategy of backStrategies) {
				try {
					await strategy();
					// Wait for search results to load
					await this.page.waitForTimeout(2000);
					
					// Check if we're back to search results
					const searchResults = await this.page.locator('.bfdHYd, .Nv2PK').count();
					if (searchResults > 0) {
						return true;
					}
				} catch (error) {
					continue; // Try next strategy
				}
			}

			console.log('⚠️ Could not navigate back to search results');
			return false;
		} catch (error) {
			console.log(`Error going back to search results: ${error.message}`);
			return false;
		}
	}

	async _fastExtractContactInfo(listings) {
		console.log(`⚡ Fast extraction: Scanning search results for visible contact info...`);
		
		try {
			// Try to extract contact info that might be visible in search results
			const enhancedListings = await this.page.evaluate((listingsData) => {
				const enhanced = listingsData.map(listing => ({ ...listing }));
				
				// Look for phone numbers in the current page content
				const allText = document.body.textContent || '';
				const phoneMatches = allText.match(/[\+]?[1]?[\s\-\.]?\(?[0-9]{3}\)?[\s\-\.]?[0-9]{3}[\s\-\.]?[0-9]{4}/g) || [];
				
				// Try to match phone numbers to businesses
				enhanced.forEach((listing, index) => {
					if (!listing.phone && phoneMatches.length > index) {
						// Simple heuristic: assign phone numbers in order
						listing.phone = phoneMatches[index];
					}
				});
				
				return enhanced;
			}, listings);
			
			return enhancedListings;
		} catch (error) {
			console.log(`Fast extraction error: ${error.message}`);
			return listings;
		}
	}

	async _fastGoBack() {
		try {
			// Use the fastest method to go back
			await this.page.keyboard.press('Escape');
			await this.page.waitForTimeout(800); // Reduced wait time
			
			// Quick check if we're back
			const searchResults = await this.page.locator('.bfdHYd, .Nv2PK').count();
			if (searchResults > 0) {
				return true;
			}
			
			// Fallback to browser back
			await this.page.goBack();
			await this.page.waitForTimeout(1000);
			return true;
		} catch (error) {
			console.log(`Fast go back error: ${error.message}`);
			return false;
		}
	}


	async close() {
		try {
			await this._cleanup();
			console.log("🏢 GMB Scraper closed successfully");
		} catch (error) {
			console.error("❌ Error closing GMB Scraper:", error.message);
		}
	}

	async _cleanup() {
		try {
			if (this.page) await this.page.close();
			if (this.context) await this.context.close();
			if (this.browser) await this.browser.close();
			this.isInitialized = false;
		} catch (error) {
			console.error("Error during GMB cleanup:", error.message);
		}
	}

	getStatus() {
		return {
			isInitialized: this.isInitialized,
			hasBrowser: !!this.browser,
			hasContext: !!this.context,
			hasPage: !!this.page,
		};
	}
}

module.exports = GMBScraper;

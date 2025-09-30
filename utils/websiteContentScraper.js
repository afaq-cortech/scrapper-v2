const config = require("../config");
const ChildLinkExtractor = require("./childLinkExtractor");
require("dotenv").config();

class WebsiteContentScraper {
	constructor(context) {
		this.context = context;
		this.maxConcurrent = 3;
		this.childLinkExtractor = new ChildLinkExtractor();
		this.depthScrapingEnabled = config.DEPTH_SCRAPING?.ENABLED || false;
	}

	async scrapeWebsites(urls, depth = 0) {
		console.log(`Starting to scrape ${urls.length} websites${depth > 0 ? ` (depth: ${depth})` : ''}`);

		const results = [];
		const batches = this.createBatches(urls, this.maxConcurrent);

		for (let i = 0; i < batches.length; i++) {
			console.log(`Processing batch ${i + 1}/${batches.length}`);

			const batchResults = await Promise.allSettled(
				batches[i].map((urlData) =>
					this.scrapeWebsite(urlData.url || urlData.link, urlData, depth)
				)
			);

			const successful = batchResults
				.filter((result) => result.status === "fulfilled" && result.value)
				.map((result) => result.value);

			results.push(...successful);

			// Add delay between batches
			if (i < batches.length - 1) {
				await this.delay(2000);
			}
		}

		console.log(
			`Website scraping completed: ${results.length} successful, ${
				urls.length - results.length
			} failed`
		);
		return results;
	}

	async scrapeWebsitesWithDepth(urls, maxDepth = 1) {
		if (!this.depthScrapingEnabled) {
			console.log('⚠️ Depth scraping is disabled, falling back to regular scraping');
			return this.scrapeWebsites(urls);
		}

		console.log(`🚀 Starting depth-based scraping (max depth: ${maxDepth})`);
		
		const allResults = [];
		const urlsToProcess = [...urls];
		const processedUrls = new Set();
		
		// Clear visited URLs for new scraping session
		this.childLinkExtractor.clearVisited();

		for (let currentDepth = 0; currentDepth <= maxDepth; currentDepth++) {
			if (urlsToProcess.length === 0) {
				console.log(`✅ No more URLs to process at depth ${currentDepth}`);
				break;
			}

			console.log(`\n📊 Processing depth ${currentDepth}: ${urlsToProcess.length} URLs`);

			// Filter out already processed URLs
			const newUrls = urlsToProcess.filter(urlData => {
				const url = urlData.url || urlData.link;
				return !processedUrls.has(url);
			});

			if (newUrls.length === 0) {
				console.log(`⚠️ No new URLs to process at depth ${currentDepth}`);
				break;
			}

			// Mark URLs as processed
			newUrls.forEach(urlData => {
				const url = urlData.url || urlData.link;
				processedUrls.add(url);
				this.childLinkExtractor.markAsVisited(url);
			});

			// Scrape current depth URLs
			const depthResults = await this.scrapeWebsites(newUrls, currentDepth);
			allResults.push(...depthResults);

			// If we haven't reached max depth, extract child links
			if (currentDepth < maxDepth) {
				const childLinks = await this.extractChildLinksFromResults(depthResults);
				
				if (childLinks.length > 0) {
					console.log(`🔗 Found ${childLinks.length} child links for depth ${currentDepth + 1}`);
					
					// Add child links to processing queue
					const childUrlData = childLinks.map(link => ({
						url: link.url,
						title: link.text,
						snippet: link.title,
						keyword: link.parentUrl,
						depth: link.depth,
						parentUrl: link.parentUrl
					}));

					urlsToProcess.push(...childUrlData);
				} else {
					console.log(`⚠️ No child links found at depth ${currentDepth}`);
				}
			}

			// Add delay between depth levels
			if (currentDepth < maxDepth) {
				const delay = config.DEPTH_SCRAPING?.DELAY_BETWEEN_CHILD_REQUESTS || 2000;
				console.log(`⏳ Waiting ${delay}ms before processing next depth...`);
				await this.delay(delay);
			}
		}

		console.log(`\n🎉 Depth scraping completed! Total results: ${allResults.length}`);
		console.log(`📊 Processed URLs: ${processedUrls.size}`);
		console.log(`🔗 Child link extractor stats:`, this.childLinkExtractor.getStats());

		return allResults;
	}

	async scrapeWebsite(url, metadata = {}, depth = 0) {
		let page = null;

		try {
			console.log(`Scraping website: ${url}${depth > 0 ? ` (depth: ${depth})` : ''}`);

			page = await this.context.newPage();

			// Set timeout and navigation options
			page.setDefaultTimeout(config.PERFORMANCE?.PAGE_TIMEOUT || 30000);

			await page.goto(url, {
				waitUntil: "domcontentloaded",
				timeout: config.PERFORMANCE?.NAVIGATION_TIMEOUT || 30000,
			});

			// Wait for content to load
			await page.waitForTimeout(2000);

			// Extract clean text content
			const content = await this.extractContent(page);

			if (!content || content.length < 100) {
				throw new Error("Insufficient content extracted");
			}

			// Extract child links if depth scraping is enabled and we haven't reached max depth
			let childLinks = [];
			if (this.depthScrapingEnabled && depth < (config.DEPTH_SCRAPING?.MAX_DEPTH || 3)) {
				try {
					childLinks = await this.childLinkExtractor.extractChildLinks(page, url, depth);
				} catch (error) {
					console.log(`⚠️ Failed to extract child links from ${url}:`, error.message);
				}
			}

			await this.delay(1000, 3000); // Random delay between requests

			return {
				url,
				content,
				metadata: {
					...metadata,
					depth: depth,
					parentUrl: metadata.parentUrl || null
				},
				extractedAt: new Date().toISOString(),
				contentLength: content.length,
				childLinks: childLinks,
				depth: depth
			};
		} catch (error) {
			console.log(`Failed to scrape ${url}:`, error.message);
			return null;
		} finally {
			if (page) {
				await page.close();
			}
		}
	}

	async extractChildLinksFromResults(results) {
		const allChildLinks = [];
		
		for (const result of results) {
			if (result && result.childLinks && result.childLinks.length > 0) {
				allChildLinks.push(...result.childLinks);
			}
		}

		// Remove duplicates based on URL
		const uniqueChildLinks = [];
		const seenUrls = new Set();

		for (const link of allChildLinks) {
			if (!seenUrls.has(link.url)) {
				seenUrls.add(link.url);
				uniqueChildLinks.push(link);
			}
		}

		return uniqueChildLinks;
	}

	async extractContent(page) {
		return await page.evaluate(() => {
			// Remove unwanted elements
			const unwantedSelectors = [
				"script",
				"style",
				"nav",
				"header",
				"footer",
				".navigation",
				".menu",
				".sidebar",
				".ads",
				".advertisement",
				".social",
				".comments",
				'[class*="cookie"]',
				'[class*="popup"]',
				'[class*="modal"]',
				".breadcrumb",
			];

			unwantedSelectors.forEach((selector) => {
				const elements = document.querySelectorAll(selector);
				elements.forEach((el) => el.remove());
			});

			// Priority selectors for main content
			const contentSelectors = [
				"main",
				'[role="main"]',
				".main-content",
				".content",
				".page-content",
				".post-content",
				".entry-content",
				"article",
				".article",
			];

			let mainContent = null;

			// Try to find main content area
			for (const selector of contentSelectors) {
				const element = document.querySelector(selector);
				if (element) {
					mainContent = element;
					break;
				}
			}

			// Fallback to body if no main content found
			if (!mainContent) {
				mainContent = document.body;
			}

			// Extract text content
			let text = mainContent.innerText || mainContent.textContent || "";

			// Clean up the text
			text = text
				.replace(/\s+/g, " ") // Replace multiple spaces with single space
				.replace(/\n+/g, "\n") // Replace multiple newlines with single newline
				.replace(/\t+/g, " ") // Replace tabs with spaces
				.trim();

			return text;
		});
	}

	createBatches(array, batchSize) {
		const batches = [];
		for (let i = 0; i < array.length; i += batchSize) {
			batches.push(array.slice(i, i + batchSize));
		}
		return batches;
	}

	delay(min, max) {
		const delay = Math.floor(Math.random() * (max - min + 1)) + min;
		return new Promise((resolve) => setTimeout(resolve, delay));
	}
}

module.exports = WebsiteContentScraper;

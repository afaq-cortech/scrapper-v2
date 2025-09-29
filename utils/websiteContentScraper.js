const config = require("../config");
require("dotenv").config();

class WebsiteContentScraper {
	constructor(context) {
		this.context = context;
		this.maxConcurrent = 3;
	}

	async scrapeWebsites(urls) {
		console.log(`Starting to scrape ${urls.length} websites`);

		const results = [];
		const batches = this.createBatches(urls, this.maxConcurrent);

		for (let i = 0; i < batches.length; i++) {
			console.log(`Processing batch ${i + 1}/${batches.length}`);

			const batchResults = await Promise.allSettled(
				batches[i].map((urlData) =>
					this.scrapeWebsite(urlData.url || urlData.link, urlData)
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

	async scrapeWebsite(url, metadata = {}) {
		let page = null;

		try {
			console.log(`Scraping website: ${url}`);

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

			await this.delay(1000, 3000); // Random delay between requests

			return {
				url,
				content,
				metadata,
				extractedAt: new Date().toISOString(),
				contentLength: content.length,
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

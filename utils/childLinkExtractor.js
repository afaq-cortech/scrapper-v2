const config = require("../config");
const { URL } = require("url");

class ChildLinkExtractor {
	constructor() {
		this.config = config.DEPTH_SCRAPING;
		this.visitedUrls = new Set();
		this.maxDepth = this.config.MAX_DEPTH;
		this.maxChildLinksPerPage = this.config.MAX_CHILD_LINKS_PER_PAGE;
		this.excludePatterns = this.config.EXCLUDE_PATTERNS;
		this.includePatterns = this.config.INCLUDE_PATTERNS;
	}

	/**
	 * Extract child links from a webpage
	 * @param {Object} page - Playwright page object
	 * @param {string} baseUrl - The base URL of the current page
	 * @param {number} currentDepth - Current depth level
	 * @returns {Array} Array of child link objects
	 */
	async extractChildLinks(page, baseUrl, currentDepth = 0) {
		try {
			console.log(`🔗 Extracting child links from: ${baseUrl} (depth: ${currentDepth})`);

			// Extract all links from the page
			const allLinks = await page.evaluate(() => {
				const links = [];
				const anchors = document.querySelectorAll('a[href]');
				
				for (const anchor of anchors) {
					const href = anchor.getAttribute('href');
					const text = anchor.textContent.trim();
					const title = anchor.getAttribute('title') || '';
					
					if (href && text) {
						links.push({
							href: href,
							text: text,
							title: title,
							element: {
								tagName: anchor.tagName,
								className: anchor.className,
								id: anchor.id
							}
						});
					}
				}
				
				return links;
			});

			console.log(`📊 Found ${allLinks.length} total links on page`);
			
			// Debug: Show some sample links for profile-related content
			const profileLinks = allLinks.filter(link => 
				link.href.includes('/profile/') || 
				link.text.toLowerCase().includes('profile') ||
				link.href.includes('/people/')
			);
			
			if (profileLinks.length > 0) {
				console.log(`👥 Found ${profileLinks.length} profile-related links:`);
				profileLinks.slice(0, 5).forEach(link => {
					console.log(`   - ${link.text} -> ${link.href}`);
				});
			}

			// Filter and process links
			const childLinks = this.filterAndProcessLinks(allLinks, baseUrl, currentDepth);
			
			console.log(`✅ Found ${childLinks.length} valid child links from ${baseUrl}`);
			
			// Debug: Show some sample child links
			if (childLinks.length > 0) {
				console.log(`🔍 Sample child links:`);
				childLinks.slice(0, 5).forEach(link => {
					console.log(`   - ${link.text} -> ${link.url}`);
				});
			}
			
			return childLinks;

		} catch (error) {
			console.error(`❌ Error extracting child links from ${baseUrl}:`, error.message);
			return [];
		}
	}

	/**
	 * Filter and process raw links to get valid child links
	 * @param {Array} rawLinks - Raw links from the page
	 * @param {string} baseUrl - Base URL for resolving relative links
	 * @param {number} currentDepth - Current depth level
	 * @returns {Array} Filtered child links
	 */
	filterAndProcessLinks(rawLinks, baseUrl, currentDepth) {
		const childLinks = [];
		const baseDomain = this.getDomain(baseUrl);
		const seenUrls = new Set();
		let filteredCount = 0;
		let resolvedCount = 0;
		let visitedCount = 0;

		console.log(`🔍 Processing ${rawLinks.length} raw links...`);

		for (const link of rawLinks) {
			try {
				// Skip if we've already processed this URL
				if (seenUrls.has(link.href)) {
					continue;
				}

				// Resolve relative URLs
				const resolvedUrl = this.resolveUrl(link.href, baseUrl);
				
				// Skip if URL resolution failed
				if (!resolvedUrl) {
					continue;
				}
				resolvedCount++;

				// Skip if we've already visited this URL
				if (this.visitedUrls.has(resolvedUrl)) {
					visitedCount++;
					continue;
				}

				// Apply filtering rules
				if (!this.isValidChildLink(resolvedUrl, link, baseDomain)) {
					filteredCount++;
					continue;
				}

				// Add to seen URLs to avoid duplicates
				seenUrls.add(resolvedUrl);

				// Create child link object
				const childLink = {
					url: resolvedUrl,
					text: link.text,
					title: link.title,
					depth: currentDepth + 1,
					parentUrl: baseUrl,
					element: link.element,
					extractedAt: new Date().toISOString()
				};

				childLinks.push(childLink);

				// Limit the number of child links per page
				if (childLinks.length >= this.maxChildLinksPerPage) {
					console.log(`⚠️ Reached maximum child links per page (${this.maxChildLinksPerPage})`);
					break;
				}

			} catch (error) {
				console.log(`⚠️ Error processing link ${link.href}:`, error.message);
				continue;
			}
		}

		console.log(`📈 Filtering stats: ${resolvedCount} resolved, ${visitedCount} already visited, ${filteredCount} filtered out, ${childLinks.length} accepted`);

		return childLinks;
	}

	/**
	 * Check if a link is a valid child link
	 * @param {string} url - The URL to check
	 * @param {Object} link - Link object with text and other properties
	 * @param {string} baseDomain - Base domain of the parent URL
	 * @returns {boolean} Whether the link is valid
	 */
	isValidChildLink(url, link, baseDomain) {
		try {
			const urlObj = new URL(url);

			// Must be HTTP or HTTPS
			if (!['http:', 'https:'].includes(urlObj.protocol)) {
				console.log(`❌ Invalid protocol: ${url}`);
				return false;
			}

			// Check exclude patterns - these will be rejected
			for (const pattern of this.excludePatterns) {
				if (url.includes(pattern) || link.text.toLowerCase().includes(pattern.toLowerCase())) {
					console.log(`❌ Excluded by pattern "${pattern}": ${url} (${link.text})`);
					return false;
				}
			}

			// Skip same domain check - allow cross-domain links
			// if (urlObj.hostname !== baseDomain) {
			// 	console.log(`❌ Different domain: ${urlObj.hostname} != ${baseDomain}`);
			// 	return false;
			// }

			// Skip very short link texts
			const linkText = link.text.toLowerCase();
			if (linkText.length < 3) {
				console.log(`❌ Too short: "${linkText}"`);
				return false;
			}

			// Skip generic navigation links
			const genericNavTexts = [
				'home', 'main', 'menu', 'navigation', 'nav', 'skip', 'top',
				'back', 'next', 'previous', 'more', 'less', 'hide',
				'click here', 'read more', 'learn more', 'view all', 'see more'
			];

			if (genericNavTexts.some(generic => linkText === generic)) {
				console.log(`❌ Generic nav text: "${linkText}"`);
				return false;
			}

			// Skip empty or whitespace-only links
			if (linkText.trim().length === 0) {
				console.log(`❌ Empty text`);
				return false;
			}

			// Skip links that are just symbols or numbers
			if (/^[^a-zA-Z]*$/.test(linkText.trim())) {
				console.log(`❌ No letters: "${linkText}"`);
				return false;
			}

			// Debug: Log accepted links for profile-related content
			if (url.includes('/profile/') || linkText.includes('profile') || url.includes('/people/')) {
				console.log(`✅ Profile link accepted: ${linkText} -> ${url}`);
			}

			// All other links are valid (open approach)
			return true;

		} catch (error) {
			console.log(`❌ Error validating link: ${error.message}`);
			return false;
		}
	}

	/**
	 * Resolve relative URLs to absolute URLs
	 * @param {string} href - The href attribute
	 * @param {string} baseUrl - Base URL for resolution
	 * @returns {string|null} Resolved URL or null if invalid
	 */
	resolveUrl(href, baseUrl) {
		try {
			// Skip javascript, mailto, tel, and anchor links
			if (href.startsWith('javascript:') || 
				href.startsWith('mailto:') || 
				href.startsWith('tel:') || 
				href.startsWith('#')) {
				return null;
			}

			// If it's already absolute, return as is
			if (href.startsWith('http://') || href.startsWith('https://')) {
				return href;
			}

			// Resolve relative URL
			const baseUrlObj = new URL(baseUrl);
			const resolvedUrl = new URL(href, baseUrl);
			
			return resolvedUrl.toString();
		} catch (error) {
			return null;
		}
	}

	/**
	 * Get domain from URL
	 * @param {string} url - The URL
	 * @returns {string} The domain
	 */
	getDomain(url) {
		try {
			const urlObj = new URL(url);
			return urlObj.hostname;
		} catch (error) {
			return '';
		}
	}

	/**
	 * Mark URL as visited
	 * @param {string} url - URL to mark as visited
	 */
	markAsVisited(url) {
		this.visitedUrls.add(url);
	}

	/**
	 * Check if URL has been visited
	 * @param {string} url - URL to check
	 * @returns {boolean} Whether URL has been visited
	 */
	isVisited(url) {
		return this.visitedUrls.has(url);
	}

	/**
	 * Clear visited URLs (useful for new scraping sessions)
	 */
	clearVisited() {
		this.visitedUrls.clear();
		console.log('🧹 Cleared visited URLs cache');
	}

	/**
	 * Get statistics about extracted links
	 * @returns {Object} Statistics object
	 */
	getStats() {
		return {
			totalVisited: this.visitedUrls.size,
			maxDepth: this.maxDepth,
			maxChildLinksPerPage: this.maxChildLinksPerPage,
			excludePatterns: this.excludePatterns.length,
			includePatterns: this.includePatterns.length
		};
	}

	/**
	 * Update configuration
	 * @param {Object} newConfig - New configuration object
	 */
	updateConfig(newConfig) {
		this.config = { ...this.config, ...newConfig };
		this.maxDepth = this.config.MAX_DEPTH;
		this.maxChildLinksPerPage = this.config.MAX_CHILD_LINKS_PER_PAGE;
		this.excludePatterns = this.config.EXCLUDE_PATTERNS;
		this.includePatterns = this.config.INCLUDE_PATTERNS;
		console.log('⚙️ Updated child link extractor configuration');
	}
}

module.exports = ChildLinkExtractor;


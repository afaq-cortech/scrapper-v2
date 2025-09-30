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

			// Filter and process links
			const childLinks = this.filterAndProcessLinks(allLinks, baseUrl, currentDepth);
			
			console.log(`✅ Found ${childLinks.length} valid child links from ${baseUrl}`);
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

				// Skip if we've already visited this URL
				if (this.visitedUrls.has(resolvedUrl)) {
					continue;
				}

				// Apply filtering rules
				if (!this.isValidChildLink(resolvedUrl, link, baseDomain)) {
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
				return false;
			}

			// Check exclude patterns
			for (const pattern of this.excludePatterns) {
				if (url.includes(pattern) || link.text.toLowerCase().includes(pattern.toLowerCase())) {
					return false;
				}
			}

			// Must be from the same domain (for child links)
			if (urlObj.hostname !== baseDomain) {
				return false;
			}

			// Check if link text suggests it's a relevant page
			const linkText = link.text.toLowerCase();
			const relevantKeywords = [
				'about', 'contact', 'services', 'products', 'team', 'company',
				'blog', 'news', 'careers', 'staff', 'leadership', 'management',
				'portfolio', 'gallery', 'testimonials', 'reviews', 'faq',
				'help', 'support', 'location', 'address', 'phone', 'email'
			];

			// If it matches include patterns, it's definitely valid
			for (const pattern of this.includePatterns) {
				if (url.includes(pattern)) {
					return true;
				}
			}

			// Check if link text contains relevant keywords
			const hasRelevantKeyword = relevantKeywords.some(keyword => 
				linkText.includes(keyword)
			);

			// Skip very short or generic link texts
			if (linkText.length < 3) {
				return false;
			}

			// Skip generic navigation links
			const genericNavTexts = [
				'home', 'main', 'menu', 'navigation', 'nav', 'skip', 'top',
				'back', 'next', 'previous', 'more', 'less', 'show', 'hide'
			];

			if (genericNavTexts.some(generic => linkText === generic)) {
				return false;
			}

			// If it has relevant keywords or is not a generic nav link, it's valid
			return hasRelevantKeyword || linkText.length > 10;

		} catch (error) {
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


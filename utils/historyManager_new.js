const fs = require("fs");
const path = require("path");
const config = require("../config");
require("dotenv").config();

class HistoryManager {
	constructor() {
		this.today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
		this.history = {}; // Will be loaded per keyword
		this.maxHistoryPerKeyword = config.HISTORY?.MAX_URLS_PER_KEYWORD || 1000;
		this.maxHistoryAge = config.HISTORY?.MAX_AGE_DAYS || 30; // days
		this.currentKeyword = null;
		this.currentHistoryFile = null;
	}

	// Get filename for a specific keyword
	getHistoryFilename(keyword) {
		const normalizedKeyword = this.normalizeKeyword(keyword);
		const safeKeyword = normalizedKeyword.replace(/[^a-z0-9]/g, '_');
		return path.join(config.OUTPUT_DIR, `scraping_history_${safeKeyword}_${this.today}.json`);
	}

	// Load history from file for a specific keyword
	loadHistory(keyword) {
		try {
			this.currentKeyword = keyword;
			this.currentHistoryFile = this.getHistoryFilename(keyword);
			
			if (!fs.existsSync(this.currentHistoryFile)) {
				console.log(`📝 Creating new history file for keyword "${keyword}": ${path.basename(this.currentHistoryFile)}`);
				this.history = {
					keyword: keyword,
					firstScraped: new Date().toISOString(),
					lastScraped: new Date().toISOString(),
					totalScraped: 0,
					urls: []
				};
				return this.history;
			}

			const data = fs.readFileSync(this.currentHistoryFile, "utf8");
			const history = JSON.parse(data);
			
			// Clean old entries
			this.cleanOldEntries(history);
			
			console.log(`📚 Loaded history for keyword "${keyword}" with ${history.urls ? history.urls.length : 0} URLs`);
			this.history = history;
			return this.history;
		} catch (error) {
			console.error("❌ Error loading history:", error.message);
			this.history = {
				keyword: keyword,
				firstScraped: new Date().toISOString(),
				lastScraped: new Date().toISOString(),
				totalScraped: 0,
				urls: []
			};
			return this.history;
		}
	}

	// Save history to file
	saveHistory() {
		try {
			if (!this.currentKeyword || !this.currentHistoryFile) {
				console.log("⚠️ No current keyword set for saving history");
				return;
			}

			// Ensure output directory exists
			if (!fs.existsSync(config.OUTPUT_DIR)) {
				fs.mkdirSync(config.OUTPUT_DIR, { recursive: true });
			}

			// Clean old entries before saving
			this.cleanOldEntries(this.history);

			const data = JSON.stringify(this.history, null, 2);
			fs.writeFileSync(this.currentHistoryFile, data);
			console.log(`💾 History saved for keyword "${this.currentKeyword}": ${this.history.urls ? this.history.urls.length : 0} URLs tracked in ${path.basename(this.currentHistoryFile)}`);
		} catch (error) {
			console.error("❌ Error saving history:", error.message);
		}
	}

	// Clean old entries based on age
	cleanOldEntries(history) {
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - this.maxHistoryAge);

		if (history.urls && Array.isArray(history.urls)) {
			// Remove old URLs
			history.urls = history.urls.filter(urlData => {
				const urlDate = new Date(urlData.scrapedAt);
				return urlDate > cutoffDate;
			});
		}
	}

	// Get previously scraped URLs for a keyword
	getScrapedUrls(keyword) {
		// Load history for this keyword if not already loaded
		if (this.currentKeyword !== keyword) {
			this.loadHistory(keyword);
		}
		
		if (!this.history || !this.history.urls) {
			return [];
		}

		return this.history.urls.map(urlData => urlData.url);
	}

	// Add new URLs to history
	addUrls(keyword, urls) {
		// Load history for this keyword if not already loaded
		if (this.currentKeyword !== keyword) {
			this.loadHistory(keyword);
		}
		
		if (!this.history.urls) {
			this.history.urls = [];
		}

		const existingUrls = new Set(this.history.urls.map(u => u.url));
		
		let newUrlsCount = 0;
		urls.forEach(url => {
			if (!existingUrls.has(url)) {
				this.history.urls.push({
					url: url,
					scrapedAt: new Date().toISOString()
				});
				newUrlsCount++;
			}
		});

		// Update metadata
		this.history.lastScraped = new Date().toISOString();
		this.history.totalScraped += newUrlsCount;

		// Limit URLs per keyword
		if (this.history.urls.length > this.maxHistoryPerKeyword) {
			this.history.urls = this.history.urls
				.sort((a, b) => new Date(b.scrapedAt) - new Date(a.scrapedAt))
				.slice(0, this.maxHistoryPerKeyword);
		}

		console.log(`📝 Added ${newUrlsCount} new URLs to history for "${keyword}"`);
		console.log(`   Total URLs in history: ${this.history.urls.length}`);
		
		return newUrlsCount;
	}

	// Filter out previously scraped URLs
	filterNewUrls(keyword, urls) {
		const scrapedUrls = this.getScrapedUrls(keyword);
		const scrapedUrlsSet = new Set(scrapedUrls);
		
		const newUrls = urls.filter(url => !scrapedUrlsSet.has(url));
		const duplicateCount = urls.length - newUrls.length;

		if (duplicateCount > 0) {
			console.log(`🔄 Filtered out ${duplicateCount} previously scraped URLs for "${keyword}"`);
			console.log(`   New URLs to scrape: ${newUrls.length}`);
		}

		return newUrls;
	}

	// Normalize keyword for consistent storage
	normalizeKeyword(keyword) {
		return keyword.toLowerCase().trim();
	}

	// Get history statistics
	getStats() {
		if (!this.currentKeyword || !this.history) {
			return {
				totalKeywords: 0,
				totalUrls: 0,
				currentKeyword: null,
				keywords: {}
			};
		}

		const stats = {
			totalKeywords: 1,
			totalUrls: this.history.urls ? this.history.urls.length : 0,
			currentKeyword: this.currentKeyword,
			keywords: {}
		};

		stats.keywords[this.currentKeyword] = {
			urls: this.history.urls ? this.history.urls.length : 0,
			firstScraped: this.history.firstScraped,
			lastScraped: this.history.lastScraped,
			totalScraped: this.history.totalScraped
		};

		return stats;
	}

	// Show history statistics
	showStats() {
		const stats = this.getStats();
		
		console.log("\n📊 Scraping History Statistics:");
		console.log("=" .repeat(50));
		console.log(`Date: ${this.today}`);
		if (this.currentHistoryFile) {
			console.log(`History file: ${path.basename(this.currentHistoryFile)}`);
		}
		console.log(`Current keyword: ${stats.currentKeyword || 'None'}`);
		console.log(`Total URLs in history: ${stats.totalUrls}`);
		
		if (stats.currentKeyword && stats.keywords[stats.currentKeyword]) {
			const data = stats.keywords[stats.currentKeyword];
			const firstDate = new Date(data.firstScraped).toLocaleDateString();
			const lastDate = new Date(data.lastScraped).toLocaleDateString();
			console.log(`  "${stats.currentKeyword}": ${data.urls} URLs (${firstDate} - ${lastDate})`);
		}
		console.log("=" .repeat(50));
	}

	// Clear history for a specific keyword
	clearKeywordHistory(keyword) {
		// Load history for this keyword if not already loaded
		if (this.currentKeyword !== keyword) {
			this.loadHistory(keyword);
		}
		
		if (this.history) {
			this.history.urls = [];
			this.history.totalScraped = 0;
			this.history.firstScraped = new Date().toISOString();
			this.history.lastScraped = new Date().toISOString();
			console.log(`🗑️ Cleared history for keyword: "${keyword}"`);
			this.saveHistory();
		}
	}

	// Clear all history
	clearAllHistory() {
		if (this.history) {
			this.history.urls = [];
			this.history.totalScraped = 0;
			this.history.firstScraped = new Date().toISOString();
			this.history.lastScraped = new Date().toISOString();
			console.log("🗑️ Cleared all scraping history");
			this.saveHistory();
		}
	}

	// Export history to file
	exportHistory(filename = null) {
		try {
			if (!this.currentKeyword || !this.history) {
				console.log("⚠️ No current keyword history to export");
				return null;
			}

			const safeKeyword = this.normalizeKeyword(this.currentKeyword).replace(/[^a-z0-9]/g, '_');
			const exportFilename = filename || `history_export_${safeKeyword}_${this.today}.json`;
			const exportPath = path.join(config.OUTPUT_DIR, exportFilename);
			
			fs.writeFileSync(exportPath, JSON.stringify(this.history, null, 2));
			console.log(`📤 History exported to: ${exportPath}`);
			return exportPath;
		} catch (error) {
			console.error("❌ Error exporting history:", error.message);
			return null;
		}
	}

	// List all history files
	listHistoryFiles() {
		try {
			if (!fs.existsSync(config.OUTPUT_DIR)) {
				console.log("📁 No output directory found");
				return [];
			}

			const files = fs.readdirSync(config.OUTPUT_DIR);
			const historyFiles = files.filter(file => file.startsWith('scraping_history_') && file.endsWith('.json'));
			
			console.log("\n📁 History Files:");
			console.log("=" .repeat(50));
			
			if (historyFiles.length === 0) {
				console.log("No history files found");
			} else {
				historyFiles.forEach(file => {
					const filePath = path.join(config.OUTPUT_DIR, file);
					const stats = fs.statSync(filePath);
					// Extract keyword and date from filename: scraping_history_keyword_date.json
					const parts = file.replace('scraping_history_', '').replace('.json', '').split('_');
					const date = parts[parts.length - 1];
					const keyword = parts.slice(0, -1).join('_').replace(/_/g, ' ');
					const size = (stats.size / 1024).toFixed(2);
					console.log(`  ${date}: "${keyword}" - ${file} (${size} KB)`);
				});
			}
			console.log("=" .repeat(50));
			
			return historyFiles;
		} catch (error) {
			console.error("❌ Error listing history files:", error.message);
			return [];
		}
	}

	// Get current date
	getCurrentDate() {
		return this.today;
	}
}

module.exports = HistoryManager;

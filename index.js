const LeadScraper = require("./scrapers/leadScraper");
const config = require("./config");
const fs = require("fs");
const path = require("path");
require('dotenv').config();

class LeadScrapingApp {
	constructor() {
		this.leadScraper = new LeadScraper();
	}

	async runScraper(keywords, leadsPerKeyword = 50, depth = 0) {
		console.log("🚀 Starting Lead Scraper");
		console.log("🔍 Keywords:", keywords.join(", "));
		console.log(`📊 Leads per keyword: ${leadsPerKeyword}`);
		if (depth > 0) {
			console.log(`🔗 Depth scraping enabled: ${depth} levels`);
		}
		console.log("=".repeat(50));

		try {
			const leads = await this.leadScraper.scrapeLeads(
				keywords,
				leadsPerKeyword,
				depth
			);
			return leads;
		} catch (error) {
			console.error("❌ Scraping failed:", error);
			throw error;
		}
	}

	async scrapeUrls(urls, depth = 0) {
		console.log("🚀 Starting Direct URL Scraper");
		console.log("🌐 URLs:", urls.join(", "));
		if (depth > 0) {
			console.log(`🔗 Depth scraping enabled: ${depth} levels`);
		}
		console.log("=".repeat(50));

		try {
			const leads = await this.leadScraper.scrapeUrls(urls, depth);
			return leads;
		} catch (error) {
			console.error("❌ URL scraping failed:", error);
			throw error;
		}
	}

	showHelp() {
		console.log(`
Lead Scraper - AI-Powered Business Lead Generation

Workflow:
1. 🔍 Get keywords from user OR URLs directly
2. 🔍 Search Google for websites using Playwright (keywords) OR scrape URLs directly
3. 🧠 Use AI to filter relevant websites (keywords only)
4. 🌐 Scrape website content directly with Playwright
5. 🔗 Extract child links and scrape them recursively (if depth > 0)
6. 🧠 Use AI to extract business data from page content
7. 📝 Store extracted leads in Excel/JSON

Note: This scraper focuses on WEBSITE scraping. For Google My Business (GMB) scraping, use the separate GMB scraper.

Usage:
  # Keyword-based scraping:
  node index.js [keywords] [leads_per_keyword] [depth]
  node index.js file [leads_per_keyword] [depth]    # Use keywords from keywords.json
  node index.js config [leads_per_keyword] [depth]  # Use keywords from config.js
  
  # Direct URL scraping:
  node index.js url [url1,url2,url3] [depth]        # Scrape specific URLs directly
  node index.js urls [url1,url2,url3] [depth]       # Alternative syntax for URL scraping
  
  # System commands:
  node index.js status                      # Show system status
  node index.js models                      # List available Gemini models
  node index.js history                     # Show scraping history statistics
  node index.js list-history                # List all history files
  node index.js clear-history [keyword]     # Clear history (all or specific keyword)
  
  # GMB Scraping (separate command):
  node gmb-scraper.js [keywords] [results]  # GMB-only scraping with contact info
  node gmb-scraper.js help                  # Show GMB scraper help
  node gmb-scraper.js status                # Show GMB scraper status
  npm run gmb [keywords] [results]          # Alternative GMB command
  npm run gmb-help                          # Show GMB help

Arguments:
  keywords              Comma-separated keywords OR "config" OR "file"
  leads_per_keyword     Number of leads to scrape per keyword (default: 50)
  depth                 Depth level for child link scraping (0-3, default: 0)
  urls                  Comma-separated URLs to scrape directly

Depth Scraping:
  - depth 0: Only scrape the main URLs (default behavior)
  - depth 1: Scrape main URLs + their child links (about, contact, services, etc.)
  - depth 2: Scrape main URLs + child links + grandchild links
  - depth 3: Maximum depth (main + child + grandchild + great-grandchild links)
  
  Child links are intelligently filtered to include relevant pages like:
  - /about, /contact, /services, /products, /team, /company
  - /blog, /news, /careers, /staff, /leadership, /management
  - /portfolio, /gallery, /testimonials, /reviews, /faq

Examples:
  # Keyword-based scraping:
  node index.js "restaurants New York,pizza delivery Chicago" 25 1
  node index.js "plumber Miami,dentist Los Angeles" 20 2
  node index.js file 30 1
  node index.js config 25 0
  
  # Direct URL scraping:
  node index.js url "https://example.com,https://business.com" 1
  node index.js urls "https://restaurant.com,https://clinic.com,https://lawfirm.com" 2
  
  # GMB scraping (separate tool):
  node gmb-scraper.js "restaurants New York,coffee shops Brooklyn" 15
  node gmb-scraper.js "dentist Miami,plumber Chicago" 10
  node gmb-scraper.js file 25
  npm run gmb "pizza Manhattan" 20
  
  # System commands:
  node index.js history
  node index.js list-history
  node index.js clear-history "restaurants New York"
  node gmb-scraper.js status

Requirements:
  - GEMINI_API_KEY environment variable for AI functionality
  - Playwright browser automation (no external microservice needed)

Environment Variables:
  GEMINI_API_KEY=your_gemini_api_key       # Required: For AI-powered filtering and extraction

`);
	}

	loadKeywordsFromFile() {
		const keywordFile = path.join(__dirname, "keywords.json");

		if (!fs.existsSync(keywordFile)) {
			console.log("⚠️ keywords.json file not found. Creating example file...");
			return [];
		}

		try {
			const content = fs.readFileSync(keywordFile, "utf8");
			const data = JSON.parse(content);
			const keywords = Array.isArray(data) ? data : data.keywords || [];

			console.log(`📂 Loaded ${keywords.length} keywords from keywords.json`);
			return keywords;
		} catch (error) {
			console.error("❌ Error reading keywords.json:", error.message);
			return [];
		}
	}

	loadKeywordsFromConfig() {
		const keywords = config.KEYWORDS || [];
		console.log(`⚙️ Loaded ${keywords.length} keywords from config.js`);
		return keywords;
	}

	parseKeywords(keywordInput) {
		if (!keywordInput) {
			console.log(
				"⚠️ No keywords provided. Use 'node index.js help' for usage info."
			);
			return [];
		}

		let keywords = [];

		if (keywordInput.toLowerCase() === "config") {
			keywords = this.loadKeywordsFromConfig();
		} else if (keywordInput.toLowerCase() === "file") {
			keywords = this.loadKeywordsFromFile();
		} else {
			keywords = keywordInput
				.split(",")
				.map((k) => k.trim())
				.filter((k) => k.length > 0);
		}

		if (keywords.length === 0) {
			console.log("❌ No valid keywords found.");
			console.log("💡 Try:");
			console.log(
				'   - Adding keywords to config.js KEYWORDS array and use "config"'
			);
			console.log('   - Adding keywords to keywords.json file and use "file"');
			console.log(
				'   - Providing keywords directly: "restaurant Chicago,plumber Miami"'
			);
			return [];
		}

		console.log(`📝 Using ${keywords.length} keywords:`);
		keywords.forEach((keyword, index) => {
			console.log(`  ${index + 1}. "${keyword}"`);
		});

		return keywords;
	}

	parseUrls(urlInput) {
		if (!urlInput) {
			console.log("⚠️ No URLs provided. Use 'node index.js help' for usage info.");
			return [];
		}

		const urls = urlInput
			.split(",")
			.map((url) => url.trim())
			.filter((url) => url.length > 0);

		// Validate URLs
		const validUrls = [];
		const invalidUrls = [];

		urls.forEach((url) => {
			try {
				// Add protocol if missing
				if (!url.startsWith("http://") && !url.startsWith("https://")) {
					url = "https://" + url;
				}
				
				// Validate URL format
				new URL(url);
				validUrls.push(url);
			} catch (error) {
				invalidUrls.push(url);
			}
		});

		if (invalidUrls.length > 0) {
			console.log("⚠️ Invalid URLs found:");
			invalidUrls.forEach((url) => {
				console.log(`   ❌ ${url}`);
			});
		}

		if (validUrls.length === 0) {
			console.log("❌ No valid URLs found.");
			console.log("💡 Make sure URLs are properly formatted:");
			console.log('   - "https://example.com,https://business.com"');
			console.log('   - "example.com,business.com" (will add https://)');
			return [];
		}

		console.log(`🌐 Using ${validUrls.length} URLs:`);
		validUrls.forEach((url, index) => {
			console.log(`  ${index + 1}. ${url}`);
		});

		return validUrls;
	}

	isUrlInput(input) {
		if (!input) return false;
		
		// Check if input contains URLs (has http/https or common domain patterns)
		const urlPattern = /(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?/i;
		return urlPattern.test(input);
	}

	async testPlaywright() {
		try {
			const GoogleScraper = require("./utils/googleScraper");
			const scraper = new GoogleScraper();
			const initialized = await scraper.initialize();

			if (initialized) {
				console.log("✅ Playwright browser automation ready");
				await scraper.close();
				return true;
			} else {
				console.log("❌ Playwright initialization failed");
				return false;
			}
		} catch (error) {
			console.log(`❌ Error testing Playwright: ${error.message}`);
			return false;
		}
	}

	async showSystemStatus() {
		console.log("\n🔍 System Status Check:");

		const UrlFilter = require("./utils/urlFilter");
		const LeadExtractor = require("./utils/leadExtractor");

		const urlFilter = new UrlFilter();
		const leadExtractor = new LeadExtractor();

		console.log(
			`   🧠 AI URL Filter: ${
				urlFilter.isAvailable() ? "✅ Available" : "❌ Not Available"
			}`
		);
		console.log(
			`   🧠 AI Lead Extractor: ${
				leadExtractor.isAvailable() ? "✅ Available" : "❌ Not Available"
			}`
		);

		const playwrightStatus = await this.testPlaywright();
		console.log(
			`   🌐 Playwright Browser: ${
				playwrightStatus ? "✅ Available" : "❌ Not Available"
			}`
		);

		console.log(
			`   🔑 GEMINI_API_KEY: ${
				process.env.GEMINI_API_KEY ? "✅ Set" : "❌ Not Set"
			}`
		);

		if (!process.env.GEMINI_API_KEY) {
			console.log(
				"   💡 Set GEMINI_API_KEY environment variable for AI functionality"
			);
		}

		if (!playwrightStatus) {
			console.log("   💡 Install Playwright browsers: npx playwright install");
		}
	}

	async listAvailableModels() {
		console.log("\n🤖 Available Gemini Models:");
		
		if (!process.env.GEMINI_API_KEY) {
			console.log("❌ GEMINI_API_KEY not set. Cannot list models.");
			return;
		}

		try {
			const { GoogleGenerativeAI } = require("@google/generative-ai");
			const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
			
			console.log("📡 Testing API connection and models...");
			console.log(`API Key: ${process.env.GEMINI_API_KEY.substring(0, 10)}...`);
			
			// Test with a simple model first
			console.log("\n🧪 Testing with simple model...");
			try {
				const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
				const result = await model.generateContent("Say hello");
				const response = await result.response.text();
				console.log(`✅ gemini-2.0-flash works! Response: ${response.substring(0, 50)}...`);
			} catch (error) {
				console.log(`❌ gemini-2.0-flash failed: ${error.message}`);
			}
			
			// Try different model names that might work
			const testModels = [
				"gemini-1.5-flash",
				"gemini-1.5-pro", 
				"gemini-1.0-pro",
				"models/gemini-pro",
				"models/gemini-1.5-flash",
				"models/gemini-1.5-pro"
			];
			
			console.log("\n📋 Testing Alternative Model Names:");
			console.log("=".repeat(50));
			
			for (const modelName of testModels) {
				try {
					const model = genAI.getGenerativeModel({ model: modelName });
					const result = await model.generateContent("Hello");
					const response = await result.response.text();
					console.log(`✅ ${modelName} - WORKS! Response: ${response.substring(0, 30)}...`);
				} catch (error) {
					console.log(`❌ ${modelName} - ${error.message}`);
				}
			}
			
		} catch (error) {
			console.log(`❌ Error testing models: ${error.message}`);
			console.log("Full error:", error);
		}
	}

	async showHistoryStats() {
		try {
			const GoogleScraper = require("./utils/googleScraper");
			const scraper = new GoogleScraper();
			const initialized = await scraper.initialize();

			if (initialized) {
				scraper.showHistoryStats();
				await scraper.close();
			} else {
				console.log("❌ Failed to initialize scraper for history stats");
			}
		} catch (error) {
			console.log(`❌ Error showing history stats: ${error.message}`);
		}
	}

	async clearKeywordHistory(keyword) {
		try {
			const GoogleScraper = require("./utils/googleScraper");
			const scraper = new GoogleScraper();
			const initialized = await scraper.initialize();

			if (initialized) {
				scraper.clearKeywordHistory(keyword);
				await scraper.close();
			} else {
				console.log("❌ Failed to initialize scraper for history management");
			}
		} catch (error) {
			console.log(`❌ Error clearing keyword history: ${error.message}`);
		}
	}

	async clearAllHistory() {
		try {
			const GoogleScraper = require("./utils/googleScraper");
			const scraper = new GoogleScraper();
			const initialized = await scraper.initialize();

			if (initialized) {
				scraper.clearAllHistory();
				await scraper.close();
			} else {
				console.log("❌ Failed to initialize scraper for history management");
			}
		} catch (error) {
			console.log(`❌ Error clearing all history: ${error.message}`);
		}
	}

	async listHistoryFiles() {
		try {
			const GoogleScraper = require("./utils/googleScraper");
			const scraper = new GoogleScraper();
			const initialized = await scraper.initialize();

			if (initialized) {
				scraper.listHistoryFiles();
				await scraper.close();
			} else {
				console.log("❌ Failed to initialize scraper for history listing");
			}
		} catch (error) {
			console.log(`❌ Error listing history files: ${error.message}`);
		}
	}
}

async function main() {

	let googleAPI = process.env.GEMINI_API_KEY;
	console.log("gemini api key:",googleAPI)

	const app = new LeadScrapingApp();
	const args = process.argv.slice(2);

	if (
		args.length === 0 ||
		args[0] === "help" ||
		args[0] === "--help" ||
		args[0] === "-h"
	) {
		app.showHelp();
		return;
	}

	if (args[0] === "status") {
		await app.showSystemStatus();
		return;
	}

	if (args[0] === "models") {
		await app.listAvailableModels();
		return;
	}

	if (args[0] === "history") {
		await app.showHistoryStats();
		return;
	}

	if (args[0] === "clear-history") {
		const keyword = args[1];
		if (keyword) {
			await app.clearKeywordHistory(keyword);
		} else {
			await app.clearAllHistory();
		}
		return;
	}

	if (args[0] === "list-history") {
		await app.listHistoryFiles();
		return;
	}

	// Check for URL scraping mode
	if (args[0] === "url" || args[0] === "urls") {
		const urlInput = args[1];
		const depth = parseInt(args[2]) || 0;
		
		if (!urlInput) {
			console.log("❌ No URLs provided for URL scraping mode");
			console.log("💡 Usage: node index.js url \"https://example.com,https://business.com\" [depth]");
			return;
		}

		const urls = app.parseUrls(urlInput);
		if (urls.length === 0) {
			return;
		}

		console.log(`\n📋 URL Scraping Configuration:`);
		console.log(`   URLs: ${urls.length}`);
		console.log(`   Depth: ${depth} levels`);
		console.log(`   Output format: ${config.OUTPUT_FORMAT.toUpperCase()}`);
		console.log(`   Browser automation: Playwright`);

		try {
			console.log("\n⏳ Starting URL scraper...");
			const leads = await app.scrapeUrls(urls, depth);
			console.log(`\n🎉 URL scraping completed successfully!`);
		} catch (error) {
			console.error("\n❌ Error during URL scraping:", error.message);
			console.log("\n💡 Troubleshooting tips:");
			console.log("   • Check your internet connection");
			console.log("   • Verify your Gemini API key for AI-powered functionality");
			console.log("   • Install Playwright browsers: npx playwright install");
			console.log("   • Verify URLs are accessible and valid");
			process.exit(1);
		}
		return;
	}

	const keywordInput = args[0];
	const leadsPerKeyword = parseInt(args[1]) || 50;
	const depth = parseInt(args[2]) || 0;

	if (leadsPerKeyword < 1) {
		console.log("❌ Leads per keyword must be at least 1");
		return;
	}

	if (depth < 0 || depth > (config.DEPTH_SCRAPING?.MAX_DEPTH || 3)) {
		console.log(`❌ Depth must be between 0 and ${config.DEPTH_SCRAPING?.MAX_DEPTH || 3}`);
		return;
	}

	const keywords = app.parseKeywords(keywordInput);
	if (keywords.length === 0) {
		return;
	}

	console.log(`\n📋 Scraping Configuration:`);
	console.log(`   Keywords: ${keywords.length}`);
	console.log(`   Leads per keyword: ${leadsPerKeyword}`);
	console.log(`   Depth: ${depth} levels`);
	console.log(`   Output format: ${config.OUTPUT_FORMAT.toUpperCase()}`);
	console.log(`   Browser automation: Playwright`);
	console.log(`   CAPTCHA handling: ${config.CAPTCHA?.ENABLED ? 'Enabled' : 'Disabled'}`);
	if (config.CAPTCHA?.ENABLED) {
		const maxWaitMinutes = Math.floor((config.CAPTCHA?.MAX_WAIT_TIME || 600) / 60);
		console.log(`   CAPTCHA wait time: ${maxWaitMinutes} minutes`);
	}
	console.log(`   History tracking: ${config.HISTORY?.ENABLED ? 'Enabled' : 'Disabled'}`);
	if (config.HISTORY?.ENABLED) {
		const today = new Date().toISOString().split('T')[0];
		console.log(`   History file: scraping_history_${today}.json`);
		console.log(`   Max URLs per keyword: ${config.HISTORY?.MAX_URLS_PER_KEYWORD || 1000}`);
		console.log(`   History retention: ${config.HISTORY?.MAX_AGE_DAYS || 30} days`);
		console.log(`   Daily reset: Each day creates a new history file`);
	}
	console.log(`   Depth scraping: ${config.DEPTH_SCRAPING?.ENABLED ? 'Enabled' : 'Disabled'}`);
	if (config.DEPTH_SCRAPING?.ENABLED && depth > 0) {
		console.log(`   Max child links per page: ${config.DEPTH_SCRAPING?.MAX_CHILD_LINKS_PER_PAGE || 30}`);
		console.log(`   Delay between child requests: ${config.DEPTH_SCRAPING?.DELAY_BETWEEN_CHILD_REQUESTS || 2000}ms`);
	}

	try {
		console.log("\n⏳ Starting scraper...");
		const leads = await app.runScraper(keywords, leadsPerKeyword, depth);

		console.log(`\n🎉 Scraping completed successfully!`);
		// console.log(`   Leads with name: ${leads.filter((l) => l.name).length}`);
		// console.log(`   Leads with title: ${leads.filter((l) => l.title).length}`);
		// console.log(`   Leads with company: ${leads.filter((l) => l.company).length}`);
		// console.log(`   Leads with email: ${leads.filter((l) => l.email).length}`);
		// console.log(`   Leads with phone: ${leads.filter((l) => l.phone).length}`);
		
		
	} catch (error) {
		console.error("\n❌ Error during scraping:", error.message);
		console.log("\n💡 Troubleshooting tips:");
		console.log("   • Check your internet connection");
		console.log("   • Verify your Gemini API key for AI-powered functionality");
		console.log("   • Install Playwright browsers: npx playwright install");
		console.log("   • Try reducing the number of leads per keyword");
		process.exit(1);
	}
}

process.on("SIGINT", () => {
	console.log("\n⏹️ Gracefully shutting down...");
	console.log("📁 Check ./output/ directory for any partial results");
	process.exit(0);
});

process.on("SIGTERM", () => {
	console.log("\n⏹️ Received termination signal, shutting down...");
	process.exit(0);
});

if (require.main === module) {
	main().catch((error) => {
		console.error("❌ Fatal error:", error);
		process.exit(1);
	});
}

module.exports = LeadScrapingApp;

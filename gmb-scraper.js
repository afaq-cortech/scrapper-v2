const GMBScraper = require("./scrapers/gmbScraper");
const DataProcessor = require("./utils/dataProcessor");
const config = require("./config");
const fs = require("fs");
const path = require("path");
require('dotenv').config();

class GMBScrapingApp {
	constructor() {
		this.gmbScraper = new GMBScraper();
		this.dataProcessor = new DataProcessor();
		this.leads = [];
	}

	async runGMBScraper(keywords, resultsPerKeyword = 20) {
		console.log("🏢 Starting GMB-Only Scraper");
		console.log("🔍 Keywords:", keywords.join(", "));
		console.log(`📊 Results per keyword: ${resultsPerKeyword}`);
		console.log("=" .repeat(50));

		try {
			// Temporarily enable GMB for this session
			const originalGMBEnabled = config.GMB.ENABLED;
			const originalStandaloneMode = config.GMB.STANDALONE_MODE;
			config.GMB.ENABLED = true;
			config.GMB.STANDALONE_MODE = true;

			await this.gmbScraper.initialize();

			const timestamp = new Date().toISOString();
			this.dataProcessor.initializeBackup(`gmb_leads_${timestamp}`, "gmb_only");

			let totalLeads = 0;

			for (let i = 0; i < keywords.length; i++) {
				const keyword = keywords[i];
				console.log(`\n🔍 Processing GMB keyword ${i + 1}/${keywords.length}: "${keyword}"`);

				try {
					console.log(`🏢 Searching GMB listings...`);
					const gmbListings = await this.gmbScraper.scrapeGMBListings(keyword, resultsPerKeyword);
					
					console.log(`🏢 Found ${gmbListings.length} GMB listings`);

					// Process GMB listings
					const gmbLeads = this.createLeadsFromGMBData(gmbListings, keyword);

					// Save leads
					gmbLeads.forEach((lead) => {
						this.dataProcessor.appendLeadToBackup(lead);
						this.leads.push(lead);
						totalLeads++;
					});

					console.log(`✅ Keyword "${keyword}": ${gmbLeads.length} GMB leads extracted`);

					// Export leads for this keyword separately
					if (gmbLeads.length > 0) {
						const processedLeads = this.dataProcessor.processLeads(gmbLeads);
						const safeKeyword = keyword.toLowerCase().replace(/[^a-z0-9]/g, '_');
						const keywordExportPath = this.dataProcessor.exportData(
							processedLeads,
							`gmb_leads_${safeKeyword}`,
							config.OUTPUT_FORMAT
						);
						console.log(`📊 GMB export: ${keywordExportPath}`);
					}

					// Delay between keywords
					if (i < keywords.length - 1) {
						await new Promise((resolve) =>
							setTimeout(resolve, config.GMB?.DELAY_BETWEEN_REQUESTS || 2000)
						);
					}
				} catch (error) {
					console.error(`❌ Error processing GMB keyword "${keyword}":`, error.message);
					continue;
				}
			}

			// Export combined data
			this.dataProcessor.closeBackup(totalLeads);

			if (this.leads.length > 0) {
				const processedLeads = this.dataProcessor.processLeads(this.leads);
				const exportPath = this.dataProcessor.exportData(
					processedLeads,
					"gmb_leads_combined",
					config.OUTPUT_FORMAT
				);
				console.log(`📊 Combined GMB export: ${exportPath}`);
			}

			console.log(`\n🎉 GMB scraping completed! Total leads: ${totalLeads}`);
			
			// Show statistics
			this.showGMBStats();

			// Restore original config
			config.GMB.ENABLED = originalGMBEnabled;
			config.GMB.STANDALONE_MODE = originalStandaloneMode;

			return this.leads;
		} catch (error) {
			console.error("❌ GMB scraping failed:", error);
			throw error;
		} finally {
			await this.gmbScraper.close();
		}
	}

	createLeadsFromGMBData(gmbListings, keyword) {
		const leads = [];

		for (const gmbData of gmbListings) {
			if (!gmbData || !gmbData.name) {
				continue;
			}

			// Create lead object with GMB-specific fields
			const lead = {
				name: gmbData.name || "",
				title: gmbData.title || gmbData.name || "",
				company: gmbData.name || "",
				email: gmbData.email || "",
				phone: gmbData.phone || "",
				// GMB-specific fields
				address: gmbData.address || "",
				rating: gmbData.rating || "",
				reviewCount: gmbData.reviewCount || "",
				category: gmbData.category || "",
				website: gmbData.website || gmbData.url || "",
				hours: gmbData.hours || "",
				source: gmbData.source || "Google My Business",
				keyword: keyword,
				position: gmbData.position || 0,
				extractedAt: gmbData.extractedAt || new Date().toISOString()
			};

			leads.push(lead);
		}

		console.log(`🏢 Created ${leads.length} GMB leads`);
		return leads;
	}

	showGMBStats() {
		const stats = {
			totalLeads: this.leads.length,
			leadsWithPhone: this.leads.filter((l) => l.phone).length,
			leadsWithEmail: this.leads.filter((l) => l.email).length,
			leadsWithAddress: this.leads.filter((l) => l.address).length,
			leadsWithWebsite: this.leads.filter((l) => l.website).length,
			uniqueBusinesses: new Set(this.leads.map((l) => l.name)).size,
		};

		console.log(`\n📊 GMB Scraping Statistics:`);
		console.log(`   Total GMB leads: ${stats.totalLeads}`);
		console.log(`   With phone: ${stats.leadsWithPhone} (${Math.round(stats.leadsWithPhone/stats.totalLeads*100)}%)`);
		console.log(`   With email: ${stats.leadsWithEmail} (${Math.round(stats.leadsWithEmail/stats.totalLeads*100)}%)`);
		console.log(`   With address: ${stats.leadsWithAddress} (${Math.round(stats.leadsWithAddress/stats.totalLeads*100)}%)`);
		console.log(`   With website: ${stats.leadsWithWebsite} (${Math.round(stats.leadsWithWebsite/stats.totalLeads*100)}%)`);
		console.log(`   Unique businesses: ${stats.uniqueBusinesses}`);
	}

	showHelp() {
		console.log(`
GMB Scraper - Google My Business Lead Generation

This tool scrapes ONLY Google My Business listings with guaranteed contact information.

Usage:
  # GMB-only scraping:
  node gmb-scraper.js [keywords] [results_per_keyword]
  node gmb-scraper.js file [results_per_keyword]    # Use keywords from keywords.json
  node gmb-scraper.js config [results_per_keyword]  # Use keywords from config.js
  
  # System commands:
  node gmb-scraper.js status                        # Show GMB scraper status
  node gmb-scraper.js help                          # Show this help

Arguments:
  keywords              Comma-separated keywords OR "config" OR "file"
  results_per_keyword   Number of GMB results per keyword (default: 20)

Examples:
  node gmb-scraper.js "restaurants New York,coffee shops Brooklyn" 15
  node gmb-scraper.js "dentist Miami,plumber Chicago" 10
  node gmb-scraper.js file 25
  node gmb-scraper.js config 20

Features:
  ✅ GMB-only scraping (no regular websites)
  ✅ Guaranteed contact info (phone OR email required)
  ✅ Separate Chromium instance for optimal performance
  ✅ Fast mode optimizations
  ✅ Detailed business information (address, rating, hours, etc.)

Output:
  Results saved to ./output/ directory as Excel or JSON
  Separate files per keyword + combined file
`);
	}

	loadKeywordsFromFile() {
		const keywordFile = path.join(__dirname, "keywords.json");

		if (!fs.existsSync(keywordFile)) {
			console.log("⚠️ keywords.json file not found.");
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
			console.log("⚠️ No keywords provided. Use 'node gmb-scraper.js help' for usage info.");
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
			return [];
		}

		console.log(`📝 Using ${keywords.length} GMB keywords:`);
		keywords.forEach((keyword, index) => {
			console.log(`  ${index + 1}. "${keyword}"`);
		});

		return keywords;
	}

	async showSystemStatus() {
		console.log("\n🔍 GMB Scraper System Status:");
		console.log(`   🏢 GMB Scraping: Available`);
		console.log(`   🔧 Fast Mode: ${config.GMB?.FAST_MODE ? 'Enabled' : 'Disabled'}`);
		console.log(`   📞 Require Contact: ${config.GMB?.REQUIRE_CONTACT ? 'Enabled' : 'Disabled'}`);
		console.log(`   🖥️ Headless Mode: ${config.GMB?.HEADLESS ? 'Enabled' : 'Disabled'}`);
		console.log(`   ⚡ Max Detail Clicks: ${config.GMB?.MAX_DETAIL_CLICKS || 3}`);
		console.log(`   ⏱️ Detail Wait Time: ${config.GMB?.DETAIL_WAIT_TIME || 1500}ms`);
	}
}

async function main() {
	const app = new GMBScrapingApp();
	const args = process.argv.slice(2);

	if (args.length === 0 || args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
		app.showHelp();
		return;
	}

	if (args[0] === "status") {
		await app.showSystemStatus();
		return;
	}

	const keywordInput = args[0];
	const resultsPerKeyword = parseInt(args[1]) || 20;

	if (resultsPerKeyword < 1) {
		console.log("❌ Results per keyword must be at least 1");
		return;
	}

	const keywords = app.parseKeywords(keywordInput);
	if (keywords.length === 0) {
		return;
	}

	console.log(`\n📋 GMB Scraping Configuration:`);
	console.log(`   Keywords: ${keywords.length}`);
	console.log(`   Results per keyword: ${resultsPerKeyword}`);
	console.log(`   Output format: ${config.OUTPUT_FORMAT.toUpperCase()}`);
	console.log(`   Fast mode: ${config.GMB?.FAST_MODE ? 'Enabled' : 'Disabled'}`);
	console.log(`   Require contact: ${config.GMB?.REQUIRE_CONTACT ? 'Yes' : 'No'}`);

	try {
		console.log("\n⏳ Starting GMB scraper...");
		const leads = await app.runGMBScraper(keywords, resultsPerKeyword);
		console.log(`\n🎉 GMB scraping completed successfully! Found ${leads.length} leads with contact info.`);
	} catch (error) {
		console.error("\n❌ Error during GMB scraping:", error.message);
		console.log("\n💡 Troubleshooting tips:");
		console.log("   • Check your internet connection");
		console.log("   • Install Playwright browsers: npx playwright install");
		console.log("   • Try reducing the number of results per keyword");
		process.exit(1);
	}
}

process.on("SIGINT", () => {
	console.log("\n⏹️ Gracefully shutting down GMB scraper...");
	console.log("📁 Check ./output/ directory for any partial results");
	process.exit(0);
});

if (require.main === module) {
	main().catch((error) => {
		console.error("❌ Fatal GMB scraper error:", error);
		process.exit(1);
	});
}

module.exports = GMBScrapingApp;

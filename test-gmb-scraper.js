const GMBScraper = require("./scrapers/gmbScraper");
const config = require("./config");

async function testGMBScraper() {
	console.log("🧪 Testing GMB Scraper");
	console.log("=" .repeat(50));

	const gmbScraper = new GMBScraper();
	
	try {
		// Test initialization
		console.log("1️⃣ Testing GMB Scraper initialization...");
		const initialized = await gmbScraper.initialize();
		
		if (!initialized) {
			throw new Error("Failed to initialize GMB Scraper");
		}
		
		console.log("✅ GMB Scraper initialized successfully");
		console.log("Status:", gmbScraper.getStatus());

		// Test GMB scraping with a simple search term
		console.log("\n2️⃣ Testing GMB listing extraction...");
		const testKeyword = "restaurants New York";
		console.log(`Searching for: "${testKeyword}"`);
		
		const gmbListings = await gmbScraper.scrapeGMBListings(testKeyword, 5);
		
		console.log(`\n📊 GMB Scraping Results:`);
		console.log(`   Total listings found: ${gmbListings.length}`);
		
		if (gmbListings.length > 0) {
			console.log(`\n📋 Sample GMB Listings:`);
			gmbListings.slice(0, 3).forEach((listing, index) => {
				console.log(`\n   ${index + 1}. ${listing.name || 'No name'}`);
				console.log(`      Phone: ${listing.phone || 'No phone'}`);
				console.log(`      Email: ${listing.email || 'No email'}`);
				console.log(`      Address: ${listing.address || 'No address'}`);
				console.log(`      Rating: ${listing.rating || 'No rating'}`);
				console.log(`      Category: ${listing.category || 'No category'}`);
				console.log(`      Website: ${listing.website || 'No website'}`);
				console.log(`      Source: ${listing.source}`);
			});

			// Analyze extraction quality
			const withPhone = gmbListings.filter(l => l.phone).length;
			const withEmail = gmbListings.filter(l => l.email).length;
			const withAddress = gmbListings.filter(l => l.address).length;
			const withWebsite = gmbListings.filter(l => l.website).length;

			console.log(`\n📈 Data Quality Analysis:`);
			console.log(`   Listings with phone: ${withPhone}/${gmbListings.length} (${Math.round(withPhone/gmbListings.length*100)}%)`);
			console.log(`   Listings with email: ${withEmail}/${gmbListings.length} (${Math.round(withEmail/gmbListings.length*100)}%)`);
			console.log(`   Listings with address: ${withAddress}/${gmbListings.length} (${Math.round(withAddress/gmbListings.length*100)}%)`);
			console.log(`   Listings with website: ${withWebsite}/${gmbListings.length} (${Math.round(withWebsite/gmbListings.length*100)}%)`);
		} else {
			console.log("⚠️ No GMB listings found. This could be due to:");
			console.log("   - Search term not returning GMB results");
			console.log("   - Page structure changes requiring selector updates");
			console.log("   - Network issues or rate limiting");
		}

		console.log("\n✅ GMB Scraper test completed successfully!");

	} catch (error) {
		console.error("\n❌ GMB Scraper test failed:", error.message);
		console.error("Full error:", error);
	} finally {
		// Clean up
		console.log("\n🧹 Cleaning up...");
		await gmbScraper.close();
		console.log("✅ GMB Scraper closed");
	}
}

async function testIntegratedScraping() {
	console.log("\n🔗 Testing Integrated Lead Scraper with GMB");
	console.log("=" .repeat(50));

	const LeadScraper = require("./scrapers/leadScraper");
	const leadScraper = new LeadScraper();

	try {
		console.log("Testing integrated scraping with GMB enabled...");
		
		// Test with a small number of results
		const testKeywords = ["pizza restaurant Manhattan"];
		const results = await leadScraper.scrapeLeads(testKeywords, 5, 0);
		
		console.log(`\n📊 Integrated Scraping Results:`);
		console.log(`   Total leads: ${results.length}`);
		
		const gmbLeads = results.filter(lead => lead.source === "Google My Business");
		const websiteLeads = results.filter(lead => lead.source !== "Google My Business");
		
		console.log(`   GMB leads: ${gmbLeads.length}`);
		console.log(`   Website leads: ${websiteLeads.length}`);
		
		if (gmbLeads.length > 0) {
			console.log(`\n🏢 Sample GMB Lead:`);
			const sampleGMB = gmbLeads[0];
			console.log(`   Name: ${sampleGMB.name}`);
			console.log(`   Phone: ${sampleGMB.phone || 'Not available'}`);
			console.log(`   Email: ${sampleGMB.email || 'Not available'}`);
			console.log(`   Address: ${sampleGMB.address || 'Not available'}`);
		}
		
		console.log("\n✅ Integrated scraping test completed!");
		
	} catch (error) {
		console.error("\n❌ Integrated scraping test failed:", error.message);
	}
}

async function main() {
	console.log("🚀 GMB Scraper Test Suite");
	console.log("Testing separate Chromium instance for GMB scraping");
	console.log("Focus: Extract name/title, phone, email from GMB listings");
	console.log("=" .repeat(70));

	// Check configuration
	console.log("⚙️ Configuration Check:");
	console.log(`   GMB Enabled: ${config.GMB?.ENABLED}`);
	console.log(`   Separate Browser: ${config.GMB?.SEPARATE_BROWSER}`);
	console.log(`   Max Results: ${config.GMB?.MAX_RESULTS_PER_SEARCH}`);
	console.log(`   Headless Mode: ${config.GMB?.HEADLESS}`);

	if (!config.GMB?.ENABLED) {
		console.log("❌ GMB scraping is disabled in config. Enable it to run tests.");
		return;
	}

	try {
		// Test standalone GMB scraper
		await testGMBScraper();
		
		// Test integrated scraping
		await testIntegratedScraping();
		
		console.log("\n🎉 All tests completed!");
		
	} catch (error) {
		console.error("\n💥 Test suite failed:", error.message);
		process.exit(1);
	}
}

// Handle graceful shutdown
process.on("SIGINT", () => {
	console.log("\n⏹️ Test interrupted by user");
	process.exit(0);
});

process.on("SIGTERM", () => {
	console.log("\n⏹️ Test terminated");
	process.exit(0);
});

if (require.main === module) {
	main().catch((error) => {
		console.error("💥 Fatal test error:", error);
		process.exit(1);
	});
}

module.exports = { testGMBScraper, testIntegratedScraping };

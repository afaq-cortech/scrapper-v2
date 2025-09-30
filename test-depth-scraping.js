#!/usr/bin/env node

/**
 * Test script for depth-based child link scraping
 * This script demonstrates the new depth scraping functionality
 */

const LeadScrapingApp = require('./index.js');

async function testDepthScraping() {
	console.log('🧪 Testing Depth-Based Child Link Scraping');
	console.log('='.repeat(50));

	const app = new LeadScrapingApp();

	// Test URLs for depth scraping
	const testUrls = [
		'https://example.com',
		'https://httpbin.org'
	];

	console.log('\n📋 Test Configuration:');
	console.log(`   URLs: ${testUrls.length}`);
	console.log(`   Depth: 1 (will scrape main pages + child links)`);
	console.log(`   Expected: Main pages + their child links (about, contact, etc.)`);

	try {
		console.log('\n⏳ Starting depth scraping test...');
		
		// Test with depth 1
		const leads = await app.scrapeUrls(testUrls, 1);
		
		console.log('\n🎉 Depth scraping test completed!');
		console.log(`📊 Results: ${leads.length} leads found`);
		
		// Show some statistics
		if (leads.length > 0) {
			console.log('\n📈 Lead Statistics:');
			console.log(`   Total leads: ${leads.length}`);
			console.log(`   Leads with name: ${leads.filter(l => l.name).length}`);
			console.log(`   Leads with email: ${leads.filter(l => l.email).length}`);
			console.log(`   Leads with phone: ${leads.filter(l => l.phone).length}`);
		}

	} catch (error) {
		console.error('\n❌ Test failed:', error.message);
		console.log('\n💡 Make sure:');
		console.log('   • Your internet connection is working');
		console.log('   • The test URLs are accessible');
		console.log('   • Playwright browsers are installed: npx playwright install');
	}
}

// Run the test if this script is executed directly
if (require.main === module) {
	testDepthScraping().catch(error => {
		console.error('❌ Test script error:', error);
		process.exit(1);
	});
}

module.exports = testDepthScraping;


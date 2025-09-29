const axios = require("axios");
require("dotenv").config();


class MicroserviceClient {
	constructor() {
		this.baseUrl = "http://localhost:8000";
		this.timeout = 30000;
	}

	async scrapeSingleWebsite(url) {
		try {
			console.log(`🌐 Scraping: ${url}`);

			const response = await axios.post(
				`${this.baseUrl}/run-scraper`,
				{
					url: url,
				},
				{
					timeout: this.timeout,
					headers: {
						"Content-Type": "application/json",
					},
				}
			);

			if (response.data && response.data.success) {
				return {
					success: true,
					url: url,
					content: response.data.data || response.data.content || "",
					metadata: response.data.metadata || {},
				};
			} else {
				return {
					success: false,
					url: url,
					content: "",
					error: response.data?.error || "No data returned",
				};
			}
		} catch (error) {
			console.log(`❌ Failed to scrape ${url}: ${error.message}`);
			return {
				success: false,
				url: url,
				content: "",
				error: error.message,
			};
		}
	}

	async scrapeMultipleWebsites(websites) {
		console.log(`🚀 Scraping ${websites.length} websites...`);

		const results = [];
		const batchSize = 3;

		for (let i = 0; i < websites.length; i += batchSize) {
			const batch = websites.slice(i, i + batchSize);
			console.log(
				`📦 Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
					websites.length / batchSize
				)}`
			);

			const batchPromises = batch.map((website) =>
				this.scrapeSingleWebsite(website.link || website.url)
			);

			try {
				const batchResults = await Promise.all(batchPromises);
				results.push(...batchResults);

				if (i + batchSize < websites.length) {
					await new Promise((resolve) => setTimeout(resolve, 2000));
				}
			} catch (error) {
				console.log(`❌ Batch failed: ${error.message}`);
				batch.forEach((website) => {
					results.push({
						success: false,
						url: website.link || website.url,
						content: "",
						error: `Batch failed: ${error.message}`,
					});
				});
			}
		}

		const successful = results.filter((r) => r.success);
		const failed = results.filter((r) => !r.success);

		console.log(
			`📊 Scraping completed: ${successful.length} success, ${failed.length} failed`
		);
		return results;
	}

	async checkConnection() {
		try {
			const response = await axios.get(`${this.baseUrl}/health`, {
				timeout: 10000,
			});
			return {
				success: true,
				status: response.status,
			};
		} catch (error) {
			return {
				success: false,
				error: error.message,
			};
		}
	}
}

module.exports = MicroserviceClient;

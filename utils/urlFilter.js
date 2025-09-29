const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require("../config");
require("dotenv").config();

class UrlFilter {
	constructor() {
		this.apiKey = config.LLM.API_KEY;
		this.genAI = this.apiKey ? new GoogleGenerativeAI(this.apiKey) : null;
		this.model = this.genAI
			? this.genAI.getGenerativeModel({ model: config.LLM.MODEL })
			: null;
		this.batchSize = 10;
	}

	async filterUrls(searchResults, keyword) {
		if (!this.genAI) {
			console.log("No Gemini API key available, returning all URLs");
			return searchResults.map((result) => ({
				...result,
				score: 6,
				reason: "No AI filtering available",
			}));
		}

		console.log(
			`Filtering ${searchResults.length} URLs for keyword: "${keyword}"`
		);

		const batches = this.createBatches(searchResults, this.batchSize);
		let allFilteredUrls = [];

		for (let i = 0; i < batches.length; i++) {
			console.log(`Processing batch ${i + 1}/${batches.length}`);

			try {
				const batchResults = await this.filterBatch(batches[i], keyword);
				allFilteredUrls.push(...batchResults);

				// Add delay between batches to respect rate limits
				if (i < batches.length - 1) {
					await this.delay(1000);
				}
			} catch (error) {
				console.error(`Batch ${i + 1} filtering failed:`, error);
				// Continue with next batch
			}
		}

		// Sort by score and return top results
		const sortedUrls = allFilteredUrls
			.sort((a, b) => b.score - a.score)
			.filter((result) => result.score >= 7);

		console.log(
			`URL filtering completed: ${sortedUrls.length} relevant URLs found`
		);
		return sortedUrls;
	}

	async filterBatch(batch, keyword) {
		const prompt = this.buildFilterPrompt(batch, keyword);

		try {
			const result = await this.model.generateContent(prompt);
			const response = await result.response.text();
			return this.parseFilterResponse(response, batch);
		} catch (error) {
			console.error("Gemini filtering error:", error);
			// Fallback: return all URLs with neutral scores
			return batch.map((item) => ({
				...item,
				score: 6,
				reason: "Fallback due to AI error",
			}));
		}
	}

	buildFilterPrompt(batch, keyword) {
		const urlData = batch
			.map(
				(item, index) =>
					`${index + 1}. URL: ${item.url}
   Title: ${item.title || "No title"}
   Snippet: ${item.snippet || "No snippet"}`
			)
			.join("\n\n");

		return `Analyze these Google search results for the keyword "${keyword}" and evaluate each URL for business lead generation potential.

Look for:
- Business websites with contact information
- Company directories
- Professional service providers
- Local business listings
- Organizations that likely have contact details

Avoid:
- News articles or blogs without business contact info
- Social media posts
- Educational or informational content without business focus
- Generic directories without specific business details

Rate each URL from 1-10 (where 10 = excellent lead potential, 1 = poor lead potential).
Only return URLs scoring 7 or higher.

Search Results:
${urlData}

Respond in valid JSON format:
{
  "filtered_urls": [
    {
      "index": 1,
      "score": 8,
      "reason": "Business website with likely contact information"
    }
  ]
}`;
	}

	parseFilterResponse(response, originalBatch) {
		try {
			// Clean the response to extract JSON
			const cleanResponse = response.replace(/```json|```/g, "").trim();
			const parsed = JSON.parse(cleanResponse);

			if (!parsed.filtered_urls || !Array.isArray(parsed.filtered_urls)) {
				throw new Error("Invalid response format");
			}

			return parsed.filtered_urls.map((filtered) => {
				const original = originalBatch[filtered.index - 1];
				return {
					...original,
					score: filtered.score,
					reason: filtered.reason,
				};
			});
		} catch (error) {
			console.error("Failed to parse filter response:", error);
			// Fallback: return all URLs with neutral scores
			return originalBatch.map((item) => ({
				...item,
				score: 6,
				reason: "Parse error fallback",
			}));
		}
	}

	createBatches(array, batchSize) {
		const batches = [];
		for (let i = 0; i < array.length; i += batchSize) {
			batches.push(array.slice(i, i + batchSize));
		}
		return batches;
	}

	delay(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	isAvailable() {
		return !!this.genAI;
	}
}

module.exports = UrlFilter;

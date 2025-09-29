const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

class WebsiteRelevanceFilter {
	constructor() {
		this.apiKey = process.env.GEMINI_API_KEY;
		this.genAI = this.apiKey ? new GoogleGenerativeAI(this.apiKey) : null;
	}

	async filterRelevantWebsites(websites, keyword) {
		try {
			if (!this.genAI) {
				console.log("⚠️ No LLM available, returning all websites");
				return websites;
			}

			console.log(
				`🔍 Filtering ${websites.length} websites for keyword: "${keyword}"`
			);
			const modelsList = this.genAI.listModels();
			console.log("models list:",modelsList);
			const model = this.genAI.getGenerativeModel({
				model: "gemini-2.0-flash",
			});

			const prompt = `Analyze these websites and return only the ones relevant to the keyword.

KEYWORD: "${keyword}"

WEBSITES:
${websites
	.map(
		(site, index) => `${index + 1}. ${site.title || "No title"} - ${site.link}`
	)
	.join("\n")}

Return only relevant websites in JSON format:
{
  "relevantWebsites": [1, 3, 5]
}

Only include website numbers that are relevant to the keyword.`;

			const result = await model.generateContent(prompt);
			const response = await result.response.text();

			const jsonMatch = response.match(/\{[\s\S]*\}/);
			if (!jsonMatch) {
				console.log("⚠️ LLM response parsing failed, returning all websites");
				return websites;
			}

			const filteredData = JSON.parse(jsonMatch[0]);

			if (
				filteredData.relevantWebsites &&
				filteredData.relevantWebsites.length > 0
			) {
				const relevantWebsites = filteredData.relevantWebsites.map(
					(index) => websites[index - 1]
				);
				console.log(
					`✅ Filtered to ${relevantWebsites.length} relevant websites`
				);
				return relevantWebsites;
			} else {
				console.log("⚠️ No relevant websites found, returning all");
				return websites;
			}
		} catch (error) {
			console.log(
				`⚠️ LLM filtering failed: ${error.message}, returning all websites`
			);
			return websites;
		}
	}

	isAvailable() {
		return !!this.genAI;
	}
}

module.exports = WebsiteRelevanceFilter;

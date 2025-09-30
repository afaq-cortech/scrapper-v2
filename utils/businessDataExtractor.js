const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

class BusinessDataExtractor {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    this.genAI = this.apiKey ? new GoogleGenerativeAI(this.apiKey) : null;
  }

  async extractBusinessData(pageContent, keyword, url = "") {
    try {
      if (!this.genAI) {
        return this.extractBasicData(pageContent);
      }


      console.log(`🧠 Extracting data from ${pageContent.length} characters`);

      const prompt = `Extract business contact information from this webpage content.

KEYWORD: "${keyword}"
URL: "${url}"

CONTENT:
${pageContent.substring(0, 3000)}

Extract business information in JSON format:
{
  "name": "Contact person name", 
  "company": "Company name",
  "email": "Email address",
  "phone": "Phone number",
  "jobTitle": "Job title/position/designation"
}

If no relevant information found, return empty strings.`;
      const model = this.genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
      });
      const result = await model.generateContent(prompt);
      const response = await result.response.text();

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.log("⚠️ LLM response parsing failed, using basic extraction");
        return this.extractBasicData(pageContent);
      }

      const extractedData = JSON.parse(jsonMatch[0]);
      console.log(
        `✅ Extracted data for: ${extractedData.company || extractedData.name}`
      );
      return extractedData;
    } catch (error) {
      console.log(
        `⚠️ LLM extraction failed: ${error.message}, using basic extraction`
      );
      return this.extractBasicData(pageContent);
    }
  }

  extractBasicData(pageContent) {
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    const phoneRegex =
      /(\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4})/g;

    const emails = pageContent.match(emailRegex) || [];
    const phones = pageContent.match(phoneRegex) || [];

    const cleanEmails = emails.filter(
      (email) =>
        !email.includes("example.") &&
        !email.includes("test@") &&
        !email.includes("noreply") &&
        email.includes(".") &&
        email.length > 5
    );

    const cleanPhones = phones.filter((phone) => {
      const digits = phone.replace(/\D/g, "");
      return digits.length >= 7 && digits.length <= 15;
    });

    return {
      company: "",
      name: "",
      email: cleanEmails[0] || "",
      phone: cleanPhones[0] || "",
      website: "",
      location: "",
      jobTitle: "",
    };
  }

  async extractDataFromMultipleWebsites(scrapedResults, keyword) {
    console.log(
      `🔄 Extracting data from ${scrapedResults.length} scraped websites...`
    );

    const extractedData = [];
    let successful = 0;
    let failed = 0;

    for (const result of scrapedResults) {
      if (!result.success || !result.content) {
        failed++;
        extractedData.push({
          url: result.url,
          success: false,
          error: result.error || "No content",
        });
        continue;
      }

      try {
        const extracted = await this.extractBusinessData(
          result.content,
          keyword,
          result.url
        );

        extractedData.push({
          url: result.url,
          success: true,
          data: extracted,
        });

        successful++;
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        failed++;
        extractedData.push({
          url: result.url,
          success: false,
          error: error.message,
        });
      }
    }

    console.log(
      `📊 Extraction completed: ${successful} success, ${failed} failed`
    );
    return extractedData;
  }

  isAvailable() {
    return !!this.genAI;
  }
}

module.exports = BusinessDataExtractor;

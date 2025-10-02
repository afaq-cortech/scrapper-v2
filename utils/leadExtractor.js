const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require("../config");
require("dotenv").config();

class LeadExtractor {
  constructor() {
    this.apiKey = config.LLM.API_KEY;
    this.genAI = this.apiKey ? new GoogleGenerativeAI(this.apiKey) : null;
    this.model = this.genAI
      ? this.genAI.getGenerativeModel({ model: config.LLM.MODEL })
      : null;
    
    // Circuit breaker properties
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.circuitBreakerThreshold = 5; // Failures before circuit opens
    this.circuitBreakerTimeout = 300000; // 5 minutes
    this.circuitOpen = false;
  }

  async extractLeads(websiteData, keyword) {
    if (!this.genAI) {
      console.log("No Gemini API key available, using basic extraction");
      return this.extractBasicLeads(websiteData);
    }

    console.log(
      `Extracting leads from ${websiteData.length} websites for keyword: "${keyword}"`
    );

    const results = [];

    for (const data of websiteData) {
      try {
        const leads = await this.extractLeadsFromWebsite(data, keyword);
        results.push(...leads);

        // Add delay between extractions to respect rate limits
        await this.delay(1000);
      } catch (error) {
        console.error(`Failed to extract leads from ${data.url}:`, error);
        // Continue with next website
      }
    }

    console.log(`Lead extraction completed: ${results.length} leads found`);
    return results;
  }

  async extractLeadsFromWebsite(websiteData, keyword) {
    const content = websiteData.content || "";
    const wordCount = this.countWords(content);

    // If content is small, process normally
    if (wordCount <= 3000) {
      return await this.processSingleBatch(websiteData, keyword, content);
    }

    // For large content, split into batches and maintain context
    return await this.processLargeContent(websiteData, keyword, content);
  }

  async processSingleBatch(websiteData, keyword, content) {
    const prompt = this.buildExtractionPrompt(websiteData, keyword, content);

    return await this.retryWithBackoff(async () => {
      const result = await this.model.generateContent(prompt);
      const response = await result.response.text();
      return this.parseExtractionResponse(response, websiteData);
    }, `Gemini extraction for ${websiteData.url}`);
  }

  async processLargeContent(websiteData, keyword, content) {
    const batches = this.splitContentIntoBatches(content, 3000);
    let contextSummary = "";
    let allLeads = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const isLastBatch = i === batches.length - 1;

      try {
        const result = await this.processBatchWithContext(
          websiteData,
          keyword,
          batch,
          contextSummary,
          isLastBatch
        );

        const { leads, newContextSummary } = this.parseBatchResponse(
          result,
          websiteData
        );
        allLeads.push(...leads);
        contextSummary = newContextSummary;

        if (!isLastBatch) {
          // Add rate limiting delay between batches
          const rateLimitDelay = config.LLM.RATE_LIMIT_DELAY || 1000;
          await this.delay(rateLimitDelay);
        }
      } catch (error) {
        console.error(`Batch ${i + 1} processing failed:`, error);
        // Continue with next batch even if one fails
        continue;
      }
    }

    return allLeads;
  }

  async processBatchWithContext(
    websiteData,
    keyword,
    batchContent,
    contextSummary,
    isLastBatch
  ) {
    const prompt = this.buildBatchExtractionPrompt(
      websiteData,
      keyword,
      batchContent,
      contextSummary,
      isLastBatch
    );

    return await this.retryWithBackoff(async () => {
      const result = await this.model.generateContent(prompt);
      return await result.response.text();
    }, `Gemini batch processing for ${websiteData.url}`);
  }

  buildExtractionPrompt(websiteData, keyword, content) {
    const processedContent = content
      ? content.substring(0, 50000)
      : websiteData.content.substring(0, 50000);

    // 		return `
    // Extract business lead information from this website content.

    // KEYWORD: "${keyword}"
    // URL: "${websiteData.url}"

    // CONTENT:
    // ${processedContent}

    // Extract ONLY the following 5 fields in JSON format:
    // {
    //   "leads": [
    //     {
    //       "name": "Full name of the individual",
    //       "title": "Job title or professional designation",
    //       "company": "Current organization or employer",
    //       "email": "Email address",
    //       "phone": "Contact number (mobile or office)"
    //     }
    //   ]
    // }

    // Rules:
    // - Extract ONLY the 5 required fields: name, title, company, email, phone
    // - Include multiple contacts if found (CEO, manager, sales, etc.)
    // - Only extract clearly visible contact information
    // - Don't infer or guess missing data
    // - Format phone numbers consistently
    // - If no relevant information found, return empty leads array
    // - Do NOT include website, address, or any other fields

    // Respond in valid JSON format only.`;

    return `
	You are a professional business data extraction specialist. Analyze the following webpage content and extract comprehensive business information.

SEARCH CONTEXT:
- Keyword: "${keyword}"
- Website URL: "${websiteData.url}"
- Task: Extract all relevant business contact and company information

WEBPAGE CONTENT:
${processedContent}

EXTRACTION INSTRUCTIONS:
1. Scan the entire content for business information
2. Look in common sections: Contact, About Us, Team, Staff Directory, Footer, Header
3. Prioritize decision-makers, executives, and department heads
4. If multiple contacts exist, extract the most relevant to the search keyword
5. Extract company information even if no individual contacts are found
6. Look for social media profiles and additional contact methods

REQUIRED OUTPUT FORMAT - Return ONLY valid JSON:
  {
    "leads": [
         {
           "name": "Full name of the individual",
           "title": "Job title or professional designation",
           "company": "Current organization or employer",
           "email": "Email address",
           "phone": "Contact number (mobile or office)"
         }
       ]
   }

VALIDATION RULES:
- Only include real, verified information found in the content
- Use empty strings "" for missing information, never use null or "N/A"
- Ensure email addresses are valid format (contain @ and domain)
- Format phone numbers clearly with country code if international
- Remove any placeholder text like "Your Name Here" or "Contact Us"
- Verify social media URLs are complete and valid
- If extracting from team/staff pages, prioritize senior roles
- For search keyword "${keyword}", prioritize contacts most relevant to this role/department

QUALITY CHECKS:
- Email addresses must contain @ symbol
- Names should not contain generic terms like "Contact" or "Info"

CONTENT ANALYSIS PRIORITY:
1. Header and navigation areas (company name, main contact)
2. Contact/Contact Us pages (comprehensive contact info)
3. About/About Us pages (company info, leadership)
4. Team/Staff/Directory pages (individual contacts)
5. Footer sections (additional contact methods)
6. Service/Product pages (business focus)
7. Address/Location pages (physical locations)

Return only the JSON object with extracted information.
	`;
  }

  buildBatchExtractionPrompt(
    websiteData,
    keyword,
    batchContent,
    contextSummary,
    isLastBatch
  ) {
    const contextSection = contextSummary
      ? `\nPREVIOUS CONTEXT:\n${contextSummary}\n`
      : "";

    return `Extract business lead information from this website content.

KEYWORD: "${keyword}"
URL: "${websiteData.url}"
${contextSection}
CURRENT CONTENT:
${batchContent}

Extract ONLY the following 5 fields in JSON format:
{
  "leads": [
    {
      "name": "Full name of the individual",
      "title": "Job title or professional designation",
      "company": "Current organization or employer",
      "email": "Email address",
      "phone": "Contact number (mobile or office)"
    }
  ],
  "context_summary": "Brief summary of key business information found"
}

Rules:
- Extract ONLY the 5 required fields: name, title, company, email, phone
- Include multiple contacts if found (CEO, manager, sales, etc.)
- Only extract clearly visible contact information
- Don't infer or guess missing data
- Format phone numbers consistently
- If no relevant information found, return empty leads array
- Do NOT include website, address, or any other fields
- Provide context summary for next batch

Respond in valid JSON format only.`;
  }

  parseExtractionResponse(response, websiteData) {
    try {
      const cleanResponse = response.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleanResponse);

      if (!parsed.leads || !Array.isArray(parsed.leads)) {
        throw new Error("Invalid response format");
      }

      return parsed.leads.map((lead) => ({
        ...lead,
        sourceUrl: websiteData.url,
        extractedAt: new Date().toISOString(),
        keyword: websiteData.keyword || "unknown",
      }));
    } catch (error) {
      console.error("Failed to parse extraction response:", error);
      return this.extractBasicLeads([websiteData]);
    }
  }

  parseBatchResponse(response, websiteData) {
    try {
      const cleanResponse = response.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleanResponse);

      if (!parsed.leads || !Array.isArray(parsed.leads)) {
        throw new Error("Invalid response format");
      }

      const leads = parsed.leads.map((lead) => ({
        ...lead,
        sourceUrl: websiteData.url,
        extractedAt: new Date().toISOString(),
        keyword: websiteData.keyword || "unknown",
      }));

      return {
        leads,
        newContextSummary: parsed.context_summary || "",
      };
    } catch (error) {
      console.error("Failed to parse batch response:", error);
      return {
        leads: this.extractBasicLeads([websiteData]),
        newContextSummary: "",
      };
    }
  }

  countWords(text) {
    if (!text) return 0;
    return text
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 0).length;
  }

  splitContentIntoBatches(content, maxWords) {
    const words = content.split(/\s+/);
    const batches = [];

    for (let i = 0; i < words.length; i += maxWords) {
      const batchWords = words.slice(i, i + maxWords);
      batches.push(batchWords.join(" "));
    }

    return batches;
  }

  extractBasicLeads(websiteDataArray) {
    const leads = [];

    for (const data of websiteDataArray) {
      const content = data.content || "";

      // Basic regex patterns
      const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
      const phoneRegex =
        /(\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4})/g;

      const emails = content.match(emailRegex) || [];
      const phones = content.match(phoneRegex) || [];

      // Clean and validate
      const cleanEmails = emails.filter(
        (email) =>
          !email.includes("example.") &&
          !email.includes("test@") &&
          !email.includes("noreply")
      );

      const cleanPhones = phones.filter((phone) => {
        const digits = phone.replace(/\D/g, "");
        return digits.length >= 10 && digits.length <= 15;
      });

      if (cleanEmails.length > 0 || cleanPhones.length > 0) {
        leads.push({
          name: "",
          title: "",
          company: this.extractCompanyName(content),
          email: cleanEmails[0] || "",
          phone: cleanPhones[0] || "",
          sourceUrl: data.url,
          extractedAt: new Date().toISOString(),
          keyword: data.keyword || "unknown",
        });
      }
    }

    return leads;
  }

  extractCompanyName(content) {
    // Simple company name extraction
    const lines = content.split("\n").slice(0, 10); // First 10 lines
    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed.length > 5 &&
        trimmed.length < 100 &&
        !trimmed.includes("@") &&
        !trimmed.match(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/)
      ) {
        return trimmed;
      }
    }
    return "";
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if circuit breaker is open
   * @returns {boolean} Whether the circuit is open
   */
  isCircuitOpen() {
    if (!this.circuitOpen) return false;
    
    // Check if timeout has passed
    const now = Date.now();
    if (now - this.lastFailureTime > this.circuitBreakerTimeout) {
      console.log('🔄 Circuit breaker timeout passed, attempting to close circuit');
      this.circuitOpen = false;
      this.failureCount = 0;
      return false;
    }
    
    return true;
  }

  /**
   * Record a successful operation
   */
  recordSuccess() {
    this.failureCount = 0;
    this.circuitOpen = false;
  }

  /**
   * Record a failed operation
   */
  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.circuitBreakerThreshold) {
      this.circuitOpen = true;
      console.warn(`🚨 Circuit breaker opened after ${this.failureCount} failures`);
    }
  }

  /**
   * Retry mechanism with exponential backoff for API calls
   * @param {Function} operation - The async operation to retry
   * @param {string} operationName - Name of the operation for logging
   * @returns {Promise} Result of the operation
   */
  async retryWithBackoff(operation, operationName) {
    // Check circuit breaker
    if (this.isCircuitOpen()) {
      console.warn(`🚨 Circuit breaker is open, falling back to basic extraction for ${operationName}`);
      return this.extractBasicLeads([{ url: operationName, content: '' }]);
    }

    const maxRetries = config.LLM.RETRY_ATTEMPTS || 5;
    const baseDelay = config.LLM.RETRY_DELAY || 2000;
    const maxDelay = config.LLM.MAX_RETRY_DELAY || 30000;
    const useExponentialBackoff = config.LLM.EXPONENTIAL_BACKOFF !== false;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Add rate limiting delay between requests
        if (attempt > 1) {
          const rateLimitDelay = config.LLM.RATE_LIMIT_DELAY || 1000;
          await this.delay(rateLimitDelay);
        }

        const result = await operation();
        this.recordSuccess(); // Record successful operation
        return result;
      } catch (error) {
        this.recordFailure(); // Record failed operation
        
        const isRetryableError = this.isRetryableError(error);
        
        if (!isRetryableError || attempt === maxRetries) {
          console.error(`❌ ${operationName} failed after ${attempt} attempts:`, error.message);
          if (isRetryableError) {
            console.log(`🔄 Falling back to basic extraction for ${operationName}`);
            return this.extractBasicLeads([{ url: operationName, content: '' }]);
          }
          throw error;
        }

        // Calculate delay with exponential backoff
        let delay = baseDelay;
        if (useExponentialBackoff) {
          delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
        }

        console.warn(`⚠️ ${operationName} attempt ${attempt}/${maxRetries} failed: ${error.message}`);
        console.log(`🔄 Retrying in ${delay}ms...`);
        
        await this.delay(delay);
      }
    }
  }

  /**
   * Check if an error is retryable
   * @param {Error} error - The error to check
   * @returns {boolean} Whether the error is retryable
   */
  isRetryableError(error) {
    const retryableErrors = [
      '503 Service Unavailable',
      '429 Too Many Requests',
      '500 Internal Server Error',
      '502 Bad Gateway',
      '504 Gateway Timeout',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND'
    ];

    const errorMessage = error.message || error.toString();
    return retryableErrors.some(retryableError => 
      errorMessage.includes(retryableError)
    );
  }

  isAvailable() {
    return !!this.genAI && !this.isCircuitOpen();
  }
}

module.exports = LeadExtractor;

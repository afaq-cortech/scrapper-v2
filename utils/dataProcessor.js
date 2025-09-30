const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const config = require("../config");
require("dotenv").config();


// US states for location extraction
const US_STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
];

// International locations for broader coverage
const INTERNATIONAL_LOCATIONS = [
  "London",
  "Manchester",
  "Birmingham",
  "Leeds",
  "Liverpool",
  "Sheffield",
  "Edinburgh",
  "Bristol",
  "Glasgow",
  "Cardiff",
  "Belfast",
  "Newcastle",
  "Leicester",
  "Bradford",
  "Coventry",
  "Nottingham",
  "Southampton",
  "Toronto",
  "Vancouver",
  "Montreal",
  "Calgary",
  "Ottawa",
  "Edmonton",
  "Sydney",
  "Melbourne",
  "Brisbane",
  "Perth",
  "Adelaide",
  "Auckland",
  "Wellington",
  "Christchurch",
  "Dublin",
  "Cork",
  "Galway",
  "Berlin",
  "Munich",
  "Hamburg",
  "Cologne",
  "Frankfurt",
  "Paris",
  "Lyon",
  "Marseille",
  "Toulouse",
  "Nice",
  "Rome",
  "Milan",
  "Naples",
  "Turin",
  "Florence",
  "Madrid",
  "Barcelona",
  "Valencia",
  "Seville",
];

// Common business suffixes to clean
const BUSINESS_SUFFIXES = [
  "LLC",
  "Inc",
  "Corp",
  "Ltd",
  "Limited",
  "Company",
  "Co",
  "Group",
  "Associates",
  "Partners",
  "Services",
  "Solutions",
  "Consulting",
  "Enterprise",
  "Enterprises",
  "International",
  "Global",
  "Worldwide",
];

// Industry keywords mapping
const INDUSTRY_KEYWORDS = {
  healthcare: [
    "doctor",
    "medical",
    "clinic",
    "hospital",
    "health",
    "dentist",
    "dental",
    "optometrist",
    "pharmacy",
    "physician",
    "surgeon",
    "nurse",
    "therapist",
    "psychologist",
    "psychiatrist",
  ],
  legal: [
    "lawyer",
    "attorney",
    "law firm",
    "legal",
    "paralegal",
    "solicitor",
    "barrister",
    "counsel",
    "advocate",
  ],
  "real estate": [
    "real estate",
    "realtor",
    "property",
    "homes",
    "housing",
    "mortgage",
    "broker",
    "agent",
    "developer",
  ],
  finance: [
    "bank",
    "financial",
    "insurance",
    "investment",
    "accounting",
    "cpa",
    "finance",
    "credit",
    "loan",
    "mortgage",
  ],
  technology: [
    "software",
    "tech",
    "it services",
    "developer",
    "programming",
    "digital",
    "web",
    "app",
    "mobile",
    "cybersecurity",
  ],
  retail: [
    "store",
    "shop",
    "retail",
    "sales",
    "merchandise",
    "boutique",
    "market",
    "mall",
    "outlet",
  ],
  restaurant: [
    "restaurant",
    "cafe",
    "food",
    "dining",
    "catering",
    "bar",
    "pub",
    "grill",
    "kitchen",
    "bakery",
  ],
  automotive: [
    "auto",
    "car",
    "vehicle",
    "mechanic",
    "garage",
    "dealership",
    "repair",
    "service",
    "parts",
  ],
  education: [
    "school",
    "university",
    "college",
    "education",
    "teacher",
    "tutor",
    "training",
    "academy",
    "institute",
  ],
  construction: [
    "construction",
    "contractor",
    "builder",
    "renovation",
    "plumbing",
    "electrical",
    "roofing",
    "painting",
  ],
  manufacturing: [
    "manufacturing",
    "factory",
    "production",
    "industrial",
    "machinery",
    "equipment",
    "supply",
  ],
  transportation: [
    "transport",
    "shipping",
    "logistics",
    "delivery",
    "freight",
    "trucking",
    "warehouse",
    "storage",
  ],
};

class DataProcessor {
  constructor() {
    this.duplicates = new Set();
    this.backupFile = null;
    this.processedCount = 0;
    this.validationStats = {
      valid: 0,
      invalid: 0,
      errors: {},
    };
  }

  // Initialize backup file for incremental saves
  initializeBackup(filename, type = "generic") {
    try {
      if (!fs.existsSync(config.OUTPUT_DIR)) {
        fs.mkdirSync(config.OUTPUT_DIR, { recursive: true });
      }

      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .replace("T", "_")
        .slice(0, 19);
      const backupFilename = `backup_${timestamp}.json`;
      this.backupFile = path.join(config.OUTPUT_DIR, backupFilename);

      const header = {
        type: type,
        startedAt: new Date().toISOString(),
        totalLeads: 0,
        leads: [],
        metadata: {
          version: "2.0",
          processor: "DataProcessor",
          config: {
            outputFormat: config.OUTPUT_FORMAT,
            outputDir: config.OUTPUT_DIR,
          },
        },
      };

      fs.writeFileSync(this.backupFile, JSON.stringify(header, null, 2));
      console.log(`✅ Backup file created: ${this.backupFile}`);
      return this.backupFile;
    } catch (error) {
      console.error("❌ Error creating backup file:", error);
      throw error;
    }
  }

  // Append single lead to backup file with improved performance
  appendLeadToBackup(lead) {
    if (!this.backupFile) return;

    try {
      const processedLead = this._processLead(lead);
      const validation = this.validateLead(processedLead);

      processedLead.isValid = validation.isValid;
      processedLead.validationErrors = validation.errors;

      if (processedLead.isValid) {
        // Read file once and append in memory
        const backupContent = fs.readFileSync(this.backupFile, "utf8");
        const backupData = JSON.parse(backupContent);

        backupData.leads.push(processedLead);
        backupData.totalLeads = backupData.leads.length;

        // Write back to file
        fs.writeFileSync(this.backupFile, JSON.stringify(backupData, null, 2));

        this.processedCount++;
        this.validationStats.valid++;

        const contactInfo =
          processedLead.email || processedLead.phone
            ? `Contact found`
            : "No contact";
        console.log(
          `💾 Saved: ${
            processedLead.name || processedLead.company
          } - ${contactInfo}`
        );
      } else {
        this.validationStats.invalid++;
        // Track validation errors
        validation.errors.forEach((error) => {
          this.validationStats.errors[error] =
            (this.validationStats.errors[error] || 0) + 1;
        });
      }
    } catch (error) {
      console.error("❌ Error appending lead:", error);
    }
  }

  // Process individual lead with improved cleaning - supports both regular leads and GMB listings
  _processLead(lead) {
    const processed = {
      name: this.cleanName(lead.name || lead.fullName || ""),
      title: lead.title ? lead.title.trim() : "",
      company: this.cleanCompanyName(lead.company || ""),
      email: this.cleanEmail(lead.email),
      phone: this.cleanPhone(lead.phone),
    };

    // Add GMB-specific fields if present
    if (lead.source === 'Google My Business' || lead.address || lead.rating || lead.category) {
      processed.address = lead.address ? lead.address.trim() : "";
      processed.rating = lead.rating ? lead.rating.trim() : "";
      processed.reviewCount = lead.reviewCount ? lead.reviewCount.trim() : "";
      processed.category = lead.category ? lead.category.trim() : "";
      processed.website = lead.website ? lead.website.trim() : "";
      processed.hours = lead.hours || "";
      processed.source = lead.source || "Google My Business";
    }

    return processed;
  }

  // Clean person/contact name with improved logic
  cleanName(name) {
    if (!name) return "";

    // Remove common titles and clean up
    let cleaned = name.trim();
    const titles = [
      "Dr.",
      "Dr",
      "Mr.",
      "Mr",
      "Mrs.",
      "Mrs",
      "Ms.",
      "Ms",
      "Prof.",
      "Professor",
      "Sir",
      "Madam",
      "Esq.",
      "Esquire",
    ];

    titles.forEach((title) => {
      const regex = new RegExp(`^${title}\\s+`, "gi");
      cleaned = cleaned.replace(regex, "");
    });

    // Remove extra whitespace and normalize
    cleaned = cleaned.replace(/\s+/g, " ").trim();

    // Capitalize properly
    cleaned = cleaned.replace(/\b\w/g, (l) => l.toUpperCase());

    return cleaned;
  }

  // Extract industry from text content with improved accuracy
  extractIndustry(title = "", description = "", snippet = "") {
    const text = `${title} ${description} ${snippet}`.toLowerCase();

    // Use the industry keywords mapping
    for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
      if (keywords.some((keyword) => text.includes(keyword))) {
        return industry.charAt(0).toUpperCase() + industry.slice(1);
      }
    }

    return "General Business";
  }

  // Close backup file with enhanced metadata
  closeBackup(totalLeads) {
    if (!this.backupFile) return;

    try {
      const backupContent = fs.readFileSync(this.backupFile, "utf8");
      const backupData = JSON.parse(backupContent);

      backupData.totalLeads = totalLeads;
      backupData.completedAt = new Date().toISOString();
      backupData.processingStats = {
        processed: this.processedCount,
        validation: this.validationStats,
        duplicatesRemoved: this.duplicates.size,
      };

      fs.writeFileSync(this.backupFile, JSON.stringify(backupData, null, 2));
      console.log(`✅ Backup completed: ${totalLeads} leads`);
      console.log(
        `📊 Processing stats: ${this.validationStats.valid} valid, ${this.validationStats.invalid} invalid`
      );
    } catch (error) {
      console.error("❌ Error closing backup:", error);
    }
  }

  // Load leads from backup file with error handling
  loadFromBackup(backupFile) {
    try {
      if (!fs.existsSync(backupFile)) return [];

      const backupContent = fs.readFileSync(backupFile, "utf8");
      const backupData = JSON.parse(backupContent);

      console.log(`📂 Loaded ${backupData.leads.length} leads from backup`);
      return backupData.leads || [];
    } catch (error) {
      console.error("❌ Error loading backup:", error);
      return [];
    }
  }

  // Clean email format with improved validation
  cleanEmail(email) {
    if (!email) return "";

    let cleaned = email.toLowerCase().trim();
    cleaned = cleaned.replace(/^mailto:/, "");
    cleaned = cleaned.replace(/[^\w@.-]/g, "");

    // Enhanced email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleaned)) return "";

    // Check for common invalid patterns
    const invalidPatterns = [
      /^test@/i,
      /^example@/i,
      /^admin@/i,
      /^info@/i,
      /^noreply@/i,
      /^no-reply@/i,
      /^donotreply@/i,
    ];

    if (invalidPatterns.some((pattern) => pattern.test(cleaned))) {
      return "";
    }

    return cleaned;
  }

  // Clean phone format - minimal and flexible
  cleanPhone(phone) {
    if (!phone) return "";

    // Remove all non-digit characters except + at the beginning
    let cleaned = phone.replace(/[^\d+]/g, "").trim();
    
    // Remove leading + if it's not followed by digits
    if (cleaned.startsWith("+") && cleaned.length === 1) {
      cleaned = "";
    }
    
    // Basic validation: must have at least 7 digits (minimum for any phone number)
    const digitsOnly = cleaned.replace(/\D/g, "");
    if (digitsOnly.length < 7) {
      return "";
    }
    
    return cleaned;
  }

  // Clean company name with improved suffix removal
  cleanCompanyName(company) {
    if (!company) return "";

    let cleaned = company.trim();

    // Remove business suffixes
    BUSINESS_SUFFIXES.forEach((suffix) => {
      const regex = new RegExp(`\\b${suffix}\\b`, "gi");
      cleaned = cleaned.replace(regex, "").trim();
    });

    // Remove extra whitespace and normalize
    cleaned = cleaned.replace(/\s+/g, " ");

    // Capitalize properly
    cleaned = cleaned.replace(/\b\w/g, (l) => l.toUpperCase());

    return cleaned;
  }

  // Extract location from text with improved accuracy
  extractLocation(text) {
    if (!text) return "";

    const words = text.split(/\s+/);
    let location = "";

    // Check for US states
    for (let i = 0; i < words.length - 1; i++) {
      if (US_STATES.includes(words[i].toUpperCase())) {
        location = `${words[i - 1] || ""} ${words[i]}`.trim();
        break;
      }
    }

    // Check for international locations
    if (!location) {
      for (const city of INTERNATIONAL_LOCATIONS) {
        if (text.toLowerCase().includes(city.toLowerCase())) {
          location = city;
          break;
        }
      }
    }

    return location;
  }

  // Remove duplicate leads with improved logic
  removeDuplicates(leads) {
    const uniqueLeads = [];
    const seenNameEmail = new Set(); // Combined name+email for better deduplication

    leads.forEach((lead) => {
      const email = this.cleanEmail(lead.email);
      const name = lead.name ? lead.name.toLowerCase().trim() : '';

      // Create a unique key combining name and email for better deduplication
      const nameEmailKey = `${name}|${email}`;

      // Only remove if we've seen this exact name+email combination
      // This prevents removing different people who might share the same email
      if (seenNameEmail.has(nameEmailKey)) {
        console.log(`🗑️ Removing duplicate: ${lead.name} (${email})`);
        return;
      }

      // Add this combination to our tracking
      seenNameEmail.add(nameEmailKey);
      uniqueLeads.push(lead);
    });

    const removedCount = leads.length - uniqueLeads.length;
    console.log(`🗑️ Removed ${removedCount} duplicates`);
    return uniqueLeads;
  }

  // Validate lead data - focus on 5 required fields
  validateLead(lead) {
    const validation = { isValid: true, errors: [] };

    // Must have name
    if (!lead.name) {
      validation.errors.push("Missing name");
      validation.isValid = false;
    }

    // Must have at least email or phone for contact
    if (!lead.email && !lead.phone) {
      validation.errors.push("Missing contact information (email or phone)");
      validation.isValid = false;
    }

    return validation;
  }

  // Process array of leads with improved performance
  processLeads(leads) {
    console.log(`🔄 Processing ${leads.length} leads...`);

    const processedLeads = leads.map((lead) => {
      const processed = this._processLead(lead);
      const validation = this.validateLead(processed);

      processed.isValid = validation.isValid;
      processed.validationErrors = validation.errors;

      return processed;
    });

    const uniqueLeads = this.removeDuplicates(processedLeads);
    const validLeads = uniqueLeads.filter((lead) => lead.isValid);

    console.log(
      `✅ Processed ${leads.length} → ${validLeads.length} valid leads`
    );
    return validLeads;
  }

  // Export to Excel with improved formatting
  exportToExcel(leads, filename) {
    try {
      if (!fs.existsSync(config.OUTPUT_DIR)) {
        fs.mkdirSync(config.OUTPUT_DIR, { recursive: true });
      }

      const filepath = path.join(config.OUTPUT_DIR, filename);
      const excelData = this._formatExportData(leads);

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(excelData);

      // Auto-size columns with improved logic
      const columnWidths = {};
      excelData.forEach((row) => {
        Object.keys(row).forEach((key) => {
          const value = String(row[key] || "");
          columnWidths[key] = Math.max(
            columnWidths[key] || 0,
            value.length,
            key.length
          );
        });
      });

      worksheet["!cols"] = Object.keys(columnWidths).map((key) => ({
        wch: Math.min(Math.max(columnWidths[key], 10), 50),
      }));

      XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");
      XLSX.writeFile(workbook, filepath);

      console.log(`📊 Exported ${leads.length} leads to ${filepath}`);
      return filepath;
    } catch (error) {
      console.error("❌ Export to Excel failed:", error);
      throw error;
    }
  }

  // Export to CSV with improved handling
  exportToCSV(leads, filename) {
    try {
      if (!fs.existsSync(config.OUTPUT_DIR)) {
        fs.mkdirSync(config.OUTPUT_DIR, { recursive: true });
      }

      const filepath = path.join(config.OUTPUT_DIR, filename);
      const csvData = this._formatExportData(leads);

      if (csvData.length === 0) {
        throw new Error("No data to export");
      }

      const headers = Object.keys(csvData[0]).join(",");
      const rows = csvData.map((lead) =>
        Object.values(lead)
          .map((value) => {
            const stringValue = String(value || "");
            const escapedValue = stringValue.replace(/"/g, '""');
            if (
              stringValue.includes(",") ||
              stringValue.includes('"') ||
              stringValue.includes("\n")
            ) {
              return `"${escapedValue}"`;
            }
            return escapedValue;
          })
          .join(",")
      );

      const csvContent = [headers, ...rows].join("\n");
      fs.writeFileSync(filepath, csvContent, "utf8");

      console.log(`📄 Exported ${leads.length} leads to ${filepath}`);
      return filepath;
    } catch (error) {
      console.error("❌ Export to CSV failed:", error);
      throw error;
    }
  }

  // Format data for export - includes GMB fields when available
  _formatExportData(leads) {
    return leads.map((lead) => {
      const baseData = {
        Name: lead.name || "",
        Title: lead.title || "",
        Company: lead.company || "",
        Email: lead.email || "",
        Phone: lead.phone || "",
      };

      // Add GMB-specific fields if present
      if (lead.source === 'Google My Business' || lead.address || lead.rating) {
        baseData.Address = lead.address || "";
        baseData.Rating = lead.rating || "";
        baseData.ReviewCount = lead.reviewCount || "";
        baseData.Category = lead.category || "";
        baseData.Website = lead.website || "";
        baseData.Hours = typeof lead.hours === 'object' ? JSON.stringify(lead.hours) : (lead.hours || "");
        baseData.Source = lead.source || "";
      }

      return baseData;
    });
  }

  // Main export method with format validation
  exportData(leads, filename, format = config.OUTPUT_FORMAT) {
    if (!leads || leads.length === 0) {
      throw new Error("No leads to export");
    }

    const timestamp = new Date().toISOString().split("T")[0];
    const filenameWithTimestamp = `${filename}_${timestamp}.${format}`;

    if (format === "xlsx") {
      return this.exportToExcel(leads, filenameWithTimestamp);
    } else if (format === "csv") {
      return this.exportToCSV(leads, filenameWithTimestamp);
    } else {
      throw new Error(`Unsupported format: ${format}`);
    }
  }

  // Get processing statistics
  getStats() {
    return {
      processed: this.processedCount,
      validation: this.validationStats,
      duplicates: this.duplicates.size,
      backupFile: this.backupFile,
    };
  }

  // Reset processor state
  reset() {
    this.processedCount = 0;
    this.validationStats = {
      valid: 0,
      invalid: 0,
      errors: {},
    };
    this.duplicates.clear();
    this.backupFile = null;
    console.log("🔄 DataProcessor reset");
  }
}

module.exports = DataProcessor;

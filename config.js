require("dotenv").config();

module.exports = {
	DELAY_BETWEEN_REQUESTS: 3000,
	MAX_RESULTS_PER_SEARCH: 30,
	HEADLESS_MODE: false,
	OUTPUT_FORMAT: "xlsx",
	OUTPUT_DIR: "./output",

	LLM: {
		PROVIDER: "gemini",
		MODEL: "gemini-2.0-flash",
		API_KEY: process.env.GEMINI_API_KEY,
		ENABLED: process.env.GEMINI_API_KEY ? true : false,
		MAX_TOKENS: 800,
		TEMPERATURE: 0.1,
		TIMEOUT:30000,
	},

	PLAYWRIGHT: {
		BROWSER: "chromium",
		HEADLESS: false,
		SLOW_MO: 100,
		DEVTOOLS: false,
		SCREENSHOT_ON_ERROR: true,
		VIDEO_ON_ERROR: false,
		TRACE_ON_ERROR: false,
		ARGS: [
			"--no-sandbox",
			"--disable-setuid-sandbox",
			"--disable-dev-shm-usage",
			"--disable-accelerated-2d-canvas",
			"--no-first-run",
			"--no-zygote",
			"--disable-gpu",
			"--disable-web-security",
			"--disable-features=VizDisplayCompositor",
		],
	},

	PERFORMANCE: {
		MAX_CONCURRENT_PAGES: 1,
		PAGE_TIMEOUT: 60000,
		NAVIGATION_TIMEOUT: 50000,
		WAIT_UNTIL: "networkidle",
		RETRY_ATTEMPTS: 3,
		RETRY_DELAY: 2000,
	},

	CAPTCHA: {
		MAX_WAIT_TIME: 600, // 10 minutes in seconds
		CHECK_INTERVAL: 5000, // 5 seconds between checks
		PROGRESS_UPDATE_INTERVAL: 30000, // 30 seconds between progress updates
		ENABLED: true,
	},

	HISTORY: {
		ENABLED: true,
		MAX_URLS_PER_KEYWORD: 1000, // Maximum URLs to keep in history per keyword
		MAX_AGE_DAYS: 30, // Maximum age of history entries in days
		AUTO_CLEANUP: true, // Automatically clean old entries
		SHOW_STATS: true, // Show history statistics at startup
	},

	DEPTH_SCRAPING: {
		ENABLED: true,
		DEFAULT_DEPTH: 1, // Default depth for child link scraping
		MAX_DEPTH: 3, // Maximum allowed depth
		MAX_CHILD_LINKS_PER_PAGE: 100, // Maximum child links to extract per page
		EXCLUDE_PATTERNS: [ // Patterns to exclude from child links
			"mailto:",
			"tel:",
			"javascript:",
			"#",
			".pdf",
			".jpg",
			".png",
			".gif",
			".css",
			".js",
			".xml",
			".zip",
			".rar",
			"facebook.com",
			"twitter.com",
			"instagram.com",
			"linkedin.com",
			"youtube.com",
			"google.com",
			"amazon.com",
			"wikipedia.org"
		],
		INCLUDE_PATTERNS: [ // Patterns to include for child links
			"/about",
			"/about-us",
			"/profile",
			"/contact",
			"/contact-us",
			"/services",
			"/products",
			"/team",
			"/company",
			"/blog",
			"/news",
			"/careers"
		],
		RESPECT_ROBOTS_TXT: false, // Whether to respect robots.txt
		DELAY_BETWEEN_CHILD_REQUESTS: 2000, // Delay between child link requests
	},

	STEALTH: {
		BLOCK_RESOURCES: ["image", "font", "media", "stylesheet"],
		BLOCK_DOMAINS: [
			"google-analytics.com",
			"googletagmanager.com",
			"facebook.com",
			"doubleclick.net",
			"googlesyndication.com",
			"googleadservices.com",
			"amazon-adsystem.com",
			"bing.com",
			"yandex.ru",
		],
		ENABLE_STEALTH_SCRIPTS: true,
		RANDOMIZE_VIEWPORT: true,
		RANDOMIZE_USER_AGENT: true,
	},

	// CAPTCHA_SOLVER: {
	// 	ENABLED: false,
	// 	API_KEY: process.env.CAPTCHA_API_KEY || "",
	// 	MAX_RETRIES: parseInt(process.env.CAPTCHA_SOLVER_MAX_RETRIES) || 3,
	// 	TIMEOUT: parseInt(process.env.CAPTCHA_SOLVER_TIMEOUT) || 120000,
	// 	RETRY_DELAY: parseInt(process.env.CAPTCHA_SOLVER_RETRY_DELAY) || 5000,
	// },

	PROXY: {
		ENABLED: false,
		API_KEY: "AIzaSyDQKWsna2FTgq8YZ9dZBXP6h2TCHtcUKX0" || "",
		MAX_RETRIES: parseInt(process.env.PROXY_MAX_RETRIES) || 3,
		TIMEOUT: parseInt(process.env.PROXY_TIMEOUT) || 50000,
	},

	KEYWORDS: [
		// "restaurants New York",
		// "plumber Miami",
		// "dentist Los Angeles",
		// "software company Austin",
		// "yoga studio Chicago",
		// "bakery Seattle",
		// "law firm Boston",
		// "startup London",
	],

	USER_AGENTS: [
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:119.0) Gecko/20100101 Firefox/119.0",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:119.0) Gecko/20100101 Firefox/119.0",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/119.0.0.0",
	],
};

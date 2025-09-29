const axios = require("axios");
require("dotenv").config();

class ProxyManager {
	constructor() {
		this.proxies = [];
		this.currentIndex = 0;
		this.lastFetchTime = 0;
		this.fetchInterval = 30 * 60 * 1000; // 30 minutes
		this.maxRetries = 3;
		this.testTimeout = 10000;
		this.maxProxies = 100; // Limit to prevent memory issues
	}

	async fetchFreeProxies() {
		try {
			console.log("🔄 Fetching fresh proxy list...");

			// Fetch from multiple free proxy sources
			const proxyPromises = [
				this.fetchFromProxyNova(),
				this.fetchFromFreeProxyList(),
				this.fetchFromProxyListDownload(),
				this.fetchFromProxyScrape(),
			];

			const results = await Promise.allSettled(proxyPromises);

			// Combine all successful results
			this.proxies = [];
			results.forEach((result) => {
				if (result.status === "fulfilled" && result.value) {
					this.proxies.push(...result.value);
				}
			});

			// Remove duplicates and filter valid proxies
			this.proxies = this.filterValidProxies(this.proxies);

			// Limit the number of proxies to prevent memory issues
			if (this.proxies.length > this.maxProxies) {
				this.proxies = this.proxies.slice(0, this.maxProxies);
				console.log(`⚠️ Limited to ${this.maxProxies} proxies for performance`);
			}

			console.log(`✅ Loaded ${this.proxies.length} potential proxies`);
			this.lastFetchTime = Date.now();

			return this.proxies.length > 0;
		} catch (error) {
			console.error("❌ Error fetching proxies:", error.message);
			return false;
		}
	}

	async fetchFromProxyNova() {
		try {
			const response = await axios.get(
				"https://www.proxynova.com/proxy-server-list/country-United-States/",
				{
					timeout: this.testTimeout,
					headers: {
						"User-Agent":
							"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
					},
				}
			);

			const proxies = [];
			const proxyRegex = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d+)/g;
			let match;

			while ((match = proxyRegex.exec(response.data)) !== null) {
				proxies.push({
					host: match[1],
					port: match[2],
					protocol: "http",
					source: "ProxyNova",
					addedAt: Date.now(),
				});
			}

			return proxies;
		} catch (error) {
			console.log("⚠️ Failed to fetch from ProxyNova:", error.message);
			return [];
		}
	}

	async fetchFromFreeProxyList() {
		try {
			const response = await axios.get("https://free-proxy-list.net/", {
				timeout: this.testTimeout,
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				},
			});

			const proxies = [];
			const proxyRegex = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d+)/g;
			let match;

			while ((match = proxyRegex.exec(response.data)) !== null) {
				proxies.push({
					host: match[1],
					port: match[2],
					protocol: "http",
					source: "FreeProxyList",
					addedAt: Date.now(),
				});
			}

			return proxies;
		} catch (error) {
			console.log("⚠️ Failed to fetch from FreeProxyList:", error.message);
			return [];
		}
	}

	async fetchFromProxyListDownload() {
		try {
			const response = await axios.get(
				"https://www.proxy-list.download/api/v1/get?type=http",
				{
					timeout: this.testTimeout,
				}
			);

			if (response.data && Array.isArray(response.data)) {
				return response.data.map((proxy) => ({
					host: proxy.split(":")[0],
					port: proxy.split(":")[1],
					protocol: "http",
					source: "ProxyListDownload",
					addedAt: Date.now(),
				}));
			}

			return [];
		} catch (error) {
			console.log("⚠️ Failed to fetch from ProxyListDownload:", error.message);
			return [];
		}
	}

	async fetchFromProxyScrape() {
		try {
			const response = await axios.get(
				"https://api.proxyscrape.com/v2/?request=get&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all",
				{
					timeout: this.testTimeout,
				}
			);

			if (response.data) {
				const lines = response.data.split("\n").filter((line) => line.trim());
				return lines.map((line) => {
					const [host, port] = line.split(":");
					return {
						host,
						port,
						protocol: "http",
						source: "ProxyScrape",
						addedAt: Date.now(),
					};
				});
			}

			return [];
		} catch (error) {
			console.log("⚠️ Failed to fetch from ProxyScrape:", error.message);
			return [];
		}
	}

	filterValidProxies(proxies) {
		return proxies.filter((proxy) => {
			// Basic validation
			if (!proxy.host || !proxy.port) return false;

			// Check if IP is valid
			const ipParts = proxy.host.split(".");
			if (ipParts.length !== 4) return false;

			const isValidIP = ipParts.every((part) => {
				const num = parseInt(part);
				return num >= 0 && num <= 255;
			});

			// Check if port is valid
			const portNum = parseInt(proxy.port);
			const isValidPort = portNum >= 1 && portNum <= 65535;

			// Check for private IP ranges
			const isPrivateIP =
				ipParts[0] === "10" ||
				(ipParts[0] === "172" &&
					parseInt(ipParts[1]) >= 16 &&
					parseInt(ipParts[1]) <= 31) ||
				(ipParts[0] === "192" && ipParts[1] === "168");

			return isValidIP && isValidPort && !isPrivateIP;
		});
	}

	async testProxy(proxy) {
		for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
			try {
				const testUrl = "http://httpbin.org/ip";
				const startTime = Date.now();

				const response = await axios.get(testUrl, {
					proxy: {
						host: proxy.host,
						port: proxy.port,
						protocol: proxy.protocol,
					},
					timeout: this.testTimeout,
					headers: {
						"User-Agent":
							"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
					},
				});

				if (response.status === 200) {
					const responseTime = Date.now() - startTime;
					proxy.lastTested = Date.now();
					proxy.isWorking = true;
					proxy.responseTime = responseTime;
					proxy.lastSuccess = Date.now();
					proxy.successCount = (proxy.successCount || 0) + 1;
					return true;
				}
			} catch (error) {
				if (attempt === this.maxRetries) {
					proxy.lastTested = Date.now();
					proxy.isWorking = false;
					proxy.lastError = error.message;
					proxy.failureCount = (proxy.failureCount || 0) + 1;
					proxy.lastFailure = Date.now();
				}
				// Wait before retry
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		}

		return false;
	}

	async getWorkingProxy() {
		// Check if we need to fetch new proxies
		if (
			this.proxies.length === 0 ||
			Date.now() - this.lastFetchTime > this.fetchInterval
		) {
			await this.fetchFreeProxies();
		}

		if (this.proxies.length === 0) {
			console.log("⚠️ No proxies available, using direct connection");
			return null;
		}

		// Get next working proxy in rotation
		let attempts = 0;
		const maxAttempts = this.proxies.length;

		while (attempts < maxAttempts) {
			const proxy = this.proxies[this.currentIndex];
			this.currentIndex = (this.currentIndex + 1) % this.proxies.length;

			if (proxy.isWorking) {
				console.log(
					`🔄 Using proxy: ${proxy.host}:${proxy.port} (${proxy.source})`
				);
				return proxy;
			}

			attempts++;
		}

		console.log("⚠️ No working proxies found, using direct connection");
		return null;
	}

	getProxyUrl(proxy) {
		if (!proxy) return null;
		return `${proxy.protocol}://${proxy.host}:${proxy.port}`;
	}

	// Get Playwright-compatible proxy configuration
	getPlaywrightProxyConfig(proxy) {
		if (!proxy) return null;

		return {
			server: `${proxy.protocol}://${proxy.host}:${proxy.port}`,
			// Add authentication if needed
			// username: proxy.username,
			// password: proxy.password,
		};
	}

	async testAllProxies() {
		console.log("🧪 Testing all proxies for speed and reliability...");

		// Test proxies in batches to avoid overwhelming the system
		const batchSize = 10;
		const workingProxies = [];

		for (let i = 0; i < this.proxies.length; i += batchSize) {
			const batch = this.proxies.slice(i, i + batchSize);
			console.log(
				`🧪 Testing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
					this.proxies.length / batchSize
				)}`
			);

			const testPromises = batch.map(async (proxy) => {
				const startTime = Date.now();
				const isWorking = await this.testProxy(proxy);
				const responseTime = Date.now() - startTime;

				if (isWorking) {
					proxy.responseTime = responseTime;
					workingProxies.push(proxy);
				}

				return {
					proxy,
					isWorking,
					responseTime,
				};
			});

			await Promise.allSettled(testPromises);

			// Small delay between batches
			if (i + batchSize < this.proxies.length) {
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		}

		// Sort by response time (fastest first)
		workingProxies.sort(
			(a, b) => (a.responseTime || 0) - (b.responseTime || 0)
		);

		// Update proxy list with only working ones
		this.proxies = workingProxies;

		console.log(`✅ Found ${this.proxies.length} working proxies`);
		return this.proxies.length;
	}

	// Get proxy statistics
	getStats() {
		const working = this.proxies.filter((p) => p.isWorking);
		const total = this.proxies.length;

		return {
			total,
			working: working.length,
			broken: total - working.length,
			lastFetch: this.lastFetchTime,
			nextFetch: this.lastFetchTime + this.fetchInterval,
			averageResponseTime:
				working.length > 0
					? working.reduce((sum, p) => sum + (p.responseTime || 0), 0) /
					  working.length
					: 0,
		};
	}

	// Force refresh proxies
	async forceRefresh() {
		console.log("🔄 Force refreshing proxy list...");
		this.lastFetchTime = 0;
		return await this.fetchFreeProxies();
	}

	// Clean up old proxies
	cleanupOldProxies(maxAge = 24 * 60 * 60 * 1000) {
		// 24 hours
		const now = Date.now();
		const initialCount = this.proxies.length;

		this.proxies = this.proxies.filter((proxy) => {
			const age = now - (proxy.addedAt || 0);
			return age < maxAge;
		});

		const removedCount = initialCount - this.proxies.length;
		if (removedCount > 0) {
			console.log(`🗑️ Cleaned up ${removedCount} old proxies`);
		}

		return removedCount;
	}

	// Get best proxy by performance
	getBestProxy() {
		if (this.proxies.length === 0) return null;

		const workingProxies = this.proxies.filter((p) => p.isWorking);
		if (workingProxies.length === 0) return null;

		// Sort by response time and success rate
		return workingProxies.sort((a, b) => {
			const aScore =
				(a.successCount || 0) /
				(a.failureCount || 1) /
				(a.responseTime || 1000);
			const bScore =
				(b.successCount || 0) /
				(b.failureCount || 1) /
				(b.responseTime || 1000);
			return bScore - aScore;
		})[0];
	}
}

module.exports = ProxyManager;

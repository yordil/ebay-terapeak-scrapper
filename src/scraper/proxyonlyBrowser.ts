import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import UserAgent from "user-agents";
import { ProxyInput } from "../types/interfaces";
import { KnownDevices } from "puppeteer";

const iPhone = KnownDevices["iPhone 6"];
puppeteer.use(StealthPlugin());



const launchUniqueBrowserWithProxy = async (proxy: ProxyInput) => {
	const isProxyActive = process.env.IS_PROXY_ACTIVE === "true";
	const args = [
		"--disable-blink-features=AutomationControlled",
		"--disable-webgl",
		"--disable-webrtc",
		"--disable-dev-shm-usage",
		"--no-sandbox",
		"--disable-setuid-sandbox",
		"--disable-background-timer-throttling",
		"--disable-backgrounding-occluded-windows",
		"--disable-renderer-backgrounding",
		"--window-size=1920,1080",
		
	];

	if (isProxyActive) {
		args.push("--proxy-server=" + proxy?.proxyURL);
	}

	const browser = await puppeteer.launch({
		headless: false,
		defaultViewport: null,
		args,
		timeout: 120000,
	});

	const page = await browser.newPage();

	if (isProxyActive) {
		// if your proxy requires authentication
		await page.authenticate({
			username: proxy.username,
			password: proxy.password,
		});
	}

	const agent = new UserAgent();
	await page.setUserAgent(agent.toString());


	return { browser, page };
};

export default launchUniqueBrowserWithProxy;

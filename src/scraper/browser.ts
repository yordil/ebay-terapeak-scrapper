import path from "path";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { ProxyInput, ProxySettings, Viewport } from "../types/interfaces";
import { GlobalConfig } from "../config/load-config";
import RecaptchaPlugin from "puppeteer-extra-plugin-recaptcha";
import Logger from "../utils/logger";


const logger = new Logger();

// Use Puppeteer Stealth plugin
puppeteer.use(StealthPlugin());
const launchUniqueBrowser = async (
	proxy: ProxySettings,
	userAgent: string,
	viewport: Viewport
) => {
	const pathTo2captcha = path.join(__dirname, "../2captcha");
	const browser = await puppeteer.launch({
		headless: false,
		timeout: 180000,
		args: [
			`--disable-extensions-except=${pathTo2captcha}`,
			`--load-extension=${pathTo2captcha}`,
			`--proxy-server=http://${proxy.host}:${proxy.port}`,
			`--window-size=${viewport.width},${viewport.height}`,
			"--disable-webgl",
			"--disable-webrtc",
			"--no-sandbox",
			"--disable-setuid-sandbox",
			"--enable-logging",
			"--v=1",
		],
	});

	const page = await browser.newPage();

	// Authenticate in proxy using basic browser auth
	await page.authenticate({
		username: proxy.userName,
		password: proxy.password,
	});

	// Set user agent and viewport
	await page.setUserAgent(userAgent);
	await page.setViewport(viewport);

	await page.setExtraHTTPHeaders({
		"accept-language": "en-US,en;q=0.9",
		"accept-encoding": "gzip, deflate, br",
	});

	// Mitigate canvas fingerprinting by overriding getContext
	// this is for preventing leaking my real IP address
	await page.evaluateOnNewDocument(() => {
		Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
			value: function (type: string) {
				return type === "2d"
					? null
					: this.__proto__.getContext.call(this, type);
			},
		});
	});

	// this is for changing browser fingerprints
	await page.evaluateOnNewDocument(() => {
		const getParameter = WebGLRenderingContext.prototype.getParameter;
		WebGLRenderingContext.prototype.getParameter = function (
			parameter: number
		) {
			if (parameter === 37445 || parameter === 37446) {
				return "Unknown";
			}
			return getParameter(parameter);
		};
	});

	// this is for changing browser fingerprints
	await page.evaluateOnNewDocument(() => {
		const getChannelData = AudioBuffer.prototype.getChannelData;
		AudioBuffer.prototype.getChannelData = function () {
			throw new Error("Invalid state error");
		};
	});
	logger.info("a new browser instance is loaded successfully");
	return { browser, page };
};


export default launchUniqueBrowser;
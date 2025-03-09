import * as cheerio from "cheerio";
import { Page } from "puppeteer";
import { delay, distributeKeyWordToUsers, saveData, withRetry } from "../utils/helpers";
import Logger from "../utils/logger";
import { CsvInputData, ProxyInput, UserDataWithCookies } from "../types/interfaces";
import launchUniqueBrowser from "./browser";
import LoadConfig from "../config/load-config";
import axios from "axios";
import pLimit from "p-limit";
import { ClientPageRoot } from "next/dist/client/components/client-page";
import launchUniqueBrowserWithProxy from "./proxyonlyBrowser";
const disableRedirection = "true";

const config = LoadConfig();
const logger = new Logger();

const SCRAPE_API_KEY = config.SERVER.SCRAPE_API_KEY;
// Function to extract item links from a given URL
export const itemLinkSelector = async (page: Page, url: string): Promise<[string[], number]> => {
	return withRetry(async () => {
		let pageCounter = 1;
		await page.goto(url, { waitUntil: "domcontentloaded", timeout: 800000 });

		// Wait for and click the switch button
		await page.waitForSelector(
			"input[aria-labelledby='category-selector-panel__right-switch-label'][type='checkbox'][role='switch'].switch__control",
			{ timeout: 80000 }
		);
		await page.$eval(
			'input[aria-labelledby="category-selector-panel__right-switch-label"][type="checkbox"][role="switch"].switch__control',
			(button) => (button as HTMLElement).click()
		);

		// Select 30 days option
		await delay(1000);
		await page.$eval(
			".search-panel .search-input-panel__date-dropdown .menu-button__button + span > div > div:nth-of-type(2)",
			(button) => (button as HTMLElement).click()
		);
		await delay(2000);

		// Click the research button
		await page.$eval(
			"div.search-input-panel > button.search-input-panel__research-button",
			(button) => (button as HTMLElement).click()
		);

		let links: string[] = [];
		while (true) {
			let retryAttempts = 0;
			let pageLoaded = false;
		
			// Retry loop for handling server errors
			while (retryAttempts < 3 && !pageLoaded) {
				try {
					// Wait for either the links to load or an error message to appear
					const result = await Promise.race([
						page.waitForSelector('a.research-table-row__link-row-anchor', { timeout: 120000 })
							.then((el) => ({ type: 'link', element: el })),
						page.waitForSelector('.page-notice__main h2', { timeout: 120000 })
							.then((el) => ({ type: 'error', element: el }))
					]);
		
					if (result.type === 'error') {
						const errorText = await page.evaluate(el => el ? el.textContent : '', result.element);
						try {
							if (errorText && errorText.includes("Our server")) {
								retryAttempts++;
								logger.warn(`"Our server failed to respond. Retrying... (${retryAttempts}/3)`);
								// Refresh the page
								await page.goto(page.url(), { waitUntil: "domcontentloaded", timeout: 40000 });
							} else {
								logger.error("Unexpected error encountered: ", errorText);
								return [links, pageCounter];
							}
						} catch (error) {
							logger.error("Error during retry attempt: ", error);
							return [links, pageCounter];
						}
					} else {
						// Links are present, proceed
						pageLoaded = true;
						retryAttempts = 0; // Reset retry attempts on success
					}
				} catch (error) {
					logger.error("Timeout waiting for elements to load.");
					return [links, pageCounter];
				}
			}
		
			if (retryAttempts >= 3) {
				logger.error("Failed to load page after 3 retries.");
				return [links, pageCounter];
			}
		
			// Additional delay to ensure page stability (if necessary)
			await delay(5000);
		
			// Extract links
			const html = await page.content();
			const $ = cheerio.load(html);
			$("a.research-table-row__link-row-anchor").each((_, element) => {
				const href = $(element).attr("href");
				if (href) links.push(href);
			});
		
			// Check if next button is disabled
			await page.waitForSelector("button.pagination__next", { visible: true });
			const isDisabled = await page.evaluate(() => {
				const btn = document.querySelector("button.pagination__next");
				return btn ? (btn as HTMLButtonElement).disabled || btn.getAttribute("aria-disabled") === "true" : true;
			});
		
			if (isDisabled) {
				logger.info("Next button is disabled. No more pages.");
				pageCounter = 0;
				return [links, pageCounter];
			} else {
				logger.info("Clicking the Next button to load the next page...");
				pageCounter++;
		
				try {
					await Promise.all([
						page.click("button.pagination__next"),
						page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 120000 })
					]);
				} catch (error) {
					logger.error("Navigation failed after clicking Next.");
					return [links, pageCounter];
				}
			}
		}
	});
};

// Function to extract specific item details from a list of item links
export const itemSpecificSelector = async (itemLink : string, itemSpecific: string) => {
		

		const encodedUrl = encodeURIComponent(itemLink);
		const scrapeUrl = `https://api.scrape.do?token=${SCRAPE_API_KEY}&url=${encodedUrl}`;
	
		try {
			const response = await axios.get(scrapeUrl , {timeout: 20000})
		
			const html = response.data;
			const $ = cheerio.load(html);
		
			let data: Record<string, string> = {};
			$("dl.ux-labels-values").each((_, element) => {
			  const key = $(element).find("dt .ux-textspans").first().text().trim();
			  const value = $(element).find("dd .ux-textspans").first().text().trim();
			  if (key && value !== "Not Specified" && value !== "Not Applicable") {
				data[key.toLowerCase()] = value;
			  }
			});
		
			const result = data[itemSpecific.toLowerCase()] || "Not found";
			if (result === "Not found") {
			  logger.error(`Item specific "${itemSpecific}" not found`);
			}
			logger.info(`Extracted Value for "${itemSpecific}":`, result);
		
			return { result, itemLink };
		  } catch (error : any) {
			if (error.response && error.response.status === 403) {
			  logger.error("Received 403 error, retrying after delay...");
			}
			await delay(5000);
			
			 
			throw new Error("Failed to extract item specific");
		  }
	};

// Function to generate TURL for a given keyword
export const turlGenerator = async (page: Page, baseTeraPick: string, keyword: string , cookies  : any) => {
		
	return withRetry(async () => {


		try {
			
			await page.goto(baseTeraPick, { waitUntil: "networkidle2", timeout: 120000 });

			// Check for daily limit message immediately after page load
			const dailyLimitSelector = '.alert.al-p1';
			const isDailyLimitExceeded = await page.evaluate((selector) => {
				const element = document.querySelector(selector);
				return element !== null && element.textContent?.includes('try again tomorrow.');
			}, dailyLimitSelector);

			if (isDailyLimitExceeded) {
				throw new Error("DAILY_LIMIT_EXCEEDED"); 
			}

			// Wait for and click the switch button
			await page.waitForSelector(
				"input[aria-labelledby='category-selector-panel__right-switch-label'][type='checkbox'][role='switch'].switch__control",
				{ timeout: 120000 }
			);
			await page.$eval(
				'input[aria-labelledby="category-selector-panel__right-switch-label"][type="checkbox"][role="switch"].switch__control',
				(button) => (button as HTMLElement).click()
			);

			// Wait for the research button to appear
			await page.waitForSelector("#s0-1-0-0-20-2-11-13-3-8-1-0-0-1-4-3-0-0-10-4-17-textbox");

			// Select 30 days option
			await delay(1000);
			await page.$eval(
				".search-panel .search-input-panel__date-dropdown .menu-button__button + span > div > div:nth-of-type(2)",
				(button) => (button as HTMLElement).click()
			);
			await delay(2000);

			// Clear and type the keyword
			await page.evaluate(() => {
				(document.querySelector("#s0-1-0-0-20-2-11-13-3-8-1-0-0-1-4-3-0-0-10-4-17-textbox") as HTMLInputElement).value = "";
			});
			await page.type("#s0-1-0-0-20-2-11-13-3-8-1-0-0-1-4-3-0-0-10-4-17-textbox", keyword);

			await delay(1000);
			await page.keyboard.press("Enter");

			try {
				// Wait for either navigation or error message
				await Promise.race([
					page.waitForNavigation({ waitUntil: "networkidle0", timeout: 60000 }),
					page.waitForSelector('.page-notice__main', { timeout: 60000 })
				]);

				let currentURL = page.url();
				
		
				if (currentURL.includes("chrome-error://chromewebdata/")) {
					throw new Error("Failed to get correct url due to Chrome error retrying...");
				}

				return { keyword: keyword, currentURL: currentURL };
			} catch (error) {
				// If timeout occurred but we have a valid URL, return
				throw new Error("Failed to generate TURL for keyword: " + keyword + " retrying ..."  );	
			}
		} catch (error: any) {
			if (error.message === "DAILY_LIMIT_EXCEEDED") {
				logger.error(`Daily limit exceeded while processing keyword "${keyword}"`);
				throw new Error ("Daily limit exceeded")
			}
			logger.error(`Error processing keyword "${keyword}":`, error.message);
			throw error;
		}
	});
};

const limit = pLimit(5); // Limit to 5 concurrent requests



export const extractItemSpecific = async (
	urls: string[],
	itemSpecific: string
  ): Promise<{ link: string; itemSpecific: string }[]> => {
	const results: { link: string; itemSpecific: string }[] = [];
	const failedUrls = new Set<string>();
	const batchSize = 5;
	const MAX_RETRIES = 3;
  
	// First pass: Process all URLs
	for (let i = 0; i < urls.length; i += batchSize) {
	  const batch = urls.slice(i, i + batchSize);
	  const batchPromises = batch.map(async (url) => {
		try {
		  const result = await limit(() => itemSpecificSelector(url, itemSpecific));
		  return { link: result.itemLink, itemSpecific: result.result };
		} catch (error) {
		  failedUrls.add(url);
		  logger.error(`Failed to process URL: ${url}`);
		  return { link: url, itemSpecific: "Not found" };
		}
	  });
  
	  const batchResults = await Promise.all(batchPromises);
	  results.push(...batchResults);
  
	  if (i + batchSize < urls.length) {
		await delay(1000);
	  }
	}
  
	// Retry mechanism for failed URLs
	let attempt = 1;
	while (failedUrls.size > 0 && attempt <= MAX_RETRIES) {
	  logger.info(`Retrying ${failedUrls.size} failed URLs (Attempt ${attempt})...`);
	  const failedUrlsArray = Array.from(failedUrls);
	  failedUrls.clear();
  
	  for (let i = 0; i < failedUrlsArray.length; i += batchSize) {
		const batch = failedUrlsArray.slice(i, i + batchSize);
		const batchPromises = batch.map(async (url) => {
		  try {
			const result = await limit(() => itemSpecificSelector(url, itemSpecific));
			// Update the result in the results array
			const index = results.findIndex(r => r.link === url);
			if (index !== -1) {
			  results[index] = { link: result.itemLink, itemSpecific: result.result };
			}
		  } catch (error) {
			failedUrls.add(url);
			logger.error(`Retry attempt ${attempt} failed for URL: ${url}`);
		  }
		});
  
		await Promise.all(batchPromises);
		await delay(2000);
	  }
	  attempt++;
	}
  
	if (failedUrls.size > 0) {
	  logger.error(`${failedUrls.size} URLs failed after ${MAX_RETRIES} retries.`);
	} else {
	  logger.info('All URLs processed successfully');
	}
  
	return results;
  };

// Function to process TURL generation for a specific user
export const processTurlGenerationForUser = async (
	user: UserDataWithCookies,
	keywords: {  
		enTranslation: string;
		jpKeyword: string;
		originalIndex: number;
		link: string; }[], // Accept objects with indexes
	baseTeraPick: string,
	onResultProcessed?: (result: { 
		enTranslation: string;
		jpKeyword: string;
		originalIndex: number;
		currentURL: string;
		ebayPage: string;
	}) => Promise<void>
) => {
	const { proxy, userAgent, viewport } = user;
	const cookies = user.cookies;
	const DLAY_BETWEEN_REQUESTS = config.SERVER.DELAY_BETWEEN_REQUEST;
	let browser: any;
	const results: Array<{ enTranslation: string;
		jpKeyword: string; originalIndex: number; currentURL: string ; 	ebayPage : string }> = [];
	const failedKeywords: Array<{ 
		enTranslation: string;
		jpKeyword: string;
		originalIndex: number;
		link: string; }> = [];
	const failedUsers: string[] = [];

	try {
		// Launch the browser and set cookies
		({ browser } = await launchUniqueBrowser(proxy, userAgent, viewport));
		await browser.setCookie(...cookies);
		


		// Open multiple pages concurrently
		const pages: any[] = await Promise.all(
			Array.from({ length: config.SERVER.MAX_CONCURRENT_PAGES }, async () => {
				const page = await browser.newPage();
				await page.authenticate({ username: proxy.userName, password: proxy.password });
				
				return page;
			})
		);

		// Clone the keywords array into a shared task queue
		const tasks = [...keywords];

		// Retry-wrapped function that uses the given page
		const processKeywordWithRetry = async (page: any, keywordObj: { 
			enTranslation: string;
			jpKeyword: string;
			originalIndex: number;
			link: string;
		}) => {
			return withRetry(async () => {
				try {
					const result = await turlGenerator(page, baseTeraPick, keywordObj.enTranslation , cookies);
					if (result) {
						const processedResult = {
							enTranslation: keywordObj.enTranslation,
							jpKeyword: keywordObj.jpKeyword,
							originalIndex: keywordObj.originalIndex,
							currentURL: result.currentURL,
							ebayPage: keywordObj.link
						};
						results.push(processedResult);
						return processedResult; // Return the result for immediate saving
					}
				} catch (error :any) {
					if (error.message.includes("DAILY_LIMIT_EXCEEDED")){
						throw new Error ("Daily limit exceeded")
					}
					logger.error(`Error generating URL for keyword: ${keywordObj.enTranslation} (Index: ${keywordObj.originalIndex}), User: ${user.eBay.userName}`);
					failedKeywords.push(keywordObj);
					throw error;
				}
			});
		};	

		// Worker function: Each page processes keywords until none remain
		async function worker(page: any) {
			let length = tasks.length
			while (length) {
				const keywordObj = tasks.shift();
				length -=1
				if (!keywordObj) break;
				try {
					const result = await processKeywordWithRetry(page, keywordObj);
					if (result) {
						if (onResultProcessed) {
							await onResultProcessed(result);
						}
					logger.info(`Processed keyword "${result.enTranslation}" waiting before next request...`);
					await(delay(DLAY_BETWEEN_REQUESTS));
				
					
					}
				} catch (error: any) {
					
					if (error.message.includes("DAILY_LIMIT_EXCEEDED")) {
						// Add all remaining tasks back to failedKeywords
						logger.info(`Adding remaining keywords to failed list due to daily limit`);
						failedKeywords.push(keywordObj, ...tasks);
						failedUsers.push(user.eBay.userName);
						length = 0;
						break;
					}
					failedKeywords.push(keywordObj);
					
				}
			}
		}

		// Run workers concurrently on all pages
		await Promise.all(pages.map((page) => worker(page)));

		// close all pages
		await Promise.all(pages.map((page) => page.close()));
	} catch (error) {
		logger.error(`Error for user ${user.eBay.userName}:`, error);
		failedKeywords.push(...keywords.map(keywordObj => ({ ...keywordObj})));
	} finally {
		if (browser) {
			await browser.close();
		}
	}

	return {
		username: user.eBay.userName,
		results,
		failedKeywords,
		failedUsers,
	};
};

// Function to retry failed TURL generation
export const retryFailedTURLGeneration = async (
		users: UserDataWithCookies[],
		failedKeywords: { 
			enTranslation: string;
			jpKeyword: string;
			originalIndex: number;
			link: string; 
		}[],
		failedUsers: string[],
		baseURL: string,
		filePath: string,
		outputDataMap: Map<number, CsvInputData>,
		keywordOriginalIndexPair : Map<string, number>,
		attempt: number = 1,
	) => {
		if (failedKeywords.length === 0) {
			logger.info("No failed keywords to retry.");
			return;
		}

		logger.info(`Retrying ${failedKeywords.length} failed keywords...`);

		if (attempt > 3) {
			logger.error("Max retry attempts reached. Stopping further retries.");
			logger.error(`Unresolved failed keywords: ${failedKeywords.length}`);
			return;
		}

		logger.info(`Retry attempt ${attempt} started with ${failedKeywords.length} failed keywords.`);

		const workingUsers = users.filter((user) => !failedUsers.includes(user.eBay.userName));

		if (workingUsers.length === 0) {
			logger.error("No working users available for retry.");
			return;
		}

		const retryAssignments = distributeKeyWordToUsers(workingUsers, failedKeywords);
		
		let remainingFailedKeywords: typeof failedKeywords = [];
		let newFailedUsers: string[] = [];

		const retryPromises = retryAssignments.map(async ({ user, data }) => {
			try {
				const { results, failedKeywords: newFailedKeywords, failedUsers: newUserFailures } = 
					await processTurlGenerationForUser(user, data, baseURL , async (result) => {
						// check if originalIndex is already present in the outputDataMap
					const originalIndex = keywordOriginalIndexPair.get(result.enTranslation);
			
							if (originalIndex !== undefined) {
								outputDataMap.set(originalIndex, {
								Identity: result.enTranslation,
								"JP Keyword": result.jpKeyword,
								TURL: result.currentURL,
								MURL: "", 
								YURL: "", 
								"eBay Page": result.ebayPage
								});
							} else {
								logger.error(`Original index not found for ${result.enTranslation}`);
							}
							
							// Convert Map to array before saving
							const outputData = Array.from(outputDataMap.values());
							try {
								saveData(filePath, outputData);
								logger.info(`Saved result for ${result.enTranslation}`);
							} catch (saveError) {
								logger.error(`Failed to save data: ${saveError}`);
							}
					});

				remainingFailedKeywords.push(...newFailedKeywords);
				newFailedUsers.push(...newUserFailures);
			} catch (error) {
				logger.error(`Retry failed for ${user.eBay.userName}:`, error);
				remainingFailedKeywords.push(...data);
				newFailedUsers.push(user.eBay.userName);
			}
		});

		await Promise.all(retryPromises);

		if (remainingFailedKeywords.length > 0 && attempt < 3) {
			await retryFailedTURLGeneration(
				workingUsers,
				remainingFailedKeywords,
				newFailedUsers,
				baseURL,
				filePath,
				outputDataMap,
				keywordOriginalIndexPair,
				attempt + 1
			);
		} else if (remainingFailedKeywords.length > 0) {
			logger.error(`Failed to process ${remainingFailedKeywords.length} keywords after all retries`);
		}
};
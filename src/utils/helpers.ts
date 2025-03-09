import * as fs from "fs";
import * as fastcsv from "fast-csv";
import { parse, writeToPath } from "fast-csv";
import {
	UserData,
	UserAssignment,
	CsvInputData,
	successfulCookies,
	UserDataWithCookies,
	UserAssignmentForTURL,
	ProxyInput,
} from "../types/interfaces";
import { Page } from "puppeteer";
import path from "path";
import Papa from "papaparse";
import launchUniqueBrowser from "../scraper/browser";
import Logger from "../utils/logger";

const logger = new Logger();

// Load JSON data from a file
export const loadUserJsonData = async (
	filePath: string
): Promise<UserData[]> => {
	const result = new Promise((resolve, reject) => {
		fs.readFile(filePath, "utf8", (err, data) => {
			if (err) {
				reject("Error reading the file: " + err);
				return;
			}

			try {
				const proxies = JSON.parse(data);
				resolve(proxies);
			} catch (parseError) {
				reject("Error parsing JSON: " + parseError);
			}
		});
	}) as unknown as UserData[];
	return result;
};

export const formatCurrentDate = (): string => {
	const date = new Date();

	// Set options for Japanese timezone (JST) with full weekday name
	const options: Intl.DateTimeFormatOptions = {
		year: "numeric", // 2024
		month: "numeric", // 11
		day: "numeric", // 7
		hour: "numeric", // '9'
		minute: "numeric", // '00'
		second: "numeric",
		hour12: true, // 12-hour format
		timeZone: "Asia/Tokyo", // Set timezone to Asia/Tokyo (JST)
	};

	// Format the date string
	const formattedDate =
		date.toLocaleString("en-US", options).toUpperCase() + " JST"; // Append 'JST'

	// Replace spaces and colons for a valid filename
	return formattedDate
		.replace(/[: ]/g, "-")
		.replace(/[/]/g, "-")
		.replace(/[,]/g, "");
};

export const saveInputFileLocally = async (): Promise<string> => {
	const fileName = `input_${formatCurrentDate()}.csv`;
	const filePath = path.join(process.cwd(), fileName);

	const initialData = "Identity,JP Keyword,TURL,MURL,YURL\n";

	try {
		await fs.promises.writeFile(filePath, initialData, "utf-8");
		logger.info(`File created successfully at ${filePath}`);
		return filePath;
	} catch (error) {
		logger.error("Error creating file:", error);
		return "";
	}
};

/**
 * Reads a file and returns an array of lines without '\r' characters.
 * @param filePath - The path to the file to read.
 * @returns An array of lines without '\r' characters.
 */
export const readFile = (filePath: string): string[] => {
	try {
		const data = fs.readFileSync(filePath, "utf-8");
		return data.split("\n").map((line) => line.replace("\r", ""));
	} catch (error) {
		logger.error("Error reading file:", error);
		return [];
	}
};

export const saveData = (filePath: string, data: CsvInputData[]) => {
	try {
		// Filter out empty or invalid entries
		const filteredData = data.filter(
			(item) => item && Object.keys(item).length > 0
		);

		// Check if there is valid data to save
		if (filteredData.length === 0) {
			logger.error(
				`Error: No valid data to save to ${filePath}. The data is empty or invalid.`
			);
			return;
		}

		// Convert to CSV format using PapaParse
		const finalData = Papa.unparse(filteredData);
		fs.writeFileSync(filePath, finalData);
		logger.info(`Saved data to: ${filePath}`);
	} catch (err) {
		logger.info("Data is", data); // Log data for debugging purposes
		logger.error(`Error saving data to: ${filePath}`, err);
	}
};

// export const saveData = (filePath: string, data: CsvInputData[]) => {
// 	try {
// 	  const filteredData = data.filter(
// 		(item) => item && Object.keys(item).length > 0
// 	  );
  
// 	  if (filteredData.length === 0) {
// 		logger.error(`No valid data to save to ${filePath}`);
// 		return;
// 	  }
  
// 	  let existingData: CsvInputData[] = [];
// 	  if (fs.existsSync(filePath)) {
// 		const fileContent = fs.readFileSync(filePath, "utf-8");
// 		existingData = Papa.parse<CsvInputData>(fileContent, { header: true }).data;
// 	  }
  
// 	  // Filter out entries that already exist
// 	  const newData = filteredData.filter(
// 		(item) => !existingData.some((existing) => existing.Identity === item.Identity)
// 	  );
  
// 	  if (newData.length === 0) {
// 		logger.info("No new data to append.");
// 		return;
// 	  }
  
// 	  const newCsvData = Papa.unparse(newData, { header: false }) + "\n";
// 	  fs.appendFileSync(filePath, newCsvData);
// 	  logger.info(`Appended ${newData.length} new records to ${filePath}`);
// 	} catch (err) {
// 	  logger.error(`Error saving data to: ${filePath}`, err);
// 	}
//   };

export async function withRetry<T>(
	fn: () => Promise<T>,
	retries: number = 2,
	delayMs: number = 20000
): Promise<T> {
	let attempt = 0;
	while (attempt < retries) {
		try {
			return await fn();
		} catch (error: any) {
			// Don't retry if it's a daily limit error
			if (error.message.includes("Daily limit exceeded")) {
				throw new Error("DAILY_LIMIT_EXCEEDED error detected saving to failedKeyword ..."); // Immediately propagate daily limit errors
			}

			attempt++;
			if (error.message.includes("selector")) {
				logger.error("Selector not found Retrying...");
			} else if (error.message.includes("timeout")) {
				logger.error("Timeout error  Retrying...");
			} else if (error.message.includes("net")) {
				logger.error("Network error Retrying..." , error.message);

			} else if (error.message.includes("403")) {
				logger.error("Received 403 error, waiting before retrying...");
			} else {
				logger.error("Error extracting data from URL:", error.message);
			}

			if (attempt >= retries)
				throw new Error(`Function failed after ${retries} attempts.`);

			await delay(delayMs)
		}
	}
	logger.error("Unexpected error in retry mechanism");
	throw new Error("Unexpected error in retry mechanism");
}

export const modifyTurl = (baseUrl: string, pageCounter: number): string => {
	const offset = (pageCounter - 1) * 50; // Calculate offset dynamically
	const limit = 50; // Fixed limit per page

	// Replace offset and limit in the URL
	const updatedUrl = baseUrl
		.replace(/offset=\d+/, `offset=${offset}`)
		.replace(/limit=\d+/, `limit=${limit}`);

	logger.info(`Modified URL for Page ${pageCounter}:`, updatedUrl);
	return updatedUrl;
};

export const checkCookieFiles = async (
	userDataList: UserData[],
	turl: string
): Promise<successfulCookies[]> => {
	const cookieDir = path.join(process.cwd() , "cookie");
	// const cookieDir = path.join(process.cwd(),  "cookie");

	// Get all JSON files in the cookie directory
	const cookieFiles = fs
		.readdirSync(cookieDir)
		.filter((file) => file.endsWith(".json"));

	if (cookieFiles.length === 0) {
		logger.info("No cookie files found.");
		process.exit(1);
	}

	const MAX_RETRIES = 3;
	const RETRY_DELAY = (attempt: number) => 2000 * attempt; // Exponential backoff
	const CONCURRENCY_LIMIT = 5; // Process 5 users at a time

	// Function to process a single user
	const processUser = async (
		userData: UserData
	): Promise<successfulCookies | null> => {
		const { eBay, proxy, userAgent, viewport } = userData;
		const cookieFile = cookieFiles.find((file) => file.includes(eBay.userName));
	
		if (!cookieFile) {
			logger.info(`No cookie found for user: ${eBay.userName}`);
			return null;
		}
	
		let attempt = 0;
		while (attempt < MAX_RETRIES) {
			const { browser, page } = await launchUniqueBrowser(proxy, userAgent, viewport);
	
			try {
				// Read and set cookies
				const cookiePath = path.join(cookieDir, cookieFile);
				const cookies = JSON.parse(fs.readFileSync(cookiePath, "utf-8"));
				await browser.setCookie(...cookies);
	
				logger.info(`Testing cookie for user: ${eBay.userName} (Attempt ${attempt + 1})`);
	
				// Navigate to target page
				await page.goto(turl, { waitUntil: "domcontentloaded", timeout: 120000 });
	
				// Wait for login success confirmation
				await page.waitForSelector(".search-input-panel__research-button", { timeout: 30000 });
				logger.info(`Logged in successfully for user: ${eBay.userName}`);
	
				await browser.close();
				return { userName: eBay.userName, cookies };
			} catch (error: any) {
				logger.error(`Attempt ${attempt + 1} failed for user: ${eBay.userName} - Error: ${error.message}`);
	
				await browser.close(); // Ensure browser is closed before retrying
				attempt++;
	
				// Check if we should retry
				if (attempt < MAX_RETRIES ) {
					logger.info(`Retrying user ${eBay.userName} in ${RETRY_DELAY(attempt)}ms`);
					await delay(RETRY_DELAY(attempt)); // Use the exponential backoff function
					continue; // Retry the loop
				}
	
				// If max retries reached or non-retryable error
				if (attempt >= MAX_RETRIES) {
					logger.error(`Max retries reached for user: ${eBay.userName}`);
				}
				return null;
			}
		}
		return null;
	};
	

	// Function to process users in chunks of 5
	const processUsersInChunks = async (
		users: UserData[],
		chunkSize: number
	): Promise<successfulCookies[]> => {
		const successfulCookies: successfulCookies[] = [];

		for (let i = 0; i < users.length; i += chunkSize) {
			const chunk = users.slice(i, i + chunkSize);

			// Process the chunk in parallel
			const results = await Promise.all(
				chunk.map(async (userData) => {
					return await processUser(userData);
				})
			);

			// Filter out null results (failed attempts) and add to successfulCookies
			successfulCookies.push(
				...results.filter(
					(result): result is successfulCookies => result !== null
				)
			);
		}

		return successfulCookies;
	};

	// Process all users in chunks of 5
	return await processUsersInChunks(userDataList, CONCURRENCY_LIMIT);
};

export const mergeUserDataWithCookies = (
	successfulUsers: successfulCookies[],
	userProfiles: UserData[]
): UserDataWithCookies[] =>
	successfulUsers
		.map(({ userName, cookies }) => {
			const userData = userProfiles.find(
				(profile) => profile.eBay.userName === userName
			);
			return userData ? { ...userData, cookies } : null;
		})
		.filter((userData): userData is UserDataWithCookies => userData !== null);

export const distributeLinksToUsers = (
	users: UserDataWithCookies[],
	allItemLinkandKeyWords: string[]
): UserAssignment[] => {
	const totalUsers = users.length;
	const totalItems = allItemLinkandKeyWords.length;

	if (totalUsers === 0) {
		throw new Error("No users available for processing.");
	}

	if (totalItems === 0) {
		throw new Error("No items to process.");
	}

	// Base distribution
	const baseItemsPerUser = Math.floor(totalItems / totalUsers);
	const extraItems = totalItems % totalUsers;

	// Assign items fairly
	const userAssignments: UserAssignment[] = users.map((user, index) => ({
		user,
		data: allItemLinkandKeyWords.slice(
			index * baseItemsPerUser + Math.min(index, extraItems),
			(index + 1) * baseItemsPerUser + Math.min(index + 1, extraItems)
		),
	}));

	return userAssignments;
};

export const extractKeywordsFromFile = (filePath: string): string[] => {
	// Read the contents of the file
	const fileContent = fs.readFileSync(filePath, "utf-8");

	// Split the content into lines
	const lines = fileContent.split("\n");

	// Array to store valid keywords
	let validKeywords: string[] = [];

	// Process each line
	lines.forEach((line) => {
		// Split each line into URL and keyword part
		const [url, keyword] = line.split(": ");

		// Skip lines that have "Not found" or are empty
		if (keyword && !keyword.includes("Not found")) {
			// Extract just the first word (e.g., "Sony" from "Sony NW-A55")
			// const extractedKeyword = keyword.split(" ")[0];
			validKeywords.push(keyword);
		}
	});

	return validKeywords;
};

export const distributeKeyWordToUsers = (
    users: UserDataWithCookies[],
    allItemLinkandKeyWords: { link: string;
		jpKeyword: string;
		enTranslation: string}[]
): UserAssignmentForTURL[] => {
    const totalUsers = users.length;
    const totalItems = allItemLinkandKeyWords.length;

    if (totalUsers === 0) throw new Error("No users available for processing.");
    if (totalItems === 0) throw new Error("No items to process.");

    const baseItemsPerUser = Math.floor(totalItems / totalUsers);
    const extraItems = totalItems % totalUsers;

    return users.map((user, index) => {
        const start = index * baseItemsPerUser + Math.min(index, extraItems);
        const end = (index + 1) * baseItemsPerUser + Math.min(index + 1, extraItems);

        return {
            user,
            data: allItemLinkandKeyWords
                .slice(start, end)
                .map((keywordObj, relativeIndex) => ({
					originalIndex: start + relativeIndex,
					link: keywordObj.link,
					jpKeyword: keywordObj.jpKeyword,
					enTranslation: keywordObj.enTranslation,
                })),
        };
    });
};

//

// Function to generate a specific delay
export const delay = (time: number): Promise<void> => {
	return new Promise<void>((resolve) => {
		setTimeout(resolve, time);
	});
};

// Function to generate a random delay between 1 and 5 seconds
export const randomDelay = (): Promise<void> => {
	return new Promise<void>((resolve) => {
		const time = Math.floor(Math.random() * (5000 - 1000 + 1)) + 1000; // for regular use
		// const time = Math.floor(10000000); // for sing up
		setTimeout(resolve, time);
	});
};

// Utility function to check if specific text is present on the page
export const isTextVisible = async (page: Page, text: string) => {
	return await page.evaluate((t) => {
		return document.body.innerText.includes(t);
	}, text);
};

export function millisToMinutesAndSeconds(millis: number) {
	var minutes = Math.floor(millis / 60000);
	var seconds = (millis % 60000) / 1000;
	return seconds == 60
		? minutes + 1 + ":00"
		: minutes + ":" + (seconds < 10 ? "0" : "") + seconds.toFixed(0);
}

export const readProxiesJson = (filePath: string): ProxyInput[] => {
	const result = new Promise((resolve, reject) => {
		fs.readFile(filePath, "utf8", (err, data) => {
			if (err) {
				reject("Error reading the file: " + err);
				return;
			}

			try {
				const proxies = JSON.parse(data);
				resolve(proxies);
			} catch (parseError) {
				reject("Error parsing JSON: " + parseError);
			}
		});
	}) as unknown as ProxyInput[];
	return result;
};



// export const yahooAuctionSearch = async (keywordIndexMap: Record<string, number> , baseYurl : string) => {
	

//     const {browser , page} = await launchBrowserWithOutCookie(proxy, userAgent, viewport);
//     const pagePool = await Promise.all(Array.from({ length: 4 }, () => browser.newPage())); // 4 tabs
//     const results: Record<number, string> = {}; // Store results with indexes
//     const keywords = Object.keys(keywordIndexMap);

//     await Promise.all(keywords.map(async (keyword, i) => {
//         const page = pagePool[i % 4]; // Assign page round-robin
//         const index = keywordIndexMap[keyword];

//         results[index] = await withRetry(async () => {
//             await page.goto(baseYurl, { waitUntil: "networkidle2", timeout: 30000 });
//             await page.waitForSelector("#yschsp", { visible: true, timeout: 10000 });

//             await page.evaluate((keyword) => {
//                 const inputField = document.querySelector("#yschsp") as HTMLInputElement;
//                 if (inputField) inputField.value = `${keyword} ${inputField.value}`;
//             }, keyword);

//             await page.focus("#yschsp");
//             await page.keyboard.press("Enter");

//             await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 });
//             return page.url();
//         });

//     }));

//     await browser.close();
//     return results;
// };

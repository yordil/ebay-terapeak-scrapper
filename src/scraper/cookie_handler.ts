import path from "path";
import fs from "fs";
import eBayLogin from "../auth/login";
import { UserData } from "../types/interfaces";
import { checkCookieFiles, loadUserJsonData } from "../utils/helpers";
import Logger from "../utils/logger";
import launchUniqueBrowser from "./browser";
import { Page } from "puppeteer";

const logger = new Logger();

// constant url that we use to check the cookie
const turl = "https://www.ebay.com/sh/research?marketplace=EBAY-US&keywords=%28-abcd%29&dayRange=30&endDate=1736074851886&startDate=1733482851886&categoryId=293&conditionId=3000&format=FIXED_PRICE&minPrice=100&maxPrice=200&sellerCountry=SellerLocation%3A%3A%3AJP&offset=0&limit=50&tabName=SOLD&tz=Asia%2FTokyo";


export const updateCookie = async () => {
    const profiles: UserData[] = await loadUserJsonData("users.json");
  
    for (let i = 0; i < profiles.length; i++) {
      const profile = profiles[i];
  
      try {
        const { browser, page } = await launchUniqueBrowser(
          profile.proxy,
          profile.userAgent,
          profile.viewport
        );
  
        logger.info(
          "Current User:",
          profile.eBay.userName,
          "| Password:",
          profile.eBay.password
        );
  
        const TURL =
          "https://www.ebay.com/sh/research?marketplace=EBAY-US&keywords=%28-abcd%29&dayRange=30&endDate=1736074851886&startDate=1733482851886&categoryId=293&conditionId=3000&format=FIXED_PRICE&minPrice=100&maxPrice=200&sellerCountry=SellerLocation%3A%3A%3AJP&offset=0&limit=50&tabName=SOLD&tz=Asia%2FTokyo";
  
        const { success, cookie, error } = await eBayLogin(page, profile, TURL);
  
        if (!success) {
          logger.error(`Failed to login for ${profile.eBay.userName}`);
          continue;
        }
  
        logger.info("Logged in successfully!");
  
        logger.info(` Processing ${profile.eBay.userName}...`);
        await saveCookies(page, profile.eBay.userName);
      } catch (error) {
        logger.error(`Error processing ${profile.eBay.userName}:`);
      }
      logger.info(`User ${profile.eBay.userName} processed successfully`);
    }
  
    // now check saved cooki files
    const response = await checkCookie();
  
    return response;
  };
  
  export const checkCookie = async () => {
    let userProfiles: UserData[] = [];
    const userFilePath = path.join(process.cwd(), "users.json");
    let retryCount = 0;
    const maxRetries = 3;
  
    while (retryCount < maxRetries) {
      try {
        userProfiles = await loadUserJsonData(userFilePath);
        const successfulUser = await checkCookieFiles(userProfiles, turl);
  
        // Return success with the count of users who are working on the task
        return { status: "success", activeUsers: successfulUser.length };
      } catch (error: any) {
        // Handle the error here (log it, notify user, etc.)
        logger.error(
          "An error occurred during check cookie endpoint /api/check-cookie:",
          error.message
        );
        retryCount++;
      }
    }
  
    // Return error if maximum retries exceeded
    return { status: "error", message: "Maximum number of retries reached" };
  };
  
  async function saveCookies(page: Page, username: string) {
    const cookies = await page.cookies();
    const cookieDir = path.join(process.cwd(), "cookie");
    if (!fs.existsSync(cookieDir)) {
      fs.mkdirSync(cookieDir);
    }
    const filePath = path.join(cookieDir, `cookie_ebay.${username}.json`);
    fs.writeFileSync(filePath, JSON.stringify(cookies, null, 2));
    logger.info(`Saved cookies for ${username} at ${filePath}`);
  }
  
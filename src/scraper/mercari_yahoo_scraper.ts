import { withRetry } from "../utils/helpers";
import launchBrowserWithProxy from "./proxyonlyBrowser";
import { ProxyInput } from '../types/interfaces';

import Logger from "../utils/logger";
import LoadConfig from "../config/load-config";

const config = LoadConfig();
const logger = new Logger();

/**
 * Perform a search on Mercari with the given keywords and proxy.
 * @param baseMercariUrl - The base URL for Mercari search.
 * @param proxy - Proxy configuration.
 * @param keywords - List of keywords to search.
 * @param failedIndices - Set to track failed keyword indices.
 * @returns Search results.
 */
export const mercariSearch = async (
  baseMercariUrl: string,
  proxy: ProxyInput,
  keywords: { keyword: string; originalIndex: number }[],
  failedIndices: Set<number>
) => {
  const results: { keyword: string; originalIndex: number; searchUrl: string }[] = [];
  let browser: any;

  try {
    ({ browser } = await launchBrowserWithProxy(proxy));
    const pages: any[] = await Promise.all(
      Array.from({ length: config.SERVER.YM_CONCURRENT_PAGES }, async () => await browser.newPage())
    );
  
    const tasks = [...keywords];

    const processKeyword = async (page: any, keywordObj: { keyword: string; originalIndex: number }) => {
      try {
        logger.info(`Processing Mercari keyword: "${keywordObj.keyword}"`);

        await page.goto(baseMercariUrl, { waitUntil: "networkidle2", timeout: 60000 });
        await page.waitForSelector("input.sc-f808c747-2.fMmsZy", { visible: true, timeout: 30000 });
        await page.type("input.sc-f808c747-2.fMmsZy", keywordObj.keyword);
        await page.keyboard.press("Enter");
        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 });

        const searchUrl = page.url();


        if (searchUrl.includes("chrome-error://chromewebdata/")) {
          throw new Error("Failed to get correct url due to Chrome error retrying...");
        }

        results.push({
          keyword: keywordObj.keyword,
          originalIndex: keywordObj.originalIndex,
          searchUrl,
        });
      } catch (error) {
        logger.error(`Error processing Mercari keyword "${keywordObj.keyword}":`, error);
        failedIndices.add(keywordObj.originalIndex);
      }
    };

    async function worker(page: any) {
      while (tasks.length) {
        const keywordObj = tasks.shift();
        if (!keywordObj) break;
        try {
          await processKeyword(page, keywordObj);
        } catch (e) {
          logger.error(`Error processing Mercari keyword "${keywordObj.keyword}"`);
        }
      }
    }

    await Promise.all(pages.map((page) => worker(page)));
    await Promise.all(pages.map((page) => page.close()));
  } catch (error) {
    logger.error("Error during Mercari search:", error);
    keywords.forEach(({ originalIndex }) => failedIndices.add(originalIndex));
  } finally {
    if (browser) await browser.close();
  }

  return { results };
};

/**
 * Perform a search on Yahoo with the given keywords and proxy.
 * @param baseYurl - The base URL for Yahoo search.
 * @param proxy - Proxy configuration.
 * @param keywords - List of keywords to search.
 * @param failedIndices - Set to track failed keyword indices.
 * @returns Search results.
 */
export const yahooSearch = async (
  baseYurl: string,
  proxy: ProxyInput,
  keywords: { keyword: string; originalIndex: number }[], 
  failedIndexes: Set<number>
) => {
  const results: { keyword: string; originalIndex: number; searchUrl: string }[] = [];
  let browser: any;

  try {
    ({ browser } = await launchBrowserWithProxy(proxy));
    const pages: any[] = await Promise.all(
      Array.from({ length: config.SERVER.YM_CONCURRENT_PAGES }, async () => await browser.newPage())
    );

    const tasks = [...keywords];

    const processKeyword = async (page: any, keywordObj: { keyword: string; originalIndex: number }) => {
      try {
        logger.info(`Processing Yahoo keyword: "${keywordObj.keyword}"`);

        await page.goto(baseYurl, { waitUntil: "networkidle2", timeout: 60000 });
        await page.waitForSelector("#yschsp", { visible: true, timeout: 30000 });

        await page.type("#yschsp", keywordObj.keyword);
        await page.keyboard.press("Enter");
        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 });

        const searchUrl = page.url();

        if (searchUrl.includes("chrome-error://chromewebdata/")) {
          throw new Error("Failed to get correct url due to Chrome error retrying...");
        }

        results.push({
          keyword: keywordObj.keyword,
          originalIndex: keywordObj.originalIndex,
          searchUrl,
        });
      } catch (error) {
        logger.error(`Error processing Yahoo keyword "${keywordObj.keyword}":`, error);
        failedIndexes.add(keywordObj.originalIndex);
      }
    };

    async function worker(page: any) {
      while (tasks.length) {
        const keywordObj = tasks.shift();
        if (!keywordObj) break;
        try {
          await processKeyword(page, keywordObj);
        } catch (e) {
          logger.error(`Error processing Yahoo keyword "${keywordObj.keyword}"`);
        }
      }
    }

    await Promise.all(pages.map((page) => worker(page)));
    await Promise.all(pages.map((page) => page.close()));
  } catch (error) {
    logger.error("Error during Yahoo search:", error);
    keywords.forEach(({ originalIndex }) => failedIndexes.add(originalIndex));
  } finally {
    if (browser) await browser.close();
  }

  return { results };
};

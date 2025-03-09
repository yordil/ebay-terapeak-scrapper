import axios from "axios";
import * as cheerio from "cheerio";
import UserAgent from "user-agents";
import pLimit from "p-limit"; // For concurrency control
import fs from "fs";
import { delay, withRetry } from "../utils/helpers";
import { itemsTitle } from "../types/interfaces"
import Logger from "../utils/logger";
import LoadConfig from "../config/load-config";
const limit = pLimit(5)// Limit to 5 concurrent requests
const MAX_RETRIES = 3;

const logger = new Logger();
const config = LoadConfig();
const SCRAPE_API_KEY = config.SERVER.SCRAPE_API_KEY;
// Function to extract title
async function extractTitle(url: string): Promise<itemsTitle> {

  const encodedUrl = encodeURIComponent(url);
  const scrapeUrl = `https://api.scrape.do?token=${SCRAPE_API_KEY}&url=${encodedUrl}`;
  
    try {
      const response = await axios.get(scrapeUrl, { timeout: 25000 });
      const html = response.data;
      const $ = cheerio.load(html);

      const title = $("h1.x-item-title__mainTitle > span.ux-textspans.ux-textspans--BOLD").first().text().trim();
      logger.info("Extracted Title:", title);
      if (!title) 
        throw new Error("Selector for title not found");

      return { title, pageLink: url };
    } catch (error) {
      logger.error(`Error extracting title from URL: ${url}`, error);
      throw error;
    }

}

// Function to process multiple URLs with concurrency control
export const extractTitles = async (urls: string[]): Promise<itemsTitle[]> => {
  const results: itemsTitle[] = [];
  const failedUrls = new Set<string>();
  const batchSize = 5;

  // First pass: Process all URLs
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const batchPromises = batch.map(async (url) => {
      try {
        const result = await limit(() => extractTitle(url));
        return result;
      } catch (error) {
        failedUrls.add(url);
        logger.error(`Failed to process URL: ${url}`);
        return { title: "Not found", pageLink: url };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    if (i + batchSize < urls.length) {
      await delay(1000)
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
          const result = await limit(() => extractTitle(url));
          // Update the result in the results array
          const index = results.findIndex(r => r.pageLink === url);
          if (index !== -1) {
            results[index] = result;
          }
        } catch (error) {
          failedUrls.add(url);
          logger.error(`Retry attempt ${attempt} failed for URL: ${url}`);
        }
      });

      await Promise.all(batchPromises);
      await delay(2000)
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
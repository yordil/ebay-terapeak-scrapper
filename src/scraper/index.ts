import { Page } from "puppeteer";
import { createObjectCsvWriter } from "csv-writer";
import fs from "fs";
import path from "path";
import {
  UserData,
  CsvInputData,
  translatedTitle,
} from "../types/interfaces";
import launchUniqueBrowser from "./browser";
import { sendEmailWithRetry } from "../emailer/emailer";
import { performance } from "perf_hooks";
import {
  saveInputFileLocally,
  readFile,
  checkCookieFiles,
  mergeUserDataWithCookies,
  saveData,
  distributeKeyWordToUsers,
  millisToMinutesAndSeconds,
  readProxiesJson,
} from "../utils/helpers";
import Logger from "../utils/logger";
import { loadUserJsonData, modifyTurl } from "../utils/helpers";
import {
  extractItemSpecific,
  itemLinkSelector,
  processTurlGenerationForUser,
  retryFailedTURLGeneration,
} from "./ebay_scraper";
import { mercariSearch, yahooSearch } from "./mercari_yahoo_scraper";
import LoadConfig from "../config/load-config";
import { extractTitles } from "./ai_enabled_ebay_scraper";
import { translateTitles } from "../utils/gpt-translator";

const logger = new Logger();
const config = LoadConfig();

// URL for checking the cookie
const turl = "https://www.ebay.com/sh/research?marketplace=EBAY-US&keywords=%28-abcd%29&dayRange=30&endDate=1736074851886&startDate=1733482851886&categoryId=293&conditionId=3000&format=FIXED_PRICE&minPrice=100&maxPrice=200&sellerCountry=SellerLocation%3A%3A%3AJP&offset=0&limit=50&tabName=SOLD&tz=Asia%2FTokyo";

let startTime = performance.now();
let filePath = "";

/**
 * Main function to trigger the scraping process
 * @param searchUrl - URL to search items
 * @param baseUrl - Base URL for TURL generation
 * @param itemSpecific - Specific item details to scrape
 * @param email - Email to send results
 * @param baseYUrl - Base URL for Yahoo search
 * @param baseMUrl - Base URL for Mercari search
 * @param blacklistPath - Path to the blacklist file
 */
export const TriggerScraping = async (
  searchUrl: string,
  baseUrl: string,
  itemSpecific: string,
  email: string,
  baseYUrl: string,
  baseMUrl: string,
  blacklistPath: string,
  aiHelper: boolean 
) => {
  startTime = performance.now();
  try {
    let userProfiles: UserData[] = [];
    const userFilePath = path.join(process.cwd(), "users.json");
    userProfiles = await loadUserJsonData(userFilePath);
    
    // The file to write data
    filePath = await saveInputFileLocally();

    // Load the entire data from the BlackList for faster lookup
    const blackListSet = new Set(
      readFile(blacklistPath).map((word) => word.toLowerCase()) // Convert all words to lowercase
    );
    
    
    const proxyPath = (process.cwd(), "proxies.json");
    const proxyData = readProxiesJson(proxyPath);

    const randomIndex = Math.floor(Math.random() * proxyData.length);
    const proxyForYM = proxyData[randomIndex];
    
    const successfulUser = await checkCookieFiles(userProfiles, turl);
    logger.info(`Number of successfully logged in user : ${successfulUser.length}`)

    const userDataWithCookies = mergeUserDataWithCookies(successfulUser, userProfiles);

    // Launch and grasp each item links from different pages
    let allItemLinks: string[] = [];
    let currentTurl = searchUrl; // Initialize turl for the current user
    for (let i = 0; i < successfulUser.length; i++) {
      
      const { eBay, proxy, userAgent, viewport, cookies } = userDataWithCookies[i];

      // Launch browser with a unique user
      const { browser, page } = await launchUniqueBrowser(proxy, userAgent, viewport);

      // Set the cookies
      browser.setCookie(...userDataWithCookies[i].cookies);

      // await delay(2000000);
      let pageCounter = 1; // Start from the first page

      // Process pages for the current user
      while (pageCounter !== 0) {
        try{

          const [links, newPageCounter] = await itemLinkSelector(page, currentTurl);
          allItemLinks.push(...links);
          pageCounter = newPageCounter;
        }
        catch (error) {
          logger.error(`User ${eBay.userName} failed to process at page  :${pageCounter}.`);
          break;
        }

       
        // If there are more pages, modify the URL for the next request
        if (pageCounter !== 0) {
          logger.info(`User ${eBay.userName} failed to process at page  :${pageCounter}.`);
          currentTurl = modifyTurl(searchUrl, pageCounter);
          break;
        }
      }
   
      // Close the browser after processing all pages for this user
      await browser.close();
      
      // No need of processing further because we have all the links
      if (pageCounter === 0) {
        break;
      }
    }
    
    allItemLinks = [...new Set(allItemLinks)];
    logger.info(`Total items collected from searchTerapeakURL: ${allItemLinks.length}`);

    let keywordsToProcess: { link: string; jpKeyword: string; enTranslation: string; originalIndex: number }[];

 
    // check if ai helper is enabled  
    if (itemSpecific == "" && aiHelper) {
      logger.info(`AI helper is enabled, processing the data...`);
      logger.info(`calling the item title selector function ....`)

      let titleLinkPair = await extractTitles(allItemLinks)

      logger.info(`Total number of titles with duplicates: ${titleLinkPair.length}`);

      // make titleLinkPair unique based on the title
      titleLinkPair = titleLinkPair.filter((item, index, self) => 
        index === self.findIndex((t) => (
          t.title === item.title
        ))
      )

      logger.info(`Number of unique titles to translate: ${titleLinkPair.length}`);
      
      let translatedKeywords = await translateTitles(titleLinkPair);

      translatedKeywords = translatedKeywords.filter((keyword) => 
        !blackListSet.has(keyword.enTranslation.toLowerCase())
      );

      logger.info(`Total number of translated keywords with duplicates: ${translatedKeywords.length}`);
      // make them unique only looking english keyword is enough
      const uniqueKeywordsMap = new Map<string, translatedTitle>();

      for (const keyword of translatedKeywords) {
        if (!uniqueKeywordsMap.has(keyword.enTranslation.toLowerCase())) {
          uniqueKeywordsMap.set(keyword.enTranslation.toLowerCase(), keyword);
        }
      }
    
      keywordsToProcess = Array.from(uniqueKeywordsMap.values()).map((keyword, index) => ({
        jpKeyword: keyword.jpKeyword,
        enTranslation: keyword.enTranslation,
        link: keyword.link,
        originalIndex: index
      }));

      logger.info(`Number of unique keywords to process: ${keywordsToProcess.length}`);
      if (keywordsToProcess.length === 0) {
        logger.info("No keywords to process. Exiting...");
        return;
      }



    } else {
      logger.info(`AI helper is disabled, using item-specific keywords...`);
      const processingResults = await extractItemSpecific(allItemLinks, itemSpecific);
    
      logger.info(`Total number of keywords (including duplicates): ${processingResults.length}`);
    
      const filteredKeyword = Array.from(
        new Map(
          processingResults
            .filter(({ itemSpecific }) => 
              itemSpecific.toLowerCase() !== "not found" && 
              itemSpecific.toLowerCase() !== "see description" && 
              itemSpecific.toLowerCase() !== "unknown" && 
              !blackListSet.has(itemSpecific.toLowerCase())
            )
            // Create a composite key from normalized itemSpecific and eBay URL
            .map(item => [
              `${item.itemSpecific.toLowerCase()}`,
              item
            ])
        ).values()
      );

      logger.info(`Number of unique keywords to process: ${filteredKeyword.length}`);
    
      // Convert filteredKeyword to match the aiHelper format for consistency
      keywordsToProcess = filteredKeyword.map(({ itemSpecific, link }, index) => ({
        jpKeyword: itemSpecific,
        enTranslation: itemSpecific,
        link: link,
        originalIndex: index 
      }));
    }
    
    
    // If no keywords remain, exit
    if (keywordsToProcess.length === 0) {
      logger.info("No keywords to process. Exiting...");
      return;
    }

    const userAssignmentsForTURL = distributeKeyWordToUsers(userDataWithCookies, keywordsToProcess)

    // Use a Map to store the data:
    const outputDataMap = new Map<number, CsvInputData>();

    const keywordOriginalIndexPair = new Map<string, number>();
    const JpKeywordOriginalIndexPair = new Map<string, number>();

    for (const keyword of keywordsToProcess) {
      keywordOriginalIndexPair.set(keyword.enTranslation, keyword.originalIndex);
    }

    for (const keyword of keywordsToProcess) {
      JpKeywordOriginalIndexPair.set(keyword.jpKeyword, keyword.originalIndex);
    }
    

    // Collect failed keywords and users
    let failedKeywords: { 
      enTranslation: string;
      jpKeyword: string;
      originalIndex: number;
      link: string;}[] = [];
    let failedUsers: string[] = [];

    // Process all users in parallel
    const turlPromises = userAssignmentsForTURL.map(async ({ user, data }) => {
      try {
        const {
          username,
          results,
          failedKeywords: userFailedKeywords,
          failedUsers: userFailedUsers,
        } = await processTurlGenerationForUser(user, data, baseUrl ,  async (result) => {
          // Store in Map instead of array
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

        // Collect failed data for retry
        failedKeywords.push(...userFailedKeywords);
        failedUsers.push(...userFailedUsers);
      } catch (error) {
        logger.error(`Failed processing ${user.eBay.userName}:`, error);
        failedUsers.push(user.eBay.userName);
      }
    });

    // Wait for all initial processing to finish
    await Promise.all(turlPromises);

    // Before retrying failed keywords, filter out those that are already processed
    failedKeywords = failedKeywords.filter((failedKeyword) => {
      const outputDataArray = Array.from(outputDataMap.values());
      const alreadyExists = outputDataArray.some(outputRow => 
        outputRow.Identity === failedKeyword.enTranslation
      );
      return !alreadyExists;
    });

    // Find missed keywords (in keywordsToProcess but not in outputData or failedKeywords)
    const missedKeywords = keywordsToProcess.filter(keyword => {
      const inOutputData = Array.from(outputDataMap.values()).some(row => 
        row.Identity === keyword.enTranslation
      );
      const inFailedKeywords = failedKeywords.some(failed => 
        failed.enTranslation === keyword.enTranslation
      );
      return !inOutputData && !inFailedKeywords;
    });

    // Add missed keywords to failedKeywords
    if (missedKeywords.length > 0) {
      logger.info(`Found ${missedKeywords.length} missed keywords, adding to retry list`);
      failedKeywords.push(...missedKeywords);
    }

    // Call if there is any keyword left unprocessed
    if (failedKeywords.length > 0) {
      // make failedKeyword unique if it store duplicate
      failedKeywords = Array.from(
        new Map(
          failedKeywords.map(keyword => [
            `${keyword.enTranslation}`,
            keyword
          ])
        ).values()
      );

      // indexOriginalKeywordPair
      
      await retryFailedTURLGeneration(
        userDataWithCookies, 
        failedKeywords, 
        failedUsers, 
        baseUrl, 
        filePath, 
        outputDataMap,
        keywordOriginalIndexPair,
      );
    } else {
      logger.info(`Number of failed Keywords : ${failedKeywords.length}`);
      logger.info(`All keywords processed successfully! No retries needed for TURL generation.`);
    }

    logger.info("Mercari and Yahoo scraping started...");

    const keywordObjectsForYM = Array.from(outputDataMap.entries())
      .filter(([_, row]) => row && row["JP Keyword"])
      .map(([index, row]) => ({
        keyword: row["JP Keyword"],
        originalIndex: JpKeywordOriginalIndexPair.get(row["JP Keyword"])
      }))
      .filter((item): item is { keyword: string; originalIndex: number } => item.originalIndex !== undefined);

      const keywordMap = new Map(
        keywordObjectsForYM.map(obj => [obj.originalIndex, obj])
      );

    const CHUNK_SIZE = config.SERVER.YM_CONCURRENT_PAGES; 
    const MAX_RETRIES = 3;

    const processMercari = async () => {
      let failedMercari = new Set<number>();

      // First pass: Process all keywords without retries
      for (let i = 0; i < keywordObjectsForYM.length; i += CHUNK_SIZE) {
        const chunk = keywordObjectsForYM.slice(i, i + CHUNK_SIZE);
        logger.info(`Processing Mercari chunk ${i / CHUNK_SIZE + 1}...`);

        try {
          const murlData = await mercariSearch(baseMUrl, proxyForYM, chunk, failedMercari);
          const mercariMap = new Map(murlData.results.map(res => [res.originalIndex, res.searchUrl]));

          chunk.forEach(({ originalIndex }) => {
            const existingData = outputDataMap.get(originalIndex);
            if (existingData) {
              existingData.MURL = mercariMap.get(originalIndex) || "";
              outputDataMap.set(originalIndex, existingData);
              
              // Convert Map to array before saving
              const outputData = Array.from(outputDataMap.values());
              saveData(filePath, outputData);
            }
          });

          logger.info(`Mercari results for chunk ${i / CHUNK_SIZE + 1} saved.`);
        } catch (error) {
          logger.error(`Mercari search failed for chunk ${i / CHUNK_SIZE + 1}:`, error);
        }
      }

      // Retry mechanism
      let attempt = 1;
      while (failedMercari.size > 0 && attempt <= MAX_RETRIES) {
        logger.info(`Retrying ${failedMercari.size} failed Mercari items (Attempt ${attempt})...`);

        const failedItems = Array.from(failedMercari)
        .map(originalIndex => {
          const keywordObj = keywordMap.get(originalIndex);
          return keywordObj ? { keyword: keywordObj.keyword, originalIndex } : null;
        })
        .filter((item): item is { keyword: string; originalIndex: number } => item !== null);


        failedMercari.clear();

        for (let i = 0; i < failedItems.length; i += CHUNK_SIZE) {
          const chunk = failedItems.slice(i, i + CHUNK_SIZE);
          try {
            const murlData = await mercariSearch(baseMUrl, proxyForYM, chunk, failedMercari);
            const mercariMap = new Map(murlData.results.map(res => [res.originalIndex, res.searchUrl]));

            chunk.forEach(({ originalIndex }) => {
              const existingData = outputDataMap.get(originalIndex);
              if (existingData) {
                existingData.MURL = mercariMap.get(originalIndex) || "";
                outputDataMap.set(originalIndex, existingData);
                
                // Convert Map to array before saving
                const outputData = Array.from(outputDataMap.values());
                saveData(filePath, outputData);
              }
            });

          } catch (error) {
            logger.error(`Retry attempt ${attempt} failed for Mercari chunk:`, error);
          }
        }

        attempt++;
      }

      if (failedMercari.size > 0) {
        logger.error(`${failedMercari.size} Mercari searches failed after ${MAX_RETRIES} retries.`);
      } else {
        logger.info(`All Mercari searches are successful`);
      }
    };

    const processYahoo = async () => {
      let failedYahoo = new Set<number>();
    
      // First pass: Process all keywords without retries
      for (let i = 0; i < keywordObjectsForYM.length; i += CHUNK_SIZE) {
        const chunk = keywordObjectsForYM.slice(i, i + CHUNK_SIZE);
        logger.info(`Processing Yahoo chunk ${i / CHUNK_SIZE + 1}...`);
    
        try {
          const yurlData = await yahooSearch(baseYUrl, proxyForYM, chunk, failedYahoo);
          const yahooMap = new Map(yurlData.results.map(res => [res.originalIndex, res.searchUrl]));
        
          chunk.forEach(({ originalIndex }) => {
            const existingData = outputDataMap.get(originalIndex);
            if (existingData) {
              existingData.YURL = yahooMap.get(originalIndex) || "";
              outputDataMap.set(originalIndex, existingData);
        
              // Convert Map to array before saving
              const outputData = Array.from(outputDataMap.values());
              saveData(filePath, outputData);
            }
          });
        
          logger.info(`Yahoo results for chunk ${i / CHUNK_SIZE + 1} saved to ${filePath}`);
        } catch (error) {
          logger.error(`Yahoo search failed for chunk ${i / CHUNK_SIZE + 1}:`, error);
        }
          }
        
          // Retry mechanism
          let attempt = 1;
          while (failedYahoo.size > 0 && attempt <= MAX_RETRIES) {
        logger.info(`Retrying ${failedYahoo.size} failed Yahoo items (Attempt ${attempt})...`);
        
        const failedItems = Array.from(failedYahoo)
          .map(originalIndex => {
            const keywordObj = keywordMap.get(originalIndex);
            return keywordObj ? { keyword: keywordObj.keyword, originalIndex } : null;
          })
          .filter((item): item is { keyword: string; originalIndex: number } => item !== null);
        
        failedYahoo.clear();
        
        for (let i = 0; i < failedItems.length; i += CHUNK_SIZE) {
          const chunk = failedItems.slice(i, i + CHUNK_SIZE);
          try {
            const yurlData = await yahooSearch(baseYUrl, proxyForYM, chunk, failedYahoo);
            const yahooMap = new Map(yurlData.results.map(res => [res.originalIndex, res.searchUrl]));
        
            chunk.forEach(({ originalIndex }) => {
              const existingData = outputDataMap.get(originalIndex);
              if (existingData) {
            existingData.YURL = yahooMap.get(originalIndex) || "";
            outputDataMap.set(originalIndex, existingData);
        
            // Convert Map to array before saving
            const outputData = Array.from(outputDataMap.values());
            saveData(filePath, outputData);
              }
            });
        
          } catch (error) {
            logger.error(`Retry attempt ${attempt} failed for Yahoo chunk:`, error);
          }
        }
        
        attempt++;
          }
        
          if (failedYahoo.size > 0) {
        logger.error(`${failedYahoo.size} Yahoo searches failed after ${MAX_RETRIES} retries.`);
          } else {
        logger.info(`All Yahoo searches are successful`);
          }
        };
        

        // Process Yahoo and Mercari searches in parallel
        await Promise.all([processMercari() ,processYahoo()]);

        logger.info(`Updated data with Mercari and Yahoo URLs saved to ${filePath}`);
        logger.info(`All keyword chunks processed successfully!`);
     
        logger.info(`Total number of keyword to process is: ${keywordsToProcess.length}`);
        // We have to minimize 1 because of the header of the csv
        logger.info(`Total number of keyword processed is: ${outputDataMap.size}`);

        await sendEmailWithRetry({
          recipient: email,
          subject: "Scraping Results: Your Requested Data",
          attachmentPath: filePath,
          isError: false,
        });
      } catch (error) {
        logger.error(`Error processing user ${error}`);
        await sendEmailWithRetry({
          recipient: email,
          subject: "Scraping Results: Your Requested Data",
          attachmentPath: filePath,
          isError: true,
        });
      } finally {
      
        const endTime = performance.now();
        logger.info("Total time taken to process the data", millisToMinutesAndSeconds(endTime - startTime));
      }
    };


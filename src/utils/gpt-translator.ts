import { OpenAI } from "openai";
import pLimit from "p-limit"; // Concurrency control
import { itemsTitle, translatedTitle } from "../types/interfaces"; // Assuming you have these interfaces
import Logger from "../utils/logger";
import LoadConfig from "../config/load-config";
import { delay } from "./helpers";


const config = LoadConfig();
const openai = new OpenAI({
  apiKey: config.SERVER.OPENAI_API_KEY,
  
});

const logger = new Logger();

const limit = pLimit(3); // Limit concurrent AI requests


// Function to get Japanese keywords and their English translation
async function getJPKeywords(item: itemsTitle): Promise<translatedTitle> {
  // Step 1: Get Japanese Keywords
  const jpKeywordResponse = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: `Role: Search Optimization Expert\n
      Task: Generate a concise set of Japanese keywords (up to three words) to find the exact item in Japan based on the given title.\n
      Direction:\n  Specific:\n    - The keywords must be in Japanese.\n    - Limited to a maximum of three words.\n    - Must precisely target the specific item.\n
        Step:\n    1. Analyze the given title carefully.\n    2. Identify the most relevant and distinguishing terms in Japanese.\n    3. Provide a single line containing the keywords.\n
        Dos and Don’ts:\n   Use natural Japanese search terms.\n   Ensure precision and relevance.\n    Keep it within three words.\n     ❌ Don’t include unnecessary words.\n    ❌ Don’t provide multiple keyword options.\n    ❌ Don’t include "Japanese: ----", only return the keywords.\n
      Output Format: \n  - Return only the keywords in a single line.\n
      Examples:\n  CSMオーズドライバー  FOR title Kamen Rider OOO DRIVER COMPLETE SET Selection BANDAI CSM Modification MINT\n
      Input Data:\n ${item.title} \n`,
      },    
    ],
    max_tokens: 50,
  });

  const jpKeyword = jpKeywordResponse.choices[0].message.content?.trim() || "No response";

  if (jpKeyword === "No response") throw new Error("Empty response for Japanese keyword");

  // Step 2: Translate to English
  const enTranslationResponse = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "user",
        content: `Role: You are a professional translator specializing in accurate and concise English translations of Japanese words.\n
    Task: Translate the given Japanese word(s) into English and return only the translated word(s) without any extra text.\n
    Direction:\n  Specific:\n    - The response must contain only the translated word(s).\n    - No additional text, explanations, or formatting.\n
      Step:\n    1. Read the provided Japanese word(s).\n    2. Translate them accurately into English.\n    3. Return only the translated word(s), nothing else.\n
      Dos and Don’ts:\n     Do: Provide an accurate and natural English translation.\n     Do: Keep the response strictly to the translated word(s).\n     Don’t: Include "English: ---" or any other labels.\n     Don’t: Add explanations, examples, or extra formatting.\n    ❌ Don’t: Return multiple translations—only the most accurate one.\n
    Output Format: \n  - Return only the translated word(s) in a single line.\n
    Examples: \n  CSMオーズドライバー Translated to  CSM OOO DRIVER \n
    Input Data: \n   ${jpKeyword}`,
      },
    ],
    max_tokens: 50,
  });

  const enTranslation = enTranslationResponse.choices[0].message.content?.trim() || "No response";

  if (enTranslation === "No response") throw new Error("Empty response for English translation");

  logger.info(`title keyword in Japanese: ${jpKeyword} translated to => ${enTranslation}`);

  // Delay before the next request
  await delay(8000);

  return {
    identity: enTranslation,
    jpKeyword,
    title: item.title,
    link: item.pageLink,
    keyword: jpKeyword,
    enTranslation,
  };
}


export const translateTitles = async (titles: itemsTitle[]): Promise<translatedTitle[]> => {
  const results: translatedTitle[] = [];
  const failedTitles = new Set<itemsTitle>();
  const batchSize = 3;
  const MAX_RETRIES = 3;

  // First pass: Process all titles
  for (let i = 0; i < titles.length; i += batchSize) {
    const batch = titles.slice(i, i + batchSize);
    const batchPromises = batch.map(async (item) => {
      try {
        return await limit(() => getJPKeywords(item));
      } catch (error) {
        failedTitles.add(item);
        logger.error(`Failed to process title: ${item.title}`);
        return {
          identity: "Not found",
          jpKeyword: "Not found",
          title: item.title,
          link: item.pageLink,
          keyword: "Not found",
          enTranslation: "Not found",
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    if (i + batchSize < titles.length) {
      await delay(1000);
    }
  }

  // Retry mechanism for failed titles
  let attempt = 1;
  while (failedTitles.size > 0 && attempt <= MAX_RETRIES) {
    logger.info(`Retrying ${failedTitles.size} failed titles (Attempt ${attempt})...`);
    const failedTitlesArray = Array.from(failedTitles);
    failedTitles.clear();

    for (let i = 0; i < failedTitlesArray.length; i += batchSize) {
      const batch = failedTitlesArray.slice(i, i + batchSize);
      const batchPromises = batch.map(async (item) => {
        try {
          const result = await limit(() => getJPKeywords(item));
          // Update the result in the results array
          const index = results.findIndex(r => r.title === item.title);
          if (index !== -1) {
            results[index] = result;
          }
        } catch (error) {
          failedTitles.add(item);
          logger.error(`Retry attempt ${attempt} failed for title: ${item.title}`);
        }
      });

      await Promise.all(batchPromises);
      await delay(2000);
    }
    attempt++;
  }

  if (failedTitles.size > 0) {
    logger.error(`${failedTitles.size} titles failed after ${MAX_RETRIES} retries.`);
  } else {
    logger.info('All titles processed successfully');
  }

  return results;
};




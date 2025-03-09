import { UserData } from "./../types/interfaces";
import { Page } from "puppeteer";
import { Profile } from "../types/interfaces";
import { GlobalConfig } from "../config/load-config";
import { delay, isTextVisible, randomDelay } from "../utils/helpers";
import Logger from "../utils/logger";

const logger = new Logger();

const eBayLogin = async (page: Page, user: UserData, turl: any) => {
  const page_url: string = turl;
  const maxRetries = 5;
  let retries = 0;
  let loginSuccess = false;

  while (!loginSuccess && retries < maxRetries) {
    try {
      await page.goto(page_url);
      // in the case of sign-in with username and password goes this route
      if (
        (await isTextVisible(page, "Sign in to your account")) ||
        (await isTextVisible(page, "Hello"))
      ) {
        logger.info(
          "Username input field detected. Proceeding with username entry. For eBay: " +
            user.eBay.userName,
        );

        await page.type("#userid", user.eBay.userName);
        await randomDelay();

        const continueButton = await page.$("#signin-continue-btn");
        if (continueButton !== null) {
          await continueButton.click();
          logger.info(
            "Clicked 'Continue' after entering username. For eBay: " +
              user.eBay.userName,
          );
        } else {
          logger.warn(
            "signin-continue-btn not found, but username input was present. For eBay: " +
              user.eBay.userName,
          );
        }

        await randomDelay();
        await page.type("#pass", user.eBay.password);
        await randomDelay();

        const signInButton = await page.$("#sgnBt");
        if (signInButton !== null) {
          await signInButton.click();
          logger.info(
            "Clicked 'Sign In' after entering password. For eBay: " +
              user.eBay.userName,
          );
        } else {
          logger.warn(
            "sgnBt not found after password input. For eBay: " +
              user.eBay.userName,
          );
        }

        await delay(15000); // Wait for potential login processing
        if (await isTextVisible(page, "Let’s verify it’s you")) {
          return {
            success: false,
            error: `Failed to login, asking verification for eBay user: ${user.eBay.userName}.`,
          };
        } else if (
          await isTextVisible(page, "Please verify yourself to continue")
        ) {
          logger.info("Solving Captcha. For eBay: " + user.eBay.userName);
          await delay(90000);
        }
        retries++;
        logger.info(
          `Sign-in attempt: ${user.eBay.userName}. Attempt ${retries}/${maxRetries}.`,
        );
        // in the case of sign-in with password goes to this route
      } else if (await isTextVisible(page, "Welcome")) {
        logger.info(
          "Password input field detected. Proceeding with password entry. For eBay: " +
            user.eBay.userName,
        );

        await page.type("#pass", user.eBay.password);
        await randomDelay();

        const signInButton = await page.$("#sgnBt");
        if (signInButton !== null) {
          await signInButton.click();
          logger.info(
            "Clicked 'Sign In' after entering password. For eBay: " +
              user.eBay.userName,
          );
        } else {
          logger.warn(
            "sgnBt not found after password input. For eBay: " +
              user.eBay.userName,
          );
        }

        await delay(15000); // Wait for potential login processing
        if (await isTextVisible(page, "Let’s verify it’s you")) {
          return {
            success: false,
            error: `Failed to login, asking verification for eBay user: ${user.eBay.userName}.`,
          };
        } else if (
          await isTextVisible(page, "Please verify yourself to continue")
        ) {
          logger.info("Solving Captcha. For eBay: " + user.eBay.userName);
          await delay(90000);
        }
        retries++;
        logger.info(
          `Entering a password & Sign-in attempt: ${user.eBay.userName}. Attempt ${retries}/${maxRetries}.`,
        );
        // in the case of successful login goes to this route
      } else if (await isTextVisible(page, "Research products")) {
        logger.info(
          "▶️ Landing on Research products page: " + user.eBay.userName + " - ",
        );
        loginSuccess = true;
        break;
        // in cases of errors: exit the login flow
      } else if (await isTextVisible(page, "Pardon Our Interruption...")) {
        return {
          success: false,
          error: `Failed to launch for eBay user: ${user.eBay.userName}. This user might temporally blocked`,
        };
      } else if (await isTextVisible(page, "Let’s verify it’s you")) {
        return {
          success: false,
          error: `Failed to login, asking verification for eBay user: ${user.eBay.userName}.`,
        };
      } else if (
        await isTextVisible(
          page,
          "You've exceeded the number of requests allowed in one day",
        )
      ) {
        return {
          success: false,
          error: `Exceeded the number of requests allowed in one day, for eBay user: ${user.eBay.userName}.`,
        };
        // in the case of solving captchas
      } else if (
        await isTextVisible(page, "Please verify yourself to continue")
      ) {
        await page.solveRecaptchas();
        await delay(5000);
        logger.info("started solving the CAPTCHA");

        await page.waitForSelector("#checkbox", { visible: true }); // This waits until the checkbox is visible
        await Promise.all([page.waitForNavigation(), page.click("#checkbox")]);

        // solve captcha

        logger.info("Solving Captcha. For eBay: " + user.eBay.userName);
        await delay(120000);
        retries++;
        logger.info(
          `Solving Captcha attempt: ${user.eBay.userName}. Attempt ${retries}/${maxRetries}.`,
        );
      } else {
        // in the case of failing on the login process goes to this route
        retries++;
        logger.info(
          `No recognizable element detected. Retrying login for eBay user: ${user.eBay.userName}. Attempt ${retries}/${maxRetries}.`,
        );
        await delay(30000);
      }
    } catch (error: any) {
      retries++;
      logger.error(
        "An error occurred during login process for eBay user: " +
          user.eBay.userName +
          ". Error:",
        error.message,
      );
    }
  }
  if (!loginSuccess) {
    return {
      success: false,
      cookies: [],
      error: `Failed to login for eBay user: ${user.eBay.userName} after ${retries} attempts.`,
    };
  }
  if (retries == maxRetries) {
    logger.info(`Retries reached MaxRetries. Attempt ${retries}/${maxRetries}`);
  }

  await delay(5000);

  // get  cookies
  const cookies = await page.cookies();

  return { success: true, cookie: cookies, error: "" };
};

export default eBayLogin;

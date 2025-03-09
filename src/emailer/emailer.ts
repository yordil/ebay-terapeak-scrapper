import nodemailer from "nodemailer";
import path from "path";
import { successEmailTemplate, errorEmailTemplate } from "./email-template"; // Adjust path as necessary
import LoadConfig from "../config/load-config";
import Logger from "../utils/logger";

const config = LoadConfig();
const logger = new Logger();

interface EmailOptions {
  recipient: string;
  subject: string;
  attachmentPath?: string; // Optional: Include for success emails
  isError: boolean; // Specify if this is an error email
}

// The retry mechanism for sending email
export const sendEmailWithRetry = async (
  options: EmailOptions,
  retries: number = 3,
): Promise<void> => {
  const { recipient, subject, attachmentPath, isError } = options;

  const transporter = nodemailer.createTransport({
    //  SMTP host
    host: config.EMAILER.SMTP_HOST,
    port: config.EMAILER.SMTP_PORT || 587,
    auth: {
      user: config.EMAILER.MAILTRAP_USER,
      pass: config.EMAILER.MAILTRAP_PASS,
    },
  });

  const htmlContent = isError ? errorEmailTemplate() : successEmailTemplate();

  const mailOptions: any = {
    // from: `"Terapeak item picker " <${config.EMAILER.SENDER_EMAIL}>`,
    to: recipient,
    subject: subject,
    html: htmlContent,
  };

  if (!isError && attachmentPath) {
    mailOptions.attachments = [
      {
        filename: path.basename(attachmentPath),
        path: attachmentPath,
      },
    ];
  }

  //  Retry sending email up to 3 times for network issues or other problems
  let attempts = 0;
  while (attempts < retries) {
    try {
      await transporter.sendMail(mailOptions);
      logger.info(`Email sent to ${recipient}`);
      return; // Exit if email is sent successfully
    } catch (error) {
      attempts++;
      if (error instanceof Error) {
        logger.error(`Attempt ${attempts} failed: ${error.message}`);
      }
      if (attempts < retries) {
        logger.info(`Retrying in 1 minute...`);
        // handling internet issue and other issues
        await new Promise((resolve) => setTimeout(resolve, 60000)); // Wait 1 minute
      } else {
        logger.error("Failed to send the email after 3 attempts.");
      }
    }
  }
};

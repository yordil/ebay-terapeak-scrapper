import { config } from "dotenv";

config();

const requiredEnvVars = [
	"PORT",
	"TWO_CAPTCHA_API_KEY",
	"SMTP_HOST",
	"SMTP_PORT",
	"MAILTRAP_USER",
	"MAILTRAP_PASS",
	"SENDER_EMAIL",
	"MAX_CONCURRENT_PAGES",
	"OPENAI_API_KEY",
	"SCRAPE_API_KEY",
	"DELAY_BETWEEN_REQUEST",
];

requiredEnvVars.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

const SERVER_CONFIG = {
	PORT: process.env.PORT!,
	TWO_CAPTCHA_API_KEY: process.env.TWO_CAPTCHA_API_KEY!,
	MAX_CONCURRENT_PAGES: Number(process.env.MAX_CONCURRENT_PAGES!),
	YM_CONCURRENT_PAGES: Number(process.env.YM_CONCURRENT_PAGES!),
	OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
	SCRAPE_API_KEY: process.env.SCRAPE_API_KEY!,
	DELAY_BETWEEN_REQUEST: Number(process.env.DELAY_BETWEEN_REQUEST!),

};

const EMAILER_CONFIG = {
  SMTP_HOST: process.env.SMTP_HOST!,
  SMTP_PORT: Number(process.env.SMTP_PORT!),
  MAILTRAP_USER: process.env.MAILTRAP_USER!,
  MAILTRAP_PASS: process.env.MAILTRAP_PASS!,
  SENDER_EMAIL: process.env.SENDER_EMAIL!,
  
};

export const GlobalConfig = {
  SERVER: SERVER_CONFIG,
  EMAILER: EMAILER_CONFIG,
};

const LoadConfig = () => GlobalConfig;

export default LoadConfig;

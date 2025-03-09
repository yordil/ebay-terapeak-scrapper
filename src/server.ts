import express, { Request, Response } from "express";
import multer, { Multer, StorageEngine } from "multer";
import cors from "cors";
import { dirname, join } from "path";
import fs from "fs";
import bodyParser from "body-parser";
import Logger from "./utils/logger";
import { FormData, UserData } from "./types/interfaces";
import LoadConfig from "./config/load-config";
import { loadUserJsonData } from "./utils/helpers";
import { TriggerScraping } from "./scraper/index";
import { checkCookie, updateCookie } from "./scraper/cookie_handler"; 


const rootDir = process.cwd();
const logger = new Logger();
const config = LoadConfig();

const dataDir = join(rootDir, "data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const storage: StorageEngine = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, dataDir);
  },
  filename: function (_req, _file, cb) {
    cb(null, "blacklist.csv");
  },
});

const upload: Multer = multer({ storage: storage });

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use(bodyParser.json());

app.post(
  "/api/submit",
  upload.single("blacklist"),
  (req: Request, res: Response): void => {
    try {
      const { searchUrl, baseUrl, itemSpecific, baseMURL, baseYURL, email , aiHelper} = req.body;

      
      // Validate required fields
      if (!searchUrl || !baseUrl || (!itemSpecific && !aiHelper) || !baseYURL || !baseMURL || !email) {
        res.status(400).json({
          message: "Complete all fields",
          success: false,
        });
        return;
      }
      
      const blacklistFile = req.file;
      
      if (!blacklistFile) {
        res.status(400).json({
          message: "Blacklist file is needed",
          success: false,
        });
        return;
      }
      
      logger.info("Form submission:", {
        searchUrl,
        baseUrl,
        itemSpecific,
        email,
        blacklistFile: {
          filename: blacklistFile.filename,
          path: blacklistFile.path,
          size: blacklistFile.size,
        },
      });
      
      // send the data to the scraper here for the proccessing
      
      res.status(200).json({
        message: "Data received successfully",
        success: true,
      });
      
    
    
      logger.info("Triggering scraping Function Call...");
      // Trigger the scraping API here
      const blacklistPath = blacklistFile.path;
      const response = TriggerScraping(
        searchUrl,
        baseUrl,
        itemSpecific,
        email,
        baseYURL,
        baseMURL,
        blacklistPath,
        aiHelper
      );

      logger.info("Scraping Function Call Completed...");
      logger.info("Response: ", response);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("Error processing submission:", errorMessage);
      res.status(500).json({
        success: false,
        message: "Error processing the submission",
      });
    }
  },
);

app.get("/api/update-cookie", async (req: Request, res: Response) => {
  try {
    // Trigger User Login Logic
    const response = await updateCookie();

    if (response.status === "sucess") {
      res.status(200).json({
        status: "success",
        message: "Cookie status checked successfully",
        activeUsers: response.activeUsers,
      });
    } else {
      res
        .status(500)
        .json({ status: "error", message: response.message, activeUsers: 0 });
    }
  } catch (error) {
    logger.error("Error updating cookies:", error);
    res
      .status(500)
      .json({ status: "error", message: "Failed to update cookies" });
  }
});

app.get("/api/check-status", async (req: Request, res: Response) => {
  try {
    // Call the checkCookie function
    const response = await checkCookie();

    // Return the response with active users count or error message
    if (response.status === "success") {
      res.status(200).json({
        status: "success",
        message: "Cookie status checked successfully",
        activeUsers: response.activeUsers,
      });
    } else {
      res
        .status(500)
        .json({ activeUser: 0, status: "error", message: response.message });
    }
  } catch (error) {
    logger.error("Error checking cookie status:", error);
    res
      .status(500)
      .json({ activeUsers: 0, message: "Failed to check cookie status" });
  }
});

const port =  3000;

app.listen(port, () => {
  logger.info(`The server is running on port ${port}`);
});

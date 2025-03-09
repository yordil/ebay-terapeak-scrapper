import fs from "fs";
import path, { join } from "path";

const rootDir = process.cwd();
const logFilePath = join(rootDir, "log");

class Logger {
  private infoLogFilePath: string;
  private errorLogFilePath: string;

  constructor() {
    if (!fs.existsSync(logFilePath)) {
      fs.mkdirSync(logFilePath, { recursive: true });
    }
    this.infoLogFilePath = path.join(logFilePath, "info.log");
    this.errorLogFilePath = path.join(logFilePath, "error.log");
  }

  private log(level: string, ...messages: (string | object | unknown)[]): void {
    const timestamp = new Date().toISOString();
    const formattedMessages = messages
      .map((msg) =>
        typeof msg === "object" ? JSON.stringify(msg, null, 2) : msg,
      )
      .join(" ");

    const logMessage = `[${timestamp}] [${level.toUpperCase()}]: ${formattedMessages}\n`;

    if (level === "ERROR") {
      console.error(logMessage);
    } else {
      console.log(logMessage);
    }

    if (level === "ERROR") {
      fs.appendFile(this.errorLogFilePath, logMessage, (err) => {
        if (err) {
          console.error("Failed to write to error log file:", err.message);
        }
      });
    } else {
      fs.appendFile(this.infoLogFilePath, logMessage, (err) => {
        if (err) {
          console.error("Failed to write to info log file:", err.message);
        }
      });
    }
  }

  public info(...messages: (string | object | unknown)[]): void {
    this.log("INFO", ...messages);
  }

  public success(...messages: (string | object | unknown)[]): void {
    this.log("SUCCESS", ...messages);
  }

  public warn(...messages: (string | object | unknown)[]): void {
    this.log("WARNING", ...messages);
  }

  public error(...messages: (string | object | unknown)[]): void {
    this.log("ERROR", ...messages);
  }

  public debug(...messages: (string | object)[]): void {
    this.log("DEBUG", ...messages);
  }
}

export default Logger;

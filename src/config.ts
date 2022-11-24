import fs from "fs/promises";
import { Config } from "./types";

export const loadConfig = async (): Promise<Config> => {
  try {
    return JSON.parse(await fs.readFile("config/config.json", "utf-8"));
  } catch (err: any) {
    throw new Error(`error while loading configuration: ${err.message}`);
  }
};

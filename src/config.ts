import fs from "fs/promises";

export interface Config {
  api_key: string;
  secret_key: string;
  profit_threshold: number;
  transaction_fees: number;
  fiat_symbol: string;
}

export const loadConfig = async (): Promise<Config> => {
  try {
    return JSON.parse(await fs.readFile("config/config.json", "utf-8"));
  } catch (err: any) {
    throw new Error(`error while loading configuration: ${err.message}`);
  }
};

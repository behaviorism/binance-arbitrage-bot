export interface Config {
  api_key: string;
  secret_key: string;
  profit_threshold: number;
  transaction_fees: number;
}

export interface PairInfo {
  baseAsset: string;
  quoteAsset: string;
  lotSize: number;
  minNotional: number;
}

export type Symbol = string;
export type BestBid = string;
export type BestBidAmount = string;
export type BestAsk = string;
export type BestAskAmount = string;

export interface BookTickerWSMessage {
  s: Symbol;
  b: BestBid;
  B: BestBidAmount;
  a: BestAsk;
  A: BestAskAmount;
}

export interface BookTickerApiPair {
  symbol: Symbol;
  bidPrice: BestBid;
  bidQty: BestBidAmount;
  askPrice: BestAsk;
  askPriceQty: BestAskAmount;
}

export interface PairBookTick {
  symbol: Symbol;

  bestBid: number;
  bestBidAmt: number;

  bestAsk: number;
  bestAskAmt: number;
}

export type Pair = PairInfo & PairBookTick;

export type Pairs = Map<Symbol, Pair>;

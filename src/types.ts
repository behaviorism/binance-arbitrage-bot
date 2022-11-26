import Pair from "./pair";

export type PairSymbol = string;
export type BestBid = string;
export type BestBidAmount = string;
export type BestAsk = string;
export type BestAskAmount = string;

export interface BookTickerWSMessage {
  s: PairSymbol;
  b: BestBid;
  B: BestBidAmount;
  a: BestAsk;
  A: BestAskAmount;
}

export interface BookTickerApiPair {
  symbol: PairSymbol;
  bidPrice: BestBid;
  bidQty: BestBidAmount;
  askPrice: BestAsk;
  askPriceQty: BestAskAmount;
}

export type Pairs = Map<PairSymbol, Pair>;

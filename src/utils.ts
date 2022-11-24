import {
  BookTickerApiPair,
  BookTickerWSMessage,
  Pair,
  PairBookTick,
} from "./types";

export const wsTickToPair = (tick: BookTickerWSMessage): PairBookTick => {
  return {
    symbol: tick.s,
    bestBid: parseFloat(tick.b),
    bestBidAmt: parseFloat(tick.B),
    bestAsk: parseFloat(tick.a),
    bestAskAmt: parseFloat(tick.A),
  };
};

export const apiTickToPair = (tick: BookTickerApiPair): PairBookTick => {
  return {
    symbol: tick.symbol,
    bestBid: parseFloat(tick.bidPrice),
    bestBidAmt: parseFloat(tick.bidQty),
    bestAsk: parseFloat(tick.askPrice),
    bestAskAmt: parseFloat(tick.askPriceQty),
  };
};

export const isPairEnabled = (pair: Pair | undefined) =>
  pair && pair.bestBid && pair.bestBidAmt && pair.bestAsk && pair.bestAskAmt;

export const floorDecimals = (num: number, decimals: number = 2) =>
  Math.floor(num * 10 ** decimals) / 10 ** decimals;

export const fmtNumber = (num: number) => num.toFixed(8);

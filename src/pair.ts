import { BookTickerApiPair, BookTickerWSMessage, PairSymbol } from "./types";
import { floorDecimals } from "./utils";

export interface PairInfo {
  symbol: PairSymbol;

  baseAsset: string;
  quoteAsset: string;

  lotSize: number;
  minNotional: number;
}

class Pair {
  symbol: PairSymbol;

  baseAsset: string;
  quoteAsset: string;

  // @ts-ignore
  lotSize: number;
  // @ts-ignore
  minNotional: number;

  private bestBid: number;
  private bestBidAmt: number;

  private bestAsk: number;
  private bestAskAmt: number;

  constructor(pairInfo: PairInfo) {
    this.symbol = pairInfo.symbol;

    this.baseAsset = pairInfo.baseAsset;
    this.quoteAsset = pairInfo.quoteAsset;
    this.lotSize = pairInfo.lotSize;
    this.minNotional = pairInfo.minNotional;

    this.bestBid = 0;
    this.bestBidAmt = 0;
    this.bestAsk = 0;
    this.bestAskAmt = 0;
  }

  get sellPrice() {
    return this.bestBid;
  }

  get sellRate() {
    return this.sellPrice;
  }

  get sellLiquidity() {
    return this.bestBidAmt;
  }

  get buyPrice() {
    return this.bestAsk;
  }

  get buyRate() {
    return 1 / this.buyPrice;
  }

  get buyLiquidity() {
    return this.bestAskAmt;
  }

  baseToQuote(baseAmt: number) {
    return floorDecimals(baseAmt * this.sellRate);
  }

  quoteToBase(quoteAmt: number) {
    return floorDecimals(quoteAmt * this.buyRate);
  }

  get isEnabled() {
    return this.bestBid && this.bestBidAmt && this.bestAsk && this.bestAskAmt;
  }

  updateFromWSTick(tick: BookTickerWSMessage) {
    Object.assign(this, {
      bestBid: parseFloat(tick.b),
      bestBidAmt: parseFloat(tick.B),
      bestAsk: parseFloat(tick.a),
      bestAskAmt: parseFloat(tick.A),
    });
  }

  updateFromAPITick(tick: BookTickerApiPair) {
    Object.assign(this, {
      bestBid: parseFloat(tick.bidPrice),
      bestBidAmt: parseFloat(tick.bidQty),
      bestAsk: parseFloat(tick.askPrice),
      bestAskAmt: parseFloat(tick.askPriceQty),
    });
  }
}

export default Pair;

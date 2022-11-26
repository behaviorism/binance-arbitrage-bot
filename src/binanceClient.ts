// @ts-ignore
import { Spot } from "@binance/connector";
import Pair from "./pair";
import { BookTickerWSMessage, Pairs } from "./types";

class BinanceClient {
  inner: Spot;
  pairs: Pairs;

  bookTickerWS: {} | undefined;

  constructor(...args: Parameters<typeof Spot>) {
    this.inner = new Spot(...args);
    this.pairs = new Map();
  }

  async init() {
    try {
      await this.setupPairs();
      await this.fetchBooks();
    } catch (err: any) {
      throw new Error(`client error: ${err.message}`);
    }
  }

  initBookTicker(cb: (msg: Pair) => void) {
    const handleMessage = (msg: string) => {
      const tick = JSON.parse(msg) as BookTickerWSMessage;
      const pair = this.pairs.get(tick.s);

      if (pair) {
        pair.updateFromWSTick(tick);
        cb(pair);
      }
    };

    return new Promise<void>((resolve) => {
      this.bookTickerWS = this.inner.bookTickerWS(null, {
        open: () => {
          console.log("started book ticker");
          resolve();
        },
        error: (err: any) => console.log(`book ticker error: ${err.message}`),
        message: handleMessage,
        close: () => this.cleanup(),
      });
    });
  }

  getMidsPairs(pair: Pair, fiatSymbol: string) {
    // If pair includes the fiat, search for all other pairs
    // that can be traded with the other token
    if (pair.symbol.includes(fiatSymbol)) {
      const pairs = Array.from(this.pairs.values());
      const nonFiatToken = pair.symbol.split(fiatSymbol)[0]!;

      return pairs.filter((somePair) => {
        return somePair.isEnabled && somePair.symbol.includes(nonFiatToken);
      });
    } else if (pair.isEnabled) {
      // If pair doesn't include fiat, it is THE only mid pair affected
      return [pair];
    }

    return [];
  }

  getFiatPairs(
    { baseAsset, quoteAsset }: Pair,
    fiatSymbol: string
  ): [Pair | undefined, Pair | undefined] {
    return [
      this.pairs.get(`${baseAsset}${fiatSymbol}`),
      this.pairs.get(`${quoteAsset}${fiatSymbol}`),
    ];
  }

  cleanup() {
    if (this.bookTickerWS) {
      this.inner.unsubscribe(this.bookTickerWS);
    }
  }

  private async setupPairs() {
    const {
      data: { symbols },
    } = await this.inner.exchangeInfo();

    for (let sym of symbols) {
      this.pairs.set(
        sym.symbol,
        new Pair({
          symbol: sym.symbol,
          baseAsset: sym.baseAsset,
          quoteAsset: sym.quoteAsset,
          lotSize: parseFloat(sym.filters[2]!.minQty),
          minNotional: parseFloat(sym.filters[3]!.minNotional),
        })
      );
    }
  }

  private async fetchBooks() {
    const { data } = await this.inner.bookTicker();

    for (let tick of data) {
      let pair = this.pairs.get(tick.s);

      if (pair) {
        pair.updateFromAPITick(tick);
      }
    }
  }
}

export default BinanceClient;

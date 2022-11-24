import { loadConfig } from "./config";
// @ts-ignore
import { Spot } from "@binance/connector";
import {
  BookTickerWSMessage,
  Config,
  Pair,
  PairBookTick,
  Pairs,
} from "./types";
import {
  apiTickToPair,
  floorDecimals,
  fmtNumber,
  isPairEnabled,
  wsTickToPair,
} from "./utils";

class ArbitrageBot {
  config: Config;
  client: Spot;

  bookTickerWS: any;
  pairs: Pairs = new Map();

  constructor(config: Config) {
    this.config = config;
    this.client = new Spot(config.api_key, config.secret_key, {
      // baseURL: "https://testnet.binance.vision",
    });
  }

  async init() {
    try {
      await this.setupPairs();
      await this.fetchBooks();
      await this.initBookTicker();
    } catch {
      this.cleanup();
    }
  }

  async setupPairs() {
    const {
      data: { symbols },
    } = await this.client.exchangeInfo();

    for (let sym of symbols) {
      this.pairs.set(sym.symbol, {
        baseAsset: sym.baseAsset,
        quoteAsset: sym.quoteAsset,
        lotSize: parseFloat(sym.filters[2]!.minQty),
        minNotional: parseFloat(sym.filters[3]!.minNotional),
      } as any);
    }
  }

  async fetchBooks() {
    const { data } = await this.client.bookTicker();

    for (let tick of data) {
      this.updatePair(tick.s, apiTickToPair(tick));
    }
  }

  updatePair(symbol: string, info: PairBookTick) {
    const oldPair = this.pairs.get(symbol);

    if (oldPair) {
      const newPair = { ...oldPair, ...info };
      this.pairs.set(symbol, newPair);
      return newPair;
    }

    return;
  }

  initBookTicker() {
    return new Promise<void>((resolve) => {
      this.bookTickerWS = this.client.bookTickerWS(null, {
        open: () => {
          console.log("started book ticker");
          resolve();
        },
        error: (err: any) => console.log(`book ticker error: ${err.message}`),
        message: (msg: string) => this.handleBookTicker(JSON.parse(msg)),
        close: () => this.cleanup(),
      });
    });
  }

  handleBookTicker(tick: BookTickerWSMessage) {
    const newPair = this.updatePair(tick.s, wsTickToPair(tick));

    if (!newPair) {
      return;
    }

    for (let baseToQuote of this.getMidsPairs(newPair)) {
      let [baseToFiat, quoteToFiat] = this.getFiatPairs(baseToQuote);

      if (!(isPairEnabled(baseToFiat) && isPairEnabled(quoteToFiat))) {
        continue;
      }

      let [directReturn, indirectReturn] = this.calcReturns(
        baseToFiat,
        baseToQuote,
        quoteToFiat
      );

      if (directReturn > this.config.profit_threshold) {
        let maxFiat = this.calcDirectMaxFiat(
          baseToFiat,
          baseToQuote,
          quoteToFiat
        );

        console.log(
          `found direct arbitrage opportunity for ${
            baseToQuote.symbol
          } | Return: ${fmtNumber(
            directReturn * 100
          )}% | Liquidity: ${fmtNumber(maxFiat)} USDT`
        );

        this.directArbitrage(baseToFiat, baseToQuote, quoteToFiat);
      } else if (indirectReturn > this.config.profit_threshold) {
        let maxFiat = this.calcIndirectMaxFiat(
          baseToFiat,
          baseToQuote,
          quoteToFiat
        );

        console.log(
          `found indirect arbitrage opportunity for ${
            baseToQuote.symbol
          } | Return: ${fmtNumber(
            indirectReturn * 100
          )}% | Liquidity: ${fmtNumber(maxFiat)} USDT`
        );
      }
    }
  }

  getMidsPairs(pair: Pair) {
    if (pair.symbol.includes("USDT")) {
      return Array.from(this.pairs.values()).filter(
        (pair) =>
          pair.symbol.includes(pair.symbol.split("USDT")[0]!) &&
          isPairEnabled(pair)
      );
    } else if (isPairEnabled(pair)) {
      return [pair];
    }

    return [];
  }

  getFiatPairs({ baseAsset, quoteAsset }: Pair): [Pair, Pair] {
    return [
      this.pairs.get(`${baseAsset}USDT`)!,
      this.pairs.get(`${quoteAsset}USDT`)!,
    ];
  }

  calcReturns(
    baseToFiat: Pair,
    baseToQuote: Pair,
    quoteToFiat: Pair
  ): [number, number] {
    return [
      this.calcDirectReturn(baseToFiat, baseToQuote, quoteToFiat),
      this.calcIndirectReturn(baseToFiat, baseToQuote, quoteToFiat),
    ];
  }

  calcDirectReturn(baseToFiat: Pair, baseToQuote: Pair, quoteToFiat: Pair) {
    return (
      (1 / baseToFiat.bestAsk) * // USDT -- buy --> BASE
        baseToQuote.bestBid * // BASE -- sell --> QUOTE
        quoteToFiat.bestBid * // QUOTE -- sell --> USDT
        (1 - this.config.transaction_fees) ** 3 - // fees for every transaction
      1
    );
  }

  calcIndirectReturn(baseToFiat: Pair, baseToQuote: Pair, quoteToFiat: Pair) {
    return (
      (1 / quoteToFiat.bestAsk) * // USDT -- buy --> QUOTE
        (1 / baseToQuote.bestAsk) * // QUOTE -- buy --> BASE
        baseToFiat.bestBid * // BASE -- sell --> USDT
        (1 - this.config.transaction_fees) ** 3 - // fees for every transaction
      1
    );
  }

  calcDirectMaxFiat(baseToFiat: Pair, baseToQuote: Pair, quoteToFiat: Pair) {
    // max USDT spent quick buying base
    const maxFiatToBuyBase =
      baseToFiat.bestAskAmt *
      baseToFiat.bestAsk *
      (1 - this.config.transaction_fees);
    // max USDT spent quick selling base
    const maxFiatToSellBase =
      baseToQuote.bestBidAmt *
      baseToFiat.bestAsk *
      (1 - this.config.transaction_fees) ** 2;
    // max USDT spent quick selling quote
    const maxFiatToSellQuote =
      quoteToFiat.bestBidAmt *
      (1 / baseToQuote.bestBidAmt) *
      baseToFiat.bestAsk *
      (1 - this.config.transaction_fees) ** 3;

    return Math.min(maxFiatToBuyBase, maxFiatToSellBase, maxFiatToSellQuote);
  }

  calcIndirectMaxFiat(baseToFiat: Pair, baseToQuote: Pair, quoteToFiat: Pair) {
    // max USDT spent quick buying quote
    const maxFiatToBuyQuote =
      quoteToFiat.bestAskAmt *
      quoteToFiat.bestAsk *
      (1 - this.config.transaction_fees);
    // max USDT spent quick buying base
    const maxFiatToBuyBase =
      baseToFiat.bestAskAmt *
      (1 / baseToQuote.bestAsk) *
      (1 / quoteToFiat.bestAsk) *
      (1 - this.config.transaction_fees) ** 2;
    // max USDT spent quick selling base
    const maxFiatToSellBase =
      baseToFiat.bestBidAmt *
      (1 / baseToQuote.bestAsk) *
      (1 / quoteToFiat.bestAsk) *
      (1 - this.config.transaction_fees) ** 3;

    return Math.min(maxFiatToBuyQuote, maxFiatToBuyBase, maxFiatToSellBase);
  }

  async directArbitrage(
    baseToFiat: Pair,
    baseToQuote: Pair,
    quoteToFiat: Pair,
    fiatAmt: number = 10
  ) {
    try {
      const baseAmtOut = floorDecimals(fiatAmt * (1 / baseToFiat.bestAsk), 8);
      let res = await this.client.newOrder(baseToFiat.symbol, "BUY", "LIMIT", {
        price: baseToFiat.bestAsk.toString(),
        quantity: baseAmtOut,
        timeInForce: "FOK",
      });
      console.log(res);

      const baseAmtIn = floorDecimals(
        baseAmtOut * (1 - this.config.transaction_fees)
      );
      await this.client.newOrder(baseToQuote.symbol, "SELL", "LIMIT", {
        price: baseToQuote.bestBid.toString(),
        quantity: baseAmtIn.toString(),
        timeInForce: "FOK",
      });

      const quoteAmtIn = floorDecimals(
        baseAmtIn * baseToQuote.bestBid * (1 - this.config.transaction_fees)
      );
      await this.client.newOrder(quoteToFiat.symbol, "SELL", "LIMIT", {
        price: quoteToFiat.bestBid.toString(),
        quantity: quoteAmtIn.toString(),
        timeInForce: "FOK",
      });
    } catch (err: any) {
      console.log(
        `error while executing transactions: ${err.response.data.msg}`
      );
    }
  }

  cleanup() {
    this.client.unsubscribe(this.bookTickerWS);
  }
}

const init = async () => {
  const config = await loadConfig();
  await new ArbitrageBot(config).init();
};

init().catch((err) => console.log(`panicked due to error: ${err.message}`));

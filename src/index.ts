import { Config, loadConfig } from "./config";
import { fmtNumber } from "./utils";
import https from "https";
import BinanceClient from "./binanceClient";
import Pair from "./pair";
import { createOrders } from "./orders";

class ArbitrageBot {
  config: Config;
  client: BinanceClient;

  locked: boolean;

  constructor(config: Config) {
    this.config = config;
    this.client = new BinanceClient(config.api_key, config.secret_key, {
      httpsAgent: new https.Agent({ keepAlive: true }),
      // baseURL: "https://testnet.binance.vision",
    });
    this.locked = false;
  }

  async init() {
    try {
      await this.client.init();
      await this.client.initBookTicker(async (msg) => {
        if (!this.locked) {
          this.locked = true;
          await this.handleBookTicker(msg);
          this.locked = false;
        }
      });
    } catch (err) {
      this.client.cleanup();
      throw err;
    }
  }

  async handleBookTicker(newPair: Pair) {
    const mids = this.client.getMidsPairs(newPair, this.config.fiat_symbol);

    for (let baseToQuote of mids) {
      let [baseToFiat, quoteToFiat] = this.client.getFiatPairs(
        baseToQuote,
        this.config.fiat_symbol
      );

      if (!(baseToFiat?.isEnabled && quoteToFiat?.isEnabled)) {
        continue;
      }

      let [directReturn, indirectReturn] = this.calcReturns(
        baseToFiat,
        baseToQuote,
        quoteToFiat
      );

      if (directReturn >= this.config.profit_threshold) {
        console.log(
          baseToFiat.buyPrice,
          baseToQuote.sellPrice,
          quoteToFiat.sellPrice
        );

        let maxFiat = this.calcDirectMaxFiat(
          baseToFiat,
          baseToQuote,
          quoteToFiat
        );

        console.log(
          `[DIRECT][${baseToQuote.symbol}]: RETURN: ${fmtNumber(
            directReturn * 100
          )}% | LIQUIDITY: ${fmtNumber(maxFiat)} ${this.config.fiat_symbol}`
        );

        await this.executeArbitrage(
          baseToFiat,
          baseToQuote,
          quoteToFiat,
          maxFiat,
          true
        );
        break;
      } else if (indirectReturn >= this.config.profit_threshold) {
        console.log(
          baseToFiat.sellPrice,
          baseToQuote.buyPrice,
          quoteToFiat.buyPrice
        );

        let maxFiat = this.calcIndirectMaxFiat(
          baseToFiat,
          baseToQuote,
          quoteToFiat
        );

        console.log(
          `[INDIRECT][${baseToQuote.symbol}]: RETURN: ${fmtNumber(
            indirectReturn * 100
          )}% | LIQUIDITY: ${fmtNumber(maxFiat)} ${this.config.fiat_symbol}`
        );

        await this.executeArbitrage(
          baseToFiat,
          baseToQuote,
          quoteToFiat,
          maxFiat,
          false
        );
        break;
      }
    }
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
    const conversion = quoteToFiat.baseToQuote(
      baseToQuote.baseToQuote(baseToFiat.quoteToBase(1))
    );
    const fees = (1 - this.config.transaction_fees) ** 3;

    return conversion * fees - 1;
  }

  calcIndirectReturn(baseToFiat: Pair, baseToQuote: Pair, quoteToFiat: Pair) {
    const conversion = baseToFiat.baseToQuote(
      baseToQuote.quoteToBase(quoteToFiat.quoteToBase(1))
    );
    const fees = (1 - this.config.transaction_fees) ** 3;

    return conversion * fees - 1;
  }

  calcDirectMaxFiat(baseToFiat: Pair, baseToQuote: Pair, quoteToFiat: Pair) {
    // max FIAT spendable buying base of mid pair
    const maxBuyableBaseVal = baseToFiat.buyLiquidity / baseToFiat.buyRate;
    // max FIAT spendable buying base of mid pair and selling it for quote of mid pair
    const maxSellableBaseVal =
      baseToQuote.sellLiquidity / // tradable base for quote
      (1 - this.config.transaction_fees) / // out base
      baseToFiat.buyRate; // buy base
    // max FIAT spendable buying base of mid pair, selling it for quote of mid pair and selling it (quote of mid pair) for fiat
    const maxSellableQuoteVal =
      quoteToFiat.sellLiquidity / // sellable quote
      (1 - this.config.transaction_fees) / // out quote
      baseToQuote.sellRate / // sell base
      (1 - this.config.transaction_fees) / // out base
      baseToFiat.buyRate; // buy base

    return Math.min(maxBuyableBaseVal, maxSellableBaseVal, maxSellableQuoteVal);
  }

  calcIndirectMaxFiat(baseToFiat: Pair, baseToQuote: Pair, quoteToFiat: Pair) {
    // max FIAT spendable buying quote of mid pair
    const maxBuyableQuoteVal = quoteToFiat.buyLiquidity / quoteToFiat.buyRate;
    // max FIAT spendable buying quote of mid pair and using it to buy base of mid pair
    const maxSellableQuoteVal =
      baseToQuote.buyLiquidity / // tradable quote for base
      baseToQuote.buyRate / // buy base
      (1 - this.config.transaction_fees) / // out quote
      quoteToFiat.buyRate; // buy quote
    // max FIAT spendable buying quote if mid pair, using it to buy base of mid pair and selling it (base of mid pair) for fiat
    const maxSellableBaseVal =
      baseToFiat.sellLiquidity / // sellable quote
      (1 - this.config.transaction_fees); // out quote
    baseToQuote.buyRate / // buy base
      (1 - this.config.transaction_fees) / // out quote
      quoteToFiat.buyRate; // buy quote

    return Math.min(
      maxBuyableQuoteVal,
      maxSellableQuoteVal,
      maxSellableBaseVal
    );
  }

  async executeArbitrage(
    baseToFiat: Pair,
    baseToQuote: Pair,
    quoteToFiat: Pair,
    fiatAmt: number,
    direct: boolean
  ) {
    if (fiatAmt > 30) {
      fiatAmt = 30;
    }

    try {
      const orders = createOrders(
        baseToFiat,
        baseToQuote,
        quoteToFiat,
        fiatAmt,
        direct,
        this.config.transaction_fees
      );

      let res = await this.client.inner
        .newOrder(...orders.firstOrder())
        .catch(orderError(1));

      if (res.data.status === "EXPIRED") {
        console.log(
          `[${baseToQuote.symbol}][TRANSACTION-1]: transaction failed`
        );
        return;
      }

      // Check after first order if arbitrage is still available.
      // Otherwise, reverse first transaction
      if (
        direct
          ? this.calcDirectReturn(baseToFiat, baseToQuote, quoteToFiat)
          : this.calcIndirectReturn(baseToFiat, baseToQuote, quoteToFiat) <
            this.config.profit_threshold
      ) {
        console.log(
          `[${baseToQuote.symbol}]: arbitrage opportunity consumed. Reversing...`
        );
        await this.client.inner
          .newOrder(...orders.firstFalloutOrder())
          .catch(orderError(1, true));
        return;
      }

      res = await this.client.inner
        .newOrder(...orders.secondOrder())
        .catch(orderError(2));

      if (res.data.status === "EXPIRED") {
        console.log(
          `[${baseToQuote.symbol}][TRANSACTION-2]: transaction failed. Reversing...`
        );
        await this.client.inner
          .newOrder(...orders.firstFalloutOrder())
          .catch(orderError(2, true));
        return;
      }

      await this.client.inner
        .newOrder(...orders.thirdOrder())
        .catch(orderError(3));

      console.log(`[${baseToQuote.symbol}]: completed arbitrage`);
    } catch (err: any) {
      console.log(`[${baseToQuote.symbol}]${err.message}`);
    }
  }
}

const orderError = (transactionN: number, fallout?: boolean) => (err: any) => {
  throw new Error(
    `[${fallout ? "FALLOUT-" : ""}TRANSACTION-${transactionN}]: ${
      err.response.data.msg || err.message
    }`
  );
};

const init = async () => {
  const config = await loadConfig();
  await new ArbitrageBot(config).init();
};

init().catch((err) => console.log(`panicked due to error: ${err.message}`));

import Pair from "./pair";
import { matchDecimalPlaces } from "./utils";

export const createOrders = (
  baseToFiat: Pair,
  baseToQuote: Pair,
  quoteToFiat: Pair,
  fiatAmt: number,
  direct: boolean,
  transactionFees: number
) => {
  let firstQty: number | null = null;
  let secondQty: number | null = null;

  return {
    firstOrder: () => {
      firstQty = firstQuantity(baseToFiat, quoteToFiat, fiatAmt, direct);
      return firstOrder(baseToFiat, quoteToFiat, firstQty, direct);
    },
    firstFalloutOrder: () => {
      if (!firstQty) {
        throw new Error("orders error: first order not called");
      }

      return firstFalloutOrder(
        baseToFiat,
        quoteToFiat,
        firstQty,
        direct,
        transactionFees
      );
    },
    secondOrder: () => {
      if (!firstQty) {
        throw new Error("orders error: first order not called");
      }

      secondQty = secondQuantity(
        baseToQuote,
        firstQty,
        direct,
        transactionFees
      );
      return secondOrder(baseToQuote, secondQty, direct);
    },
    thirdOrder: () => {
      if (!secondQty) {
        throw new Error("orders error: second order not called");
      }

      return thirdOrder(
        baseToFiat,
        quoteToFiat,
        thirdQuantity(
          baseToFiat,
          baseToQuote,
          quoteToFiat,
          secondQty,
          direct,
          transactionFees
        ),
        direct
      );
    },
  };
};

const firstQuantity = (
  baseToFiat: Pair,
  quoteToFiat: Pair,
  fiatAmt: number,
  direct: boolean
) => {
  const pair = direct ? baseToFiat : quoteToFiat;
  return matchDecimalPlaces(pair.lotSize, pair.quoteToBase(fiatAmt));
};

const firstOrder = (
  baseToFiat: Pair,
  quoteToFiat: Pair,
  firstQuantity: number,
  direct: boolean
) => {
  const pair = direct ? baseToFiat : quoteToFiat;

  return [
    pair.symbol,
    "BUY",
    "LIMIT",
    {
      price: pair.buyPrice.toString(),
      quantity: firstQuantity,
      timeInForce: "FOK",
    },
  ];
};

const firstFalloutOrder = (
  baseToFiat: Pair,
  quoteToFiat: Pair,
  firstQuantity: number,
  direct: boolean,
  transactionFees: number
) => {
  const pair = direct ? baseToFiat : quoteToFiat;

  return [
    pair.symbol,
    "SELL",
    "MARKET",
    {
      quantity: matchDecimalPlaces(
        pair.lotSize,
        firstQuantity * (1 - transactionFees)
      ),
    },
  ];
};

const secondQuantity = (
  baseToQuote: Pair,
  firstQuantity: number,
  direct: boolean,
  transactionFees: number
) => {
  if (direct) {
    return matchDecimalPlaces(
      baseToQuote.lotSize,
      firstQuantity * (1 - transactionFees)
    );
  }

  return matchDecimalPlaces(
    baseToQuote.lotSize,
    baseToQuote.quoteToBase(firstQuantity * (1 - transactionFees))
  );
};

const secondOrder = (
  baseToQuote: Pair,
  secondQuantity: number,
  direct: boolean
) => {
  if (direct) {
    return [
      baseToQuote.symbol,
      "SELL",
      "LIMIT",
      {
        price: baseToQuote.sellPrice.toString(),
        quantity: secondQuantity,
        timeInForce: "FOK",
      },
    ];
  }

  return [
    baseToQuote.symbol,
    "BUY",
    "LIMIT",
    {
      price: baseToQuote.buyPrice.toString(),
      quantity: secondQuantity,
      timeInForce: "FOK",
    },
  ];
};

const thirdQuantity = (
  baseToFiat: Pair,
  baseToQuote: Pair,
  quoteToFiat: Pair,
  secondQuantity: number,
  direct: boolean,
  transactionFees: number
) => {
  if (direct) {
    return matchDecimalPlaces(
      quoteToFiat.lotSize,
      baseToQuote.baseToQuote(secondQuantity) * (1 - transactionFees)
    );
  }

  return matchDecimalPlaces(
    baseToFiat.lotSize,
    secondQuantity * (1 - transactionFees)
  );
};

const thirdOrder = (
  baseToFiat: Pair,
  quoteToFiat: Pair,
  thirdQuantity: number,
  direct: boolean
) => {
  const pair = direct ? quoteToFiat : baseToFiat;

  return [
    pair.symbol,
    "SELL",
    "MARKET",
    {
      // price: quoteToFiat.sellPrice.toString(),
      quantity: thirdQuantity,
      // timeInForce: "FOK",
    },
  ];
};

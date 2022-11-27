export const matchDecimalPlaces = (numToCopy: number, otherNum: number) => {
  const maybeSplit = numToCopy.toString().split(".");

  let decimals = 0;

  if (maybeSplit.length > 1) {
    decimals = maybeSplit[1]!.length;
  }

  return floorDecimals(otherNum, decimals);
};

export const floorDecimals = (num: number, decimals: number = 8) =>
  Math.floor(num * 10 ** decimals) / 10 ** decimals;

export const fmtNumber = (num: number) => num.toFixed(8);

export const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

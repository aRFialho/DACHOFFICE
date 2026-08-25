import { assertMoney, type Money } from "@dachbyte-office/finance";

export const MONEY_SCALE = 10_000n;
export const PERCENT_SCALE = 100n * MONEY_SCALE;

export function toScaled(value: Money): bigint {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const scaled = BigInt(`${whole}${fraction.padEnd(4, "0")}`);
  return negative ? -scaled : scaled;
}

export function toMoney(value: bigint, field: string): Money {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / MONEY_SCALE;
  const fraction = (absolute % MONEY_SCALE).toString().padStart(4, "0");
  return assertMoney(`${negative ? "-" : ""}${whole}.${fraction}`, field);
}

export function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const negative = (numerator < 0n) !== (denominator < 0n);
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;
  const quotient = absoluteNumerator / absoluteDenominator;
  const remainder = absoluteNumerator % absoluteDenominator;
  const rounded =
    remainder * 2n >= absoluteDenominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

export function ceilDivide(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("decimal denominator must be positive");
  if (numerator < 0n) throw new Error("decimal numerator must be non-negative");
  return (numerator + denominator - 1n) / denominator;
}

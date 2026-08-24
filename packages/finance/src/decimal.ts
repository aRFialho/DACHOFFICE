import { assertMoney, type Money } from "./contracts.js";

export const MONEY_SCALE = 10_000n;

export function toScaled(value: Money): bigint {
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const digits = `${whole ?? "0"}${fraction.padEnd(4, "0")}`;
  const scaled = BigInt(digits);
  return value.startsWith("-") ? -scaled : scaled;
}

export function toMoney(value: bigint, field: string): Money {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / MONEY_SCALE;
  const fraction = (absolute % MONEY_SCALE).toString().padStart(4, "0");
  return assertMoney(`${negative ? "-" : ""}${whole}.${fraction}`, field);
}

export function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const normalizedNumerator = denominator < 0n ? -numerator : numerator;
  const normalizedDenominator = denominator < 0n ? -denominator : denominator;
  const negative = normalizedNumerator < 0n;
  const absoluteNumerator = negative
    ? -normalizedNumerator
    : normalizedNumerator;
  const quotient = absoluteNumerator / normalizedDenominator;
  const remainder = absoluteNumerator % normalizedDenominator;
  const rounded =
    remainder * 2n >= normalizedDenominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

export function percentageOfMoney(
  revenue: Money,
  percentage: Money,
  field: string,
): Money {
  return toMoney(
    roundHalfUp(toScaled(revenue) * toScaled(percentage), 100n * MONEY_SCALE),
    field,
  );
}

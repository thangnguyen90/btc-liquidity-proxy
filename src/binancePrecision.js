export const BINANCE_SCIENTIFIC_STEP_PRECISION_VERSION = 'BINANCE_SCIENTIFIC_STEP_PRECISION_V1_20260810';

export function decimalsFromStep(stepSize) {
  const numeric = Number(stepSize);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;

  const text = String(stepSize).trim().toLowerCase();
  const scientific = text.match(/^([+-]?\d+)(?:\.(\d+))?e([+-]?\d+)$/);
  if (scientific) {
    const fractionDigits = scientific[2]?.length ?? 0;
    const exponent = Number(scientific[3]);
    return Math.max(0, fractionDigits - exponent);
  }

  const dot = text.indexOf('.');
  if (dot < 0) return 0;
  return text.slice(dot + 1).replace(/0+$/, '').length;
}

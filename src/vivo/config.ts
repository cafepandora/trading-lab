// Qué corre en vivo. Cambiar algo aquí y hacer push lo publica; para que una
// estrategia o moneda nueva cuente desde cero, usar "Empezar de cero" en el panel.

import { AJUSTES } from '../backtest';

/**
 * Las monedas de la prueba con datos pasados de Binance (resultados/binance-15-monedas.json).
 * HYPE quedó fuera: en Binance solo tiene unas semanas de historia.
 */
export const MONEDAS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB', 'AVAX', 'LINK', 'LTC', 'ADA', 'SUI', 'AAVE', 'DOT', 'NEAR'];

export const TEMPORALIDADES: Record<string, number> = { '4h': 4, '1d': 24 };

/**
 * Cada estrategia tiene su propia cuenta virtual que opera todas las monedas.
 * La primera es la candidata; las otras están para comparar.
 */
export const ESTRATEGIAS_VIVO = ['soldados', 'triple', 'tendencia', 'confluencia'];

export const VIVO = {
  ...AJUSTES,
  /** Velas que se bajan por serie para calcular indicadores (la media de 200 necesita historia). */
  velasHistoria: 600,
  /** Series que se procesan por ciclo (así cada ciclo es corto). */
  seriesPorCiclo: 3,
  /** Operaciones cerradas que hacen falta antes de sacar conclusiones. */
  operacionesParaDecidir: 30,
};

export const serieDe = (moneda: string, tf: string) => `${moneda} ${tf}`;
export const SERIES = MONEDAS.flatMap((m) => Object.keys(TEMPORALIDADES).map((tf) => ({ serie: serieDe(m, tf), moneda: m, tf, horas: TEMPORALIDADES[tf] })));

/** Inicio de la última vela ya cerrada (con 30 s de margen para que Hyperliquid la cierre). */
export function ultimaCerrada(horas: number, ahora: number): number {
  const ms = horas * 3600_000;
  return Math.floor((ahora - 30_000) / ms) * ms - ms;
}

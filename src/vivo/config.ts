// Qué corre en vivo. Cambiar algo aquí y hacer push lo publica; para que una
// simulación nueva cuente desde cero, subir VERSION en simulacion.ts o usar
// "Empezar de cero" en el panel.

import { AJUSTES } from '../backtest';
import type { Costos } from '../posicion';
import { TODAS } from '../variantes';
import traders from './traders.json';

/**
 * Las monedas de la prueba con datos pasados de Binance (resultados/binance-15-monedas.json).
 * HYPE quedó fuera: en Binance solo tiene unas semanas de historia.
 */
export const MONEDAS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB', 'AVAX', 'LINK', 'LTC', 'ADA', 'SUI', 'AAVE', 'DOT', 'NEAR'];

export const TEMPORALIDADES: Record<string, number> = { '4h': 4, '1d': 24 };

/** Reglas de una cuenta: plata, riesgo por operación, tope de todo lo abierto y costos. */
export interface AjustesCuenta extends Costos {
  capital: number;
  riesgo: number;
  apalancamientoMax: number;
  ordenMinima: number;
}

export const AJUSTES_CUENTA: AjustesCuenta = {
  capital: AJUSTES.capital,
  riesgo: AJUSTES.riesgo,
  apalancamientoMax: AJUSTES.apalancamientoMax,
  ordenMinima: AJUSTES.ordenMinima,
  comision: AJUSTES.comision,
  desliz: AJUSTES.desliz,
  deslizStop: AJUSTES.deslizStop,
  fundingHora: AJUSTES.fundingHora,
};

export interface Simulacion {
  id: string;
  nombre: string;
  tipo: 'estrategia' | 'copia' | 'referencia';
  /** Estrategia del laboratorio (solo tipo 'estrategia'). */
  estrategia?: string;
  /** Temporalidades que opera (por defecto 4h y diaria). */
  temporalidades?: string[];
  /** Billetera de Hyperliquid que copia (solo tipo 'copia'). */
  direccion?: string;
  ajustes?: Partial<AjustesCuenta>;
  /** Por qué está (se muestra en el panel). */
  nota?: string;
  alElegir?: Record<string, unknown>;
}

/** La estrategia y las reglas del bot con dinero real (src/vivo/real/). */
export const BOT_REAL = {
  estrategia: 'cruce-20-50-compras',
  temporalidad: '4h',
  capital: 50,
  /**
   * 0,5% de lo que vale por operación. Con los precios de 2018 a 2026, arriesgar
   * más NO hizo crecer más la cuenta: las monedas caen juntas y las posiciones
   * grandes abren huecos que tardan años en llenarse (resultados/probabilidades.json).
   */
  riesgo: 0.005,
  /** En spot no hay apalancamiento: nunca más de lo que hay en la cuenta. */
  apalancamientoMax: 1,
  /** Binance pide órdenes de al menos 5 USDT en spot. */
  ordenMinima: 5,
  /** Comisión de Binance spot por orden (0,075% pagando con BNB). */
  comision: 0.001,
  /** Si la cuenta baja de esto (perder 60% de los 50), vende todo y se apaga. */
  pisoUsd: 20,
};

/**
 * Todas las simulaciones en papel. Cada una es una cuenta aparte.
 * La primera es la candidata principal.
 */
export const SIMULACIONES: Simulacion[] = [
  {
    id: 'espejo-real', nombre: 'Igual que el bot real (cruce 20/50, solo compras, spot)', tipo: 'estrategia', estrategia: BOT_REAL.estrategia,
    temporalidades: [BOT_REAL.temporalidad],
    ajustes: { capital: BOT_REAL.capital, riesgo: BOT_REAL.riesgo, apalancamientoMax: BOT_REAL.apalancamientoMax, ordenMinima: BOT_REAL.ordenMinima, comision: BOT_REAL.comision, fundingHora: 0 },
    nota: 'Las mismas reglas y la misma plata que el bot con dinero real: sirve para comparar lo real con lo simulado.',
  },
  // Las 35 estrategias del laboratorio, cada una con 500 USD virtuales.
  ...TODAS.map((e): Simulacion => ({ id: e.id, nombre: e.nombre, tipo: 'estrategia', estrategia: e.id })),
  // Copias en papel de traders de Hyperliquid con años ganando (npm run traders).
  ...(traders as { id: string; nombre: string; direccion: string; alElegir: Record<string, unknown> }[]).map((t): Simulacion => ({
    id: t.id, nombre: t.nombre, tipo: 'copia', direccion: t.direccion, alElegir: t.alElegir,
    nota: 'Copia en papel: cada 30 segundos mira las posiciones del trader y hace lo mismo en proporción (tope 2x, frenos de pérdida).',
  })),
  { id: 'BTC', nombre: 'Solo guardar Bitcoin', tipo: 'referencia', nota: 'Compra Bitcoin el primer día y no hace nada más: la vara para medir.' },
];

export function ajustesDe(s: Simulacion): AjustesCuenta {
  return { ...AJUSTES_CUENTA, ...s.ajustes };
}

export const VIVO = {
  ...AJUSTES,
  /** Velas que se bajan por serie para calcular indicadores (la media de 200 necesita historia). */
  velasHistoria: 600,
  /** Series que se procesan por ciclo (así cada ciclo es corto aunque haya muchas simulaciones). */
  seriesPorCiclo: 2,
  /** Cada cuánto se guardan los valores aunque nada haya cambiado. */
  guardarCadaMs: 10 * 60_000,
  /** Operaciones cerradas que hacen falta antes de sacar conclusiones. */
  operacionesParaDecidir: 30,
};

export const serieDe = (moneda: string, tf: string) => `${moneda} ${tf}`;
export const SERIES = MONEDAS.flatMap((m) => Object.keys(TEMPORALIDADES).map((tf) => ({ serie: serieDe(m, tf), moneda: m, tf, horas: TEMPORALIDADES[tf] })));

/** Inicio de la última vela ya cerrada (con 30 s de margen para que Binance la cierre). */
export function ultimaCerrada(horas: number, ahora: number): number {
  const ms = horas * 3600_000;
  return Math.floor((ahora - 30_000) / ms) * ms - ms;
}

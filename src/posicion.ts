// Cómo se abre, se cuida y se cierra una posición. Lo usan igual la prueba
// con datos pasados (backtest.ts) y la simulación en vivo (vivo/), para que
// lo que se mide en una sea exactamente lo que pasa en la otra.

import type { Senal } from './estrategias';
import type { Vela } from './indicadores';

export interface Costos {
  comision: number;
  desliz: number;
  deslizStop: number;
  /** Funding por hora sobre lo abierto: lo pagan las compras, lo cobran las ventas. */
  fundingHora: number;
}

export interface Abierta {
  lado: 1 | -1;
  entrada: number;
  stop: number;
  objetivo: number;
  tam: number;
  maxVelas: number;
  /** Plata en juego entre la entrada y el stop (1R). */
  arriesgado: number;
  /** Comisión de entrada y funding ya cobrados (negativo = costo). */
  acumulado: number;
  /** Velas que ya pasaron con la posición abierta. */
  velas: number;
}

export type MotivoSalida = 'stop' | 'objetivo' | 'tiempo' | 'fin';

/**
 * Prepara la entrada a la apertura de la vela siguiente a la señal.
 * Devuelve null si el precio ya pasó el stop o el objetivo.
 * `tamMax` pone el tope de tamaño (apalancamiento, plata disponible).
 */
export function abrir(s: Senal, apertura: number, riesgoPlata: number, tamMax: number, c: Costos): Abierta | null {
  const entrada = apertura * (1 + s.lado * c.desliz);
  const distancia = s.lado * (entrada - s.stop);
  if (distancia <= 0) return null;
  const objetivo = s.objetivo ?? entrada + s.lado * (s.rr ?? 2) * distancia;
  if (s.lado * (objetivo - entrada) <= 0) return null;
  const tam = Math.min(riesgoPlata / distancia, tamMax);
  if (!(tam > 0)) return null;
  const comision = c.comision * tam * entrada;
  return {
    lado: s.lado, entrada, stop: s.stop, objetivo, tam,
    maxVelas: s.maxVelas ?? Infinity, arriesgado: tam * distancia, acumulado: -comision, velas: 0,
  };
}

/** Funding de una vela; devuelve lo que se pagó (positivo) o cobró (negativo). */
export function cobrarFunding(p: Abierta, v: Vela, horas: number, c: Costos): number {
  const pago = p.lado * p.tam * v.o * c.fundingHora * horas;
  p.acumulado -= pago;
  return pago;
}

/**
 * Revisa una vela cerrada: ¿tocó el stop, el objetivo, o se acabó el tiempo?
 * Si tocó stop y objetivo en la misma vela, cuenta el stop (el peor caso).
 */
export function revisarSalida(p: Abierta, v: Vela, c: Costos): { precio: number; por: MotivoSalida } | null {
  p.velas += 1;
  if (p.lado === 1 && v.l <= p.stop) return { precio: Math.min(v.o, p.stop) * (1 - c.deslizStop), por: 'stop' };
  if (p.lado === -1 && v.h >= p.stop) return { precio: Math.max(v.o, p.stop) * (1 + c.deslizStop), por: 'stop' };
  if (p.lado === 1 && v.h >= p.objetivo) return { precio: Math.max(v.o, p.objetivo) * (1 - c.desliz), por: 'objetivo' };
  if (p.lado === -1 && v.l <= p.objetivo) return { precio: Math.min(v.o, p.objetivo) * (1 + c.desliz), por: 'objetivo' };
  if (p.velas >= p.maxVelas) return { precio: v.c * (1 - p.lado * c.desliz), por: 'tiempo' };
  return null;
}

/** Cierra: devuelve la plata que vuelve a la caja y el resultado total. */
export function cerrar(p: Abierta, precio: number, c: Costos) {
  const bruto = p.lado * p.tam * (precio - p.entrada);
  const comision = c.comision * p.tam * precio;
  const pnl = p.acumulado + bruto - comision;
  return { aCaja: bruto - comision, pnl, r: pnl / p.arriesgado, comision };
}

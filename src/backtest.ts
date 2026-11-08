// La prueba con datos pasados: recorre las velas una por una, como si fuera
// en vivo.
// - La señal se mira al cierre de una vela y se entra a la apertura de la siguiente.
// - Tamaño: se arriesga un % fijo de la cuenta entre la entrada y el stop,
//   sin pasar del tope de apalancamiento.
// - Se cobran comisión, deslizamiento y funding (ver posicion.ts).

import type { Contexto, Estrategia } from './estrategias';
import { abrir, cerrar, cobrarFunding, revisarSalida, type Abierta, type Costos, type MotivoSalida } from './posicion';

export interface Ajustes extends Costos {
  capital: number;
  riesgo: number;
  apalancamientoMax: number;
  /** Hyperliquid no acepta órdenes de menos de 10 USD: esas señales se saltan. */
  ordenMinima: number;
  horasPorVela: number;
  inicio: number;
}

export const AJUSTES: Omit<Ajustes, 'horasPorVela'> = {
  capital: 500,
  riesgo: 0.01,
  apalancamientoMax: 2,
  ordenMinima: 10,
  comision: 0.0005, // Binance futuros, orden a mercado (nivel base)
  desliz: 0.0005,
  deslizStop: 0.001,
  fundingHora: 0.0000125,
  inicio: 200,
};

export interface OperacionCerrada {
  lado: 1 | -1;
  tEntrada: number;
  tSalida: number;
  entrada: number;
  salida: number;
  pnl: number;
  /** Resultado en "R": cuántas veces lo arriesgado se ganó (+) o se perdió (−). */
  r: number;
  /** Distancia de la entrada al stop inicial, como fracción del precio (para armar carteras). */
  riesgoPct: number;
  salidaPor: MotivoSalida;
}

export interface Resultado {
  final: number;
  retorno: number;
  anual: number;
  caidaMax: number;
  exposicion: number;
  operaciones: OperacionCerrada[];
}

export function probar(ctx: Contexto, est: Estrategia, aj: Ajustes): Resultado {
  const vs = ctx.velas;
  const memoria = new Set<string>();
  const ops: OperacionCerrada[] = [];
  let caja = aj.capital, pico = caja, caidaMax = 0, enPosicion = 0;
  let pos: (Abierta & { desde: number; tEntrada: number }) | null = null;

  const salir = (i: number, precio: number, por: MotivoSalida) => {
    const p = pos!;
    const c = cerrar(p, precio, aj);
    caja += c.aCaja;
    ops.push({ lado: p.lado, tEntrada: p.tEntrada, tSalida: vs[i].t, entrada: p.entrada, salida: precio, pnl: c.pnl, r: c.r, riesgoPct: p.arriesgado / (p.tam * p.entrada), salidaPor: por });
    pos = null;
  };

  for (let i = aj.inicio; i < vs.length; i++) {
    const v = vs[i];
    if (pos && i >= pos.desde) {
      enPosicion++;
      caja -= cobrarFunding(pos, v, aj.horasPorVela, aj);
      const s = revisarSalida(pos, v, aj);
      if (s) salir(i, s.precio, s.por);
      else if (est.nuevoStop) pos.stop = est.nuevoStop(ctx, i, pos.lado, pos.stop);
    }

    const valor = caja + (pos && i >= pos.desde ? pos.lado * pos.tam * (v.c - pos.entrada) : 0);
    pico = Math.max(pico, valor);
    caidaMax = Math.max(caidaMax, (pico - valor) / pico);

    if (!pos && i < vs.length - 1 && caja > 0) {
      const s = est.senal(ctx, i, memoria);
      if (!s) continue;
      const apertura = vs[i + 1].o;
      const p = abrir(s, apertura, caja * aj.riesgo, (aj.apalancamientoMax * caja) / apertura, aj);
      if (!p || p.tam * apertura < aj.ordenMinima) continue;
      caja += p.acumulado; // comisión de entrada
      pos = { ...p, desde: i + 1, tEntrada: vs[i + 1].t };
    }
  }
  if (pos) salir(vs.length - 1, vs[vs.length - 1].c, 'fin');

  const anios = (vs[vs.length - 1].t - vs[aj.inicio].t) / (365.25 * 86400_000);
  return {
    final: caja,
    retorno: caja / aj.capital - 1,
    anual: caja > 0 ? (caja / aj.capital) ** (1 / anios) - 1 : -1,
    caidaMax,
    exposicion: enPosicion / (vs.length - aj.inicio),
    operaciones: ops,
  };
}

/** Comprar al principio y guardar (spot, sin funding). */
export function comprarYGuardar(ctx: Contexto, aj: Ajustes): Resultado {
  const vs = ctx.velas;
  const entrada = vs[aj.inicio].o * (1 + aj.desliz), salida = vs[vs.length - 1].c;
  const final = aj.capital * (1 - aj.comision) ** 2 * (salida / entrada);
  let pico = 0, caidaMax = 0;
  for (let i = aj.inicio; i < vs.length; i++) {
    pico = Math.max(pico, vs[i].c);
    caidaMax = Math.max(caidaMax, (pico - vs[i].c) / pico);
  }
  const anios = (vs[vs.length - 1].t - vs[aj.inicio].t) / (365.25 * 86400_000);
  return { final, retorno: final / aj.capital - 1, anual: (final / aj.capital) ** (1 / anios) - 1, caidaMax, exposicion: 1, operaciones: [] };
}

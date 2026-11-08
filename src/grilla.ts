// Bot de grilla ("grid") de spot, como el que ofrece Binance: un rango
// alrededor del precio, dividido en escalones. Cada escalón compra cuando
// el precio baja hasta él y vende cuando sube al siguiente: muchas
// ganancias pequeñas. El riesgo escondido: si el precio sale del rango por
// abajo, queda con todas las monedas compradas más caras; si sale por
// arriba, ya vendió todo y no gana más.
//
// Cada `dias` se cierra todo al precio del momento y se arma un rango nuevo.

import type { Vela } from './indicadores';

export interface OpcionesGrilla {
  capital: number;
  /** Ancho del rango hacia cada lado (0,1 = ±10% del precio al armarlo). */
  rango: number;
  niveles: number;
  dias: number;
  /** Comisión de las órdenes límite de la grilla (maker). */
  comision: number;
  /** Comisión al armar y al cerrar cada rango (a mercado). */
  comisionMercado: number;
}

export interface ResultadoGrilla {
  final: number;
  retorno: number;
  anual: number;
  caidaMax: number;
  /** Compras y ventas completadas (cada una gana un escalón). */
  vueltas: number;
  gananciaVueltas: number;
  /** Pérdida o ganancia de las monedas que quedaron al cerrar cada rango. */
  resultadoInventario: number;
  fueraDelRango: number;
}

interface Celda {
  abajo: number;
  arriba: number;
  /** Plata disponible (si espera comprar) o 0. */
  plata: number;
  /** Monedas (si espera vender) o 0. */
  monedas: number;
  costo: number;
}

export function simularGrilla(velas: Vela[], o: OpcionesGrilla): ResultadoGrilla {
  const msVentana = o.dias * 86400_000;
  let capital = o.capital, pico = capital, caidaMax = 0;
  let vueltas = 0, gananciaVueltas = 0, resultadoInventario = 0, velasFuera = 0;
  let i = 0;
  while (i < velas.length) {
    const inicio = velas[i].t;
    const p0 = velas[i].o;
    const bajo = p0 * (1 - o.rango), alto = p0 * (1 + o.rango);
    const paso = (alto / bajo) ** (1 / o.niveles);
    const porCelda = capital / o.niveles;
    const celdas: Celda[] = [];
    for (let k = 0; k < o.niveles; k++) {
      const abajo = bajo * paso ** k, arriba = abajo * paso;
      // Las celdas arriba del precio empiezan con monedas (compradas a mercado al armar).
      if (abajo >= p0) celdas.push({ abajo, arriba, plata: 0, monedas: (porCelda * (1 - o.comisionMercado)) / p0, costo: porCelda });
      else celdas.push({ abajo, arriba, plata: porCelda, monedas: 0, costo: 0 });
    }
    const valor = (precio: number) => celdas.reduce((s, c) => s + c.plata + c.monedas * precio, 0);
    const mover = (desde: number, hasta: number) => {
      for (const c of celdas) {
        if (hasta < desde && c.plata > 0 && c.abajo <= desde && c.abajo >= hasta) {
          c.monedas = (c.plata * (1 - o.comision)) / c.abajo;
          c.costo = c.plata;
          c.plata = 0;
        } else if (hasta > desde && c.monedas > 0 && c.arriba >= desde && c.arriba <= hasta) {
          c.plata = c.monedas * c.arriba * (1 - o.comision);
          vueltas += 1;
          gananciaVueltas += c.plata - c.costo;
          c.monedas = 0;
          c.costo = 0;
        }
      }
    };
    let j = i;
    for (; j < velas.length && velas[j].t < inicio + msVentana; j++) {
      const v = velas[j];
      // Camino dentro de la vela: si cerró arriba, primero bajó y luego subió.
      const camino = v.c >= v.o ? [v.o, v.l, v.h, v.c] : [v.o, v.h, v.l, v.c];
      for (let k = 1; k < camino.length; k++) mover(camino[k - 1], camino[k]);
      if (v.c < bajo || v.c > alto) velasFuera++;
      const ahora = valor(v.c);
      pico = Math.max(pico, ahora);
      caidaMax = Math.max(caidaMax, (pico - ahora) / pico);
    }
    // Cierre del rango: vende lo que quedó al precio del momento.
    const ultimo = velas[j - 1].c;
    for (const c of celdas) {
      if (c.monedas > 0) {
        const venta = c.monedas * ultimo * (1 - o.comisionMercado);
        resultadoInventario += venta - c.costo;
        c.plata = venta;
        c.monedas = 0;
      }
    }
    capital = celdas.reduce((s, c) => s + c.plata, 0);
    pico = Math.max(pico, capital);
    caidaMax = Math.max(caidaMax, (pico - capital) / pico);
    i = j;
  }
  const anios = (velas[velas.length - 1].t - velas[0].t) / (365.25 * 86400_000);
  return {
    final: capital,
    retorno: capital / o.capital - 1,
    anual: (capital / o.capital) ** (1 / anios) - 1,
    caidaMax,
    vueltas,
    gananciaVueltas,
    resultadoInventario,
    fueraDelRango: velasFuera / velas.length,
  };
}

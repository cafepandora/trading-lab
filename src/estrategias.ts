// Las estrategias, con reglas exactas (las mismas para todas las monedas y
// temporalidades, sin "afinarlas" mirando los resultados). Cada una mira la
// vela i al cierre y, si ve su señal, dice lado, stop y objetivo; la entrada
// es a la apertura de la vela siguiente.

import type { Pivote, Vela } from './indicadores';
import { envolvente, estrella, martilloOEstrellaFugaz, patronDeGiro, tresSoldadosOCuervos } from './velas';

export interface Contexto {
  velas: Vela[];
  atr: number[];
  ema200: number[];
  pivotes: Pivote[];
  /** Cuántos pivotes están confirmados al cierre de cada vela. */
  confirmadosHasta: number[];
}

export interface Senal {
  lado: 1 | -1;
  stop: number;
  /** Objetivo fijo, o `rr` veces lo arriesgado. */
  objetivo?: number;
  rr?: number;
  maxVelas?: number;
  motivo: string;
}

// Las "claves" de memoria usan la fecha de la vela, no su posición: en vivo
// se trabaja con una ventana de velas que se va corriendo, y así una misma
// figura nunca se opera dos veces.
export interface Estrategia {
  id: string;
  nombre: string;
  grupo: 'Fibonacci' | 'Figuras' | 'Elliott' | 'Velas' | 'Combinada' | 'Comparación';
  explicacion: string;
  senal(ctx: Contexto, i: number, memoria: Set<string>): Senal | null;
  /** Para salidas que acompañan al precio (seguir la tendencia). */
  nuevoStop?(ctx: Contexto, i: number, lado: 1 | -1, stop: number): number;
}

export function armarContexto(velas: Vela[], atr: number[], ema200: number[], pivotes: Pivote[]): Contexto {
  const confirmadosHasta: number[] = [];
  let k = 0;
  for (let i = 0; i < velas.length; i++) {
    while (k < pivotes.length && pivotes[k].confirmado <= i) k++;
    confirmadosHasta.push(k);
  }
  return { velas, atr, ema200, pivotes, confirmadosHasta };
}

/** Los últimos n pivotes que ya se conocían al cierre de la vela i. */
function ultimos(ctx: Contexto, i: number, n: number): Pivote[] {
  const k = ctx.confirmadosHasta[i];
  return k >= n ? ctx.pivotes.slice(k - n, k) : [];
}

function ultimoDeTipo(ctx: Contexto, i: number, tipo: Pivote['tipo']): Pivote | null {
  for (let k = ctx.confirmadosHasta[i] - 1; k >= 0; k--) if (ctx.pivotes[k].tipo === tipo) return ctx.pivotes[k];
  return null;
}

const alterna = (ps: Pivote[], primero: Pivote['tipo']) =>
  ps.every((p, k) => p.tipo === (k % 2 === 0 ? primero : primero === 'alto' ? 'bajo' : 'alto'));

const cruzaArriba = (vs: Vela[], i: number, nivel: number) => vs[i].c > nivel && vs[i - 1].c <= nivel;
const cruzaAbajo = (vs: Vela[], i: number, nivel: number) => vs[i].c < nivel && vs[i - 1].c >= nivel;

// ── Fibonacci ────────────────────────────────────────────────────────────

interface OpcionesFib {
  /** Zona de entrada, como fracción del impulso (0.5 = 50%). */
  desde: number;
  hasta: number;
  conPatron: boolean;
  conTendencia: boolean;
}

/**
 * Retroceso de Fibonacci: después de un impulso fuerte (al menos 4 ATR desde
 * un valle confirmado hasta el máximo), compra cuando el precio retrocede a
 * la zona y la vela cierra a favor. Stop debajo del valle del impulso;
 * objetivo en la extensión 127,2%. Al revés para ventas.
 */
function senalFib(ctx: Contexto, i: number, mem: Set<string>, o: OpcionesFib): Senal | null {
  const vs = ctx.velas, a = ctx.atr[i];
  for (const lado of [1, -1] as const) {
    const ancla = ultimoDeTipo(ctx, i, lado === 1 ? 'bajo' : 'alto');
    if (!ancla || i - ancla.i < 3) continue;
    // Extremo del impulso desde el ancla hasta la vela anterior.
    let iExt = ancla.i + 1;
    for (let j = ancla.i + 1; j < i; j++) {
      if (lado === 1 ? vs[j].h > vs[iExt].h : vs[j].l < vs[iExt].l) iExt = j;
    }
    const ext = lado === 1 ? vs[iExt].h : vs[iExt].l;
    const R = Math.abs(ext - ancla.precio);
    if (R < 4 * a) continue;
    if (lado === 1 ? vs[i].h >= ext : vs[i].l <= ext) continue; // sigue haciendo extremos: no es retroceso
    const nivel = (f: number) => ext - lado * f * R;
    const zonaCerca = nivel(o.desde), zonaLejos = nivel(o.hasta);
    const invalida = nivel(o.hasta >= 0.78 ? 1 : 0.786);
    let roto = false;
    for (let j = iExt + 1; j < i; j++) if (lado === 1 ? vs[j].c < invalida : vs[j].c > invalida) roto = true;
    if (roto) continue;
    const toco = lado === 1 ? vs[i].l <= zonaCerca : vs[i].h >= zonaCerca;
    const cerroBien = lado === 1 ? vs[i].c >= zonaLejos && vs[i].c > vs[i].o : vs[i].c <= zonaLejos && vs[i].c < vs[i].o;
    if (!toco || !cerroBien) continue;
    if (o.conPatron && patronDeGiro(vs, i, a) !== lado) continue;
    if (o.conTendencia && (lado === 1 ? vs[i].c <= ctx.ema200[i] : vs[i].c >= ctx.ema200[i])) continue;
    const clave = `f${vs[ancla.i].t}-${vs[iExt].t}`;
    if (mem.has(clave)) continue;
    mem.add(clave);
    return {
      lado,
      stop: ancla.precio - lado * 0.1 * a,
      objetivo: ext + lado * 0.272 * R,
      maxVelas: 60,
      motivo: `retroceso a ${Math.round(o.desde * 1000) / 10}–${Math.round(o.hasta * 1000) / 10}%`,
    };
  }
  return null;
}

// ── Figuras de tres picos ───────────────────────────────────────────────

/** Triple suelo (compra al romper la línea de arriba) y triple techo (al revés). */
function senalTriple(ctx: Contexto, i: number, mem: Set<string>): Senal | null {
  const vs = ctx.velas, a = ctx.atr[i];
  for (const lado of [1, -1] as const) {
    const ps = ultimos(ctx, i, 5);
    if (ps.length < 5 || !alterna(ps, lado === 1 ? 'bajo' : 'alto')) continue;
    const extremos = [ps[0], ps[2], ps[4]].map((p) => p.precio);
    const intermedios = [ps[1], ps[3]].map((p) => p.precio);
    if (Math.max(...extremos) - Math.min(...extremos) > 0.75 * a) continue;
    const linea = lado === 1 ? Math.max(...intermedios) : Math.min(...intermedios);
    const fondo = lado === 1 ? Math.min(...extremos) : Math.max(...extremos);
    const altura = Math.abs(linea - fondo);
    if (altura < 1.5 * a || i - ps[4].confirmado > 30) continue;
    if (!(lado === 1 ? cruzaArriba(vs, i, linea) : cruzaAbajo(vs, i, linea))) continue;
    const clave = `t${vs[ps[4].i].t}`;
    if (mem.has(clave)) continue;
    mem.add(clave);
    return { lado, stop: fondo - lado * 0.25 * a, objetivo: linea + lado * altura, maxVelas: 60, motivo: lado === 1 ? 'rompe triple suelo' : 'rompe triple techo' };
  }
  return null;
}

/** Hombro-cabeza-hombro (venta) y su inverso (compra), al romper la línea del cuello. */
function senalHCH(ctx: Contexto, i: number, mem: Set<string>): Senal | null {
  const vs = ctx.velas, a = ctx.atr[i];
  for (const lado of [-1, 1] as const) {
    const ps = ultimos(ctx, i, 5);
    if (ps.length < 5 || !alterna(ps, lado === -1 ? 'alto' : 'bajo')) continue;
    const [h1, c1, cab, c2, h2] = ps;
    const masAlla = (x: number, y: number) => (lado === -1 ? x > y : x < y);
    if (!masAlla(cab.precio, h1.precio + -lado * 0.5 * a) || !masAlla(cab.precio, h2.precio + -lado * 0.5 * a)) continue;
    if (Math.abs(h1.precio - h2.precio) > 1.5 * a || i - h2.confirmado > 40) continue;
    const cuello = (j: number) => c1.precio + ((c2.precio - c1.precio) * (j - c1.i)) / (c2.i - c1.i || 1);
    const rompe = lado === -1 ? vs[i].c < cuello(i) && vs[i - 1].c >= cuello(i - 1) : vs[i].c > cuello(i) && vs[i - 1].c <= cuello(i - 1);
    if (!rompe) continue;
    const clave = `h${vs[h2.i].t}`;
    if (mem.has(clave)) continue;
    mem.add(clave);
    const altura = Math.abs(cab.precio - cuello(cab.i));
    return {
      lado,
      stop: h2.precio - lado * 0.25 * a,
      objetivo: cuello(i) + lado * altura,
      maxVelas: 60,
      motivo: lado === -1 ? 'rompe hombro-cabeza-hombro' : 'rompe hombro-cabeza-hombro invertido',
    };
  }
  return null;
}

// ── Ondas de Elliott ─────────────────────────────────────────────────────

/**
 * Entrar en la onda 3: hubo una onda 1 y una onda 2 que retrocedió entre
 * 38,2% y 78,6% sin pasar el inicio; se entra cuando el precio supera el
 * final de la onda 1. Objetivo: 161,8% de la onda 1 desde el final de la 2.
 */
function senalOnda3(ctx: Contexto, i: number, mem: Set<string>): Senal | null {
  const vs = ctx.velas, a = ctx.atr[i];
  for (const lado of [1, -1] as const) {
    const ps = ultimos(ctx, i, 3);
    if (ps.length < 3 || !alterna(ps, lado === 1 ? 'bajo' : 'alto')) continue;
    const [p0, p1, p2] = ps;
    const w1 = Math.abs(p1.precio - p0.precio);
    const retroceso = Math.abs(p1.precio - p2.precio) / w1;
    if (retroceso < 0.382 || retroceso > 0.786 || i - p2.confirmado > 30) continue;
    if (!(lado === 1 ? cruzaArriba(vs, i, p1.precio) : cruzaAbajo(vs, i, p1.precio))) continue;
    const clave = `o3${vs[p2.i].t}`;
    if (mem.has(clave)) continue;
    mem.add(clave);
    return { lado, stop: p2.precio - lado * 0.1 * a, objetivo: p2.precio + lado * 1.618 * w1, maxVelas: 60, motivo: 'empieza la onda 3' };
  }
  return null;
}

/**
 * Corrección después de 5 ondas: un impulso completo de 5 ondas que cumple
 * las reglas de Elliott (la 2 no pasa el inicio, la 3 no es la más corta,
 * la 4 no se monta en la 1). Al confirmarse el final de la 5, opera la
 * corrección; objetivo: el final de la onda 4.
 */
function senalCincoOndas(ctx: Contexto, i: number, mem: Set<string>): Senal | null {
  const a = ctx.atr[i];
  for (const impulso of [1, -1] as const) {
    const ps = ultimos(ctx, i, 6);
    if (ps.length < 6 || !alterna(ps, impulso === 1 ? 'bajo' : 'alto')) continue;
    const [p0, p1, p2, p3, p4, p5] = ps.map((p) => p.precio * impulso);
    if (ps[5].confirmado !== i) continue;
    const w1 = p1 - p0, w3 = p3 - p2, w5 = p5 - p4;
    const reglas = p2 > p0 && p3 > p1 && p4 > p1 && p5 > p3 && !(w3 < w1 && w3 < w5);
    if (!reglas) continue;
    const clave = `o5${ctx.velas[ps[5].i].t}`;
    if (mem.has(clave)) continue;
    mem.add(clave);
    const lado = -impulso as 1 | -1;
    return { lado, stop: ps[5].precio - lado * 0.25 * a, objetivo: ps[4].precio, maxVelas: 60, motivo: 'corrección tras 5 ondas' };
  }
  return null;
}

// ── Velas japonesas (a favor de la tendencia de 200 velas) ──────────────

function deVelas(detector: (vs: Vela[], i: number, a: number) => number, largo: number, nombre: string) {
  return (ctx: Contexto, i: number): Senal | null => {
    const s = detector(ctx.velas, i, ctx.atr[i]);
    if (!s || i < 200) return null;
    if (s === 1 ? ctx.velas[i].c <= ctx.ema200[i] : ctx.velas[i].c >= ctx.ema200[i]) return null;
    const patron = ctx.velas.slice(i - largo + 1, i + 1);
    const stop = s === 1 ? Math.min(...patron.map((v) => v.l)) - 0.1 * ctx.atr[i] : Math.max(...patron.map((v) => v.h)) + 0.1 * ctx.atr[i];
    return { lado: s as 1 | -1, stop, rr: 2, maxVelas: 30, motivo: nombre };
  };
}

// ── Comparaciones ─────────────────────────────────────────────────────────

/** Seguir la tendencia (canal de Donchian): compra al superar el máximo de 55 velas; sale al perder el mínimo de 20. */
function senalTendencia(ctx: Contexto, i: number): Senal | null {
  if (i < 56) return null;
  const vs = ctx.velas;
  const previas = vs.slice(i - 55, i);
  const max = Math.max(...previas.map((v) => v.h)), min = Math.min(...previas.map((v) => v.l));
  const ultimas20 = vs.slice(i - 19, i + 1);
  if (vs[i].c > max) return { lado: 1, stop: Math.min(...ultimas20.map((v) => v.l)), objetivo: Infinity, motivo: 'máximo de 55 velas' };
  if (vs[i].c < min) return { lado: -1, stop: Math.max(...ultimas20.map((v) => v.h)), objetivo: -Infinity, motivo: 'mínimo de 55 velas' };
  return null;
}

function stopTendencia(ctx: Contexto, i: number, lado: 1 | -1, stop: number) {
  const ultimas20 = ctx.velas.slice(Math.max(0, i - 19), i + 1);
  return lado === 1 ? Math.max(stop, Math.min(...ultimas20.map((v) => v.l))) : Math.min(stop, Math.max(...ultimas20.map((v) => v.h)));
}

/** Entrada al azar con las mismas salidas que las velas: la prueba de "¿le gana a una moneda al aire?". */
export function estrategiaAzar(semilla: number): Estrategia {
  let x = semilla >>> 0 || 1;
  const azar = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  return {
    id: 'azar', nombre: 'Entrada al azar', grupo: 'Comparación',
    explicacion: 'Entra en un momento y lado al azar, con stop a 1,5 ATR y objetivo a 2 veces lo arriesgado.',
    senal(ctx, i) {
      if (i < 200 || azar() > 0.05) return null;
      const lado = azar() < 0.5 ? 1 : -1;
      return { lado, stop: ctx.velas[i].c - lado * 1.5 * ctx.atr[i], rr: 2, maxVelas: 30, motivo: 'al azar' };
    },
  };
}

export const ESTRATEGIAS: Estrategia[] = [
  {
    id: 'fib-50-618', nombre: 'Fibonacci 50–61,8%', grupo: 'Fibonacci',
    explicacion: 'Tras un impulso de 4+ ATR, entra cuando el precio retrocede a la zona 50–61,8% y la vela cierra a favor. Stop bajo el inicio del impulso, objetivo en la extensión 127,2%.',
    senal: (c, i, m) => senalFib(c, i, m, { desde: 0.5, hasta: 0.618, conPatron: false, conTendencia: false }),
  },
  {
    id: 'fib-618-786', nombre: 'Fibonacci 61,8–78,6% (retroceso profundo)', grupo: 'Fibonacci',
    explicacion: 'Igual, pero esperando un retroceso más hondo, a la zona 61,8–78,6%.',
    senal: (c, i, m) => senalFib(c, i, m, { desde: 0.618, hasta: 0.786, conPatron: false, conTendencia: false }),
  },
  {
    id: 'triple', nombre: 'Triple techo / triple suelo', grupo: 'Figuras',
    explicacion: 'Tres picos (o valles) a la misma altura; entra al romper la línea entre ellos. Objetivo: la altura de la figura.',
    senal: senalTriple,
  },
  {
    id: 'hch', nombre: 'Hombro-cabeza-hombro', grupo: 'Figuras',
    explicacion: 'Tres picos con el del medio más alto; entra al romper la línea del cuello. Objetivo: la altura de la cabeza.',
    senal: senalHCH,
  },
  {
    id: 'onda3', nombre: 'Elliott: entrar en la onda 3', grupo: 'Elliott',
    explicacion: 'Onda 1 y onda 2 (retroceso 38,2–78,6%); entra al superar el final de la onda 1. Objetivo: 161,8% de la onda 1.',
    senal: senalOnda3,
  },
  {
    id: 'onda5', nombre: 'Elliott: corrección tras 5 ondas', grupo: 'Elliott',
    explicacion: 'Impulso completo de 5 ondas que cumple las reglas; opera la corrección hasta el final de la onda 4.',
    senal: senalCincoOndas,
  },
  { id: 'envolvente', nombre: 'Velas: envolvente', grupo: 'Velas', explicacion: 'Envolvente a favor de la tendencia (media de 200 velas). Stop en el extremo del patrón, objetivo 2 veces lo arriesgado.', senal: deVelas((vs, i) => envolvente(vs, i), 2, 'envolvente') },
  { id: 'martillo', nombre: 'Velas: martillo / estrella fugaz', grupo: 'Velas', explicacion: 'Martillo o estrella fugaz en un extremo de 5 velas, a favor de la tendencia.', senal: deVelas((vs, i) => martilloOEstrellaFugaz(vs, i), 1, 'martillo / estrella fugaz') },
  { id: 'estrella', nombre: 'Velas: estrella de la mañana / tarde', grupo: 'Velas', explicacion: 'Patrón de 3 velas de giro, a favor de la tendencia.', senal: deVelas(estrella, 3, 'estrella') },
  { id: 'soldados', nombre: 'Velas: tres soldados / tres cuervos', grupo: 'Velas', explicacion: 'Tres velas fuertes seguidas en el mismo sentido, a favor de la tendencia.', senal: deVelas(tresSoldadosOCuervos, 3, 'tres soldados / cuervos') },
  {
    id: 'confluencia', nombre: 'Todo junto: Fibonacci + vela + tendencia', grupo: 'Combinada',
    explicacion: 'Retroceso a la zona 50–78,6% de Fibonacci, con un patrón de vela de giro y a favor de la media de 200 velas.',
    senal: (c, i, m) => senalFib(c, i, m, { desde: 0.5, hasta: 0.786, conPatron: true, conTendencia: true }),
  },
  {
    id: 'tendencia', nombre: 'Seguir la tendencia (Donchian 55/20)', grupo: 'Comparación',
    explicacion: 'La estrategia de tendencia más clásica: compra al superar el máximo de 55 velas y sale al perder el mínimo de 20 (y al revés).',
    senal: senalTendencia, nuevoStop: stopTendencia,
  },
];

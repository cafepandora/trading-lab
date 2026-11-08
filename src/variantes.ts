// Más estrategias para el sistema: variantes de las que mejor salieron
// (tres soldados, seguir la tendencia) y familias clásicas que no se habían
// probado (cruce de medias, reversión con RSI, bandas de Bollinger).
//
// Son muchas a propósito: el sistema (scripts/sistema.mjs) escoge entre
// todas usando SOLO datos pasados, y se mide en el periodo siguiente, que no
// vio. Así lo que se mide es el método de elegir, no la suerte de haber
// mirado los resultados.

import { ESTRATEGIAS, type Contexto, type Estrategia, type Senal } from './estrategias';
import { ema } from './indicadores';
import { tresSoldadosOCuervos } from './velas';

// ── Indicadores (se calculan una vez por serie y se guardan) ────────────

function guardado(ctx: Contexto, clave: string, calcular: () => number[]): number[] {
  ctx.cache ??= new Map();
  let v = ctx.cache.get(clave);
  if (!v) {
    v = calcular();
    ctx.cache.set(clave, v);
  }
  return v;
}

const cierres = (ctx: Contexto) => ctx.velas.map((v) => v.c);
const mediaExp = (ctx: Contexto, n: number) => guardado(ctx, `ema${n}`, () => ema(cierres(ctx), n));

/** RSI de Wilder. */
function rsi(ctx: Contexto, n: number) {
  return guardado(ctx, `rsi${n}`, () => {
    const c = cierres(ctx);
    const out = new Array<number>(c.length).fill(50);
    let sube = 0, baja = 0;
    for (let i = 1; i < c.length; i++) {
      const d = c[i] - c[i - 1];
      const s = Math.max(d, 0), b = Math.max(-d, 0);
      if (i <= n) {
        sube += s / n;
        baja += b / n;
      } else {
        sube = (sube * (n - 1) + s) / n;
        baja = (baja * (n - 1) + b) / n;
      }
      if (i >= n) out[i] = baja === 0 ? 100 : 100 - 100 / (1 + sube / baja);
    }
    return out;
  });
}

/** Media simple y desviación de las últimas n velas. */
function bandas(ctx: Contexto, n: number) {
  const media = guardado(ctx, `sma${n}`, () => {
    const c = cierres(ctx);
    return c.map((_, i) => (i < n - 1 ? c[i] : c.slice(i - n + 1, i + 1).reduce((s, x) => s + x, 0) / n));
  });
  const desv = guardado(ctx, `std${n}`, () => {
    const c = cierres(ctx);
    return c.map((_, i) => {
      if (i < n - 1) return 0;
      const ventana = c.slice(i - n + 1, i + 1);
      return Math.sqrt(ventana.reduce((s, x) => s + (x - media[i]) ** 2, 0) / n);
    });
  });
  return { media, desv };
}

const maxAlto = (ctx: Contexto, desde: number, hasta: number) => {
  let m = -Infinity;
  for (let j = Math.max(0, desde); j <= hasta; j++) m = Math.max(m, ctx.velas[j].h);
  return m;
};
const minBajo = (ctx: Contexto, desde: number, hasta: number) => {
  let m = Infinity;
  for (let j = Math.max(0, desde); j <= hasta; j++) m = Math.min(m, ctx.velas[j].l);
  return m;
};

/** Salida por señal: un stop "infinito" hace que se salga a la apertura de la vela siguiente. */
const salirYa = (lado: 1 | -1) => (lado === 1 ? Infinity : -Infinity);

const nombreLado = (soloCompras: boolean) => (soloCompras ? ', solo compras' : '');

// ── Familias ─────────────────────────────────────────────────────────────

/** Tres soldados / tres cuervos con otro filtro de tendencia u otro objetivo. */
function soldados(media: number, rr: number): Estrategia {
  return {
    id: `soldados-${media ? 'm' + media : 'sin'}-${rr}r`,
    nombre: `Tres soldados / cuervos (${media ? 'media ' + media : 'sin filtro'}, objetivo ${String(rr).replace('.', ',')}R)`,
    grupo: 'Velas',
    explicacion: `Tres velas fuertes seguidas${media ? `, a favor de la media de ${media} velas` : ''}; objetivo ${String(rr).replace('.', ',')} veces lo arriesgado.`,
    senal(ctx, i): Senal | null {
      if (i < 210) return null;
      const s = tresSoldadosOCuervos(ctx.velas, i, ctx.atr[i]) as 0 | 1 | -1;
      if (!s) return null;
      if (media) {
        const m = mediaExp(ctx, media)[i];
        if (s === 1 ? ctx.velas[i].c <= m : ctx.velas[i].c >= m) return null;
      }
      const tres = ctx.velas.slice(i - 2, i + 1);
      const stop = s === 1 ? Math.min(...tres.map((v) => v.l)) - 0.1 * ctx.atr[i] : Math.max(...tres.map((v) => v.h)) + 0.1 * ctx.atr[i];
      return { lado: s, stop, rr, maxVelas: 30, motivo: s === 1 ? 'tres soldados blancos' : 'tres cuervos negros' };
    },
  };
}

/** Ruptura de canal de Donchian: entra al superar el extremo de n velas, sale al perder el de m. */
function donchian(n: number, m: number, soloCompras: boolean): Estrategia {
  return {
    id: `tendencia-${n}-${m}${soloCompras ? '-compras' : ''}`,
    nombre: `Seguir la tendencia (Donchian ${n}/${m}${nombreLado(soloCompras)})`,
    grupo: 'Tendencia',
    explicacion: `Compra al superar el máximo de ${n} velas y sale al perder el mínimo de ${m}${soloCompras ? '' : ' (y al revés para ventas en corto)'}.`,
    senal(ctx, i) {
      if (i < n + 1) return null;
      const c = ctx.velas[i].c;
      if (c > maxAlto(ctx, i - n, i - 1)) return { lado: 1, stop: minBajo(ctx, i - m + 1, i), objetivo: Infinity, motivo: `máximo de ${n} velas` };
      if (!soloCompras && c < minBajo(ctx, i - n, i - 1)) return { lado: -1, stop: maxAlto(ctx, i - m + 1, i), objetivo: -Infinity, motivo: `mínimo de ${n} velas` };
      return null;
    },
    nuevoStop(ctx, i, lado, stop) {
      return lado === 1 ? Math.max(stop, minBajo(ctx, i - m + 1, i)) : Math.min(stop, maxAlto(ctx, i - m + 1, i));
    },
  };
}

/** Cruce de medias: entra cuando la rápida cruza la lenta, sale cuando se cruzan al revés. */
function cruce(rapida: number, lenta: number, soloCompras: boolean): Estrategia {
  return {
    id: `cruce-${rapida}-${lenta}${soloCompras ? '-compras' : ''}`,
    nombre: `Cruce de medias ${rapida}/${lenta}${nombreLado(soloCompras)}`,
    grupo: 'Tendencia',
    explicacion: `Compra cuando la media de ${rapida} velas cruza por encima de la de ${lenta}, y sale cuando cruza de vuelta. Stop de protección a 2,5 ATR.`,
    senal(ctx, i) {
      if (i < lenta + 1) return null;
      const r = mediaExp(ctx, rapida), l = mediaExp(ctx, lenta);
      const c = ctx.velas[i].c, a = ctx.atr[i];
      if (r[i] > l[i] && r[i - 1] <= l[i - 1]) return { lado: 1, stop: c - 2.5 * a, objetivo: Infinity, motivo: `media ${rapida} cruza arriba de la ${lenta}` };
      if (!soloCompras && r[i] < l[i] && r[i - 1] >= l[i - 1]) return { lado: -1, stop: c + 2.5 * a, objetivo: -Infinity, motivo: `media ${rapida} cruza abajo de la ${lenta}` };
      return null;
    },
    nuevoStop(ctx, i, lado, stop) {
      const r = mediaExp(ctx, rapida)[i], l = mediaExp(ctx, lenta)[i];
      return (lado === 1 ? r < l : r > l) ? salirYa(lado) : stop;
    },
  };
}

/** Reversión con RSI: compra un bajón fuerte dentro de una subida (media de 200), sale cuando el RSI pasa de 50. */
function reversionRsi(periodo: number, umbral: number, soloCompras: boolean): Estrategia {
  return {
    id: `rsi-${periodo}-${umbral}${soloCompras ? '-compras' : ''}`,
    nombre: `Reversión RSI(${periodo}) bajo ${umbral}${nombreLado(soloCompras)}`,
    grupo: 'Reversión',
    explicacion: `Compra cuando el RSI de ${periodo} baja de ${umbral} con el precio sobre la media de 200 (un bajón dentro de una subida); sale cuando el RSI pasa de 50 o a las 10 velas.`,
    senal(ctx, i) {
      if (i < 201) return null;
      const x = rsi(ctx, periodo), c = ctx.velas[i].c, a = ctx.atr[i], e = ctx.ema200[i];
      if (x[i] < umbral && x[i - 1] >= umbral && c > e) return { lado: 1, stop: c - 2.5 * a, objetivo: Infinity, maxVelas: 10, motivo: `RSI(${periodo}) bajo ${umbral}` };
      if (!soloCompras && x[i] > 100 - umbral && x[i - 1] <= 100 - umbral && c < e) return { lado: -1, stop: c + 2.5 * a, objetivo: -Infinity, maxVelas: 10, motivo: `RSI(${periodo}) sobre ${100 - umbral}` };
      return null;
    },
    nuevoStop(ctx, i, lado, stop) {
      const x = rsi(ctx, periodo)[i];
      return (lado === 1 ? x > 50 : x < 50) ? salirYa(lado) : stop;
    },
  };
}

/** Bandas de Bollinger: compra cuando cierra bajo la banda de abajo en una subida; objetivo la media. */
function bollinger(soloCompras: boolean): Estrategia {
  return {
    id: `bollinger${soloCompras ? '-compras' : ''}`,
    nombre: `Bandas de Bollinger (20, 2)${nombreLado(soloCompras)}`,
    grupo: 'Reversión',
    explicacion: 'Compra cuando el precio cierra debajo de la banda de abajo (media de 20 menos 2 desviaciones) estando sobre la media de 200; objetivo: la media de 20.',
    senal(ctx, i) {
      if (i < 201) return null;
      const { media, desv } = bandas(ctx, 20);
      const vs = ctx.velas, c = vs[i].c, a = ctx.atr[i], e = ctx.ema200[i];
      const abajo = (j: number) => media[j] - 2 * desv[j], arriba = (j: number) => media[j] + 2 * desv[j];
      if (c < abajo(i) && vs[i - 1].c >= abajo(i - 1) && c > e) return { lado: 1, stop: c - 2 * a, objetivo: media[i], maxVelas: 20, motivo: 'cierra bajo la banda de Bollinger' };
      if (!soloCompras && c > arriba(i) && vs[i - 1].c <= arriba(i - 1) && c < e) return { lado: -1, stop: c + 2 * a, objetivo: media[i], maxVelas: 20, motivo: 'cierra sobre la banda de Bollinger' };
      return null;
    },
  };
}

// ── El universo de estrategias ──────────────────────────────────────────

const generadas: Estrategia[] = [
  ...[0, 100, 200].flatMap((m) => [1.5, 2, 3].map((rr) => soldados(m, rr))),
  ...[[20, 10], [55, 20], [100, 50]].flatMap(([n, m]) => [false, true].map((sc) => donchian(n, m, sc))),
  ...[[20, 50], [50, 200]].flatMap(([r, l]) => [false, true].map((sc) => cruce(r, l, sc))),
  ...[[2, 10], [14, 30]].flatMap(([p, u]) => [false, true].map((sc) => reversionRsi(p, u, sc))),
  bollinger(false),
  bollinger(true),
];

/** Las que repiten exactamente una de las originales (mismas reglas) no se agregan. */
const REPETIDAS: Record<string, string> = { 'soldados-m200-2r': 'soldados', 'tendencia-55-20': 'tendencia' };

export const VARIANTES = generadas.filter((e) => !REPETIDAS[e.id]);

/** Todas las estrategias que el sistema puede elegir. */
export const TODAS: Estrategia[] = [...ESTRATEGIAS, ...VARIANTES];

export function estrategiaPorId(id: string): Estrategia | undefined {
  return TODAS.find((e) => e.id === id);
}

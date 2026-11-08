// Precios y velas de Binance (datos públicos de mercado, sin cuenta ni llave).
// Se usa el mercado spot en USDT (BTCUSDT, ETHUSDT…): sus precios casi no se
// separan de los de futuros, y su servidor de datos públicos no está
// bloqueado por país como los de futuros. Lo usan el laboratorio y la
// simulación en vivo.

import type { Vela } from './indicadores';

/** El servidor de datos públicos primero; si falla, el principal. */
const SERVIDORES = ['https://data-api.binance.vision', 'https://api.binance.com'];

export class ErrorBinance extends Error {
  constructor(mensaje: string, readonly status: number) {
    super(mensaje);
  }
}

export const simbolo = (moneda: string) => `${moneda}USDT`;
const intervalo = (horas: number) => (horas === 24 ? '1d' : `${horas}h`);

async function pedir<T>(ruta: string, params: Record<string, string | number>): Promise<T> {
  const consulta = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  let ultimo: unknown = null;
  for (const base of SERVIDORES) {
    for (let intento = 0; intento < 2; intento++) {
      try {
        const r = await fetch(`${base}${ruta}?${consulta}`);
        if (r.ok) return (await r.json()) as T;
        ultimo = new ErrorBinance(`Binance ${ruta}: HTTP ${r.status}`, r.status);
        // 429/418: pidió esperar. 451/403: bloqueado desde aquí → probar el otro servidor.
        if (r.status === 429 && intento === 0) {
          await new Promise((res) => setTimeout(res, 1500));
          continue;
        }
        break;
      } catch (e) {
        ultimo = e;
        break;
      }
    }
  }
  throw ultimo instanceof Error ? ultimo : new Error('Binance no respondió');
}

type Kline = [number, string, string, string, string, string, number, ...unknown[]];
const aVela = (k: Kline): Vela => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4] });

/** Las últimas `cantidad` velas (hasta 1000; incluye la que se está formando). */
export async function velas(moneda: string, horas: number, cantidad: number): Promise<Vela[]> {
  const ks = await pedir<Kline[]>('/api/v3/klines', { symbol: simbolo(moneda), interval: intervalo(horas), limit: Math.min(cantidad, 1000) });
  return ks.map(aVela);
}

/** Toda la historia disponible, solo velas ya cerradas (para el laboratorio). */
export async function historia(moneda: string, horas: number, ahora = Date.now()): Promise<Vela[]> {
  const out: Vela[] = [];
  let desde = 0;
  for (;;) {
    const ks = await pedir<Kline[]>('/api/v3/klines', { symbol: simbolo(moneda), interval: intervalo(horas), startTime: desde, limit: 1000 });
    for (const k of ks) if (k[6] < ahora) out.push(aVela(k));
    if (ks.length < 1000) break;
    desde = ks[ks.length - 1][0] + 1;
  }
  return out;
}

export interface Precio {
  precio: number;
  /** Cambio en las últimas 24 horas (0,012 = +1,2%). */
  cambio24h: number;
}

/** Precio actual y cambio de 24 horas de varias monedas en una sola consulta. */
export async function precios(monedas: string[]): Promise<Record<string, Precio>> {
  type Mini = { symbol: string; openPrice: string; lastPrice: string };
  const lista = await pedir<Mini[]>('/api/v3/ticker/24hr', { symbols: JSON.stringify(monedas.map(simbolo)), type: 'MINI' });
  const out: Record<string, Precio> = {};
  for (const m of lista) {
    const moneda = m.symbol.replace(/USDT$/, '');
    const precio = Number(m.lastPrice), apertura = Number(m.openPrice);
    if (precio > 0) out[moneda] = { precio, cambio24h: apertura > 0 ? precio / apertura - 1 : 0 };
  }
  return out;
}

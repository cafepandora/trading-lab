// Lectura de datos públicos de Hyperliquid (no necesita llave ni cuenta).

import type { Vela } from '../indicadores';

const API = 'https://api.hyperliquid.xyz/info';

export class ErrorApi extends Error {
  constructor(mensaje: string, readonly status: number) {
    super(mensaje);
  }
}

async function info<T>(cuerpo: Record<string, unknown>, intento = 0): Promise<T> {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  // La API pública limita consultas por IP (y en Cloudflare la IP se comparte):
  // un reintento corto; si vuelve a fallar, se intenta en el próximo ciclo.
  if (r.status === 429 && intento === 0) {
    await new Promise((res) => setTimeout(res, 1500 + Math.random() * 1000));
    return info<T>(cuerpo, 1);
  }
  if (!r.ok) throw new ErrorApi(`Hyperliquid ${cuerpo.type}: HTTP ${r.status}`, r.status);
  return (await r.json()) as T;
}

/** Precio medio de cada moneda del mercado principal de futuros. */
export async function precios(): Promise<Record<string, number>> {
  const crudo = await info<Record<string, string>>({ type: 'allMids' });
  const out: Record<string, number> = {};
  for (const [moneda, px] of Object.entries(crudo)) {
    const n = Number(px);
    if (n > 0 && !/[:/@#]/.test(moneda)) out[moneda] = n;
  }
  return out;
}

/** Las últimas `cantidad` velas (incluye la que todavía se está formando). */
export async function velas(moneda: string, horas: number, cantidad: number, ahora = Date.now()): Promise<Vela[]> {
  const ms = horas * 3600_000;
  type Cruda = { t: number; o: string; h: string; l: string; c: string };
  const crudas = await info<Cruda[]>({
    type: 'candleSnapshot',
    req: { coin: moneda, interval: horas === 24 ? '1d' : `${horas}h`, startTime: ahora - cantidad * ms, endTime: ahora },
  });
  return crudas.map((v) => ({ t: v.t, o: +v.o, h: +v.h, l: +v.l, c: +v.c }));
}

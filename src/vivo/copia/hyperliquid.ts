// Lectura de datos públicos de Hyperliquid (no necesita llave ni cuenta).
// Solo se usa el mercado principal de futuros: las monedas sin ":" (los
// mercados de terceros, como "xyz:NVDA") y el spot ("@123", "PURR/USDC")
// quedan fuera.

import type { ContextoMoneda, EstadoTrader, ResumenTrader } from './tipos';

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

const num = (x: unknown) => Number(x) || 0;
const esPrincipal = (moneda: string) => !moneda.includes(':') && !moneda.includes('/') && !moneda.startsWith('@') && !moneda.startsWith('#');

/** Precio medio de cada moneda del mercado principal. */
export async function precios(): Promise<Record<string, number>> {
  const crudo = await info<Record<string, string>>({ type: 'allMids' });
  const out: Record<string, number> = {};
  for (const [moneda, px] of Object.entries(crudo)) {
    if (esPrincipal(moneda) && num(px) > 0) out[moneda] = num(px);
  }
  return out;
}

/** Funding por hora, volumen del día, precio del oráculo y apalancamiento máximo. */
export async function contextos(): Promise<Record<string, ContextoMoneda>> {
  type Meta = { universe: { name: string; maxLeverage: number; isDelisted?: boolean }[] };
  type Ctx = { funding: string; dayNtlVlm: string; oraclePx: string };
  const [meta, ctxs] = await info<[Meta, Ctx[]]>({ type: 'metaAndAssetCtxs' });
  const out: Record<string, ContextoMoneda> = {};
  meta.universe.forEach((u, i) => {
    const c = ctxs[i];
    if (!c || u.isDelisted) return;
    out[u.name] = {
      funding: num(c.funding),
      volumenDia: num(c.dayNtlVlm),
      oraculo: num(c.oraclePx),
      maxApal: u.maxLeverage || 20,
    };
  });
  return out;
}

/** Posiciones abiertas y valor de la cuenta del trader (mercado principal). */
export async function estadoTrader(direccion: string): Promise<EstadoTrader> {
  type Estado = {
    marginSummary: { accountValue: string };
    assetPositions: { position: { coin: string; szi: string } }[];
    time: number;
  };
  const e = await info<Estado>({ type: 'clearinghouseState', user: direccion });
  const posiciones: Record<string, number> = {};
  for (const { position } of e.assetPositions || []) {
    const tam = num(position.szi);
    if (tam !== 0 && esPrincipal(position.coin)) posiciones[position.coin] = tam;
  }
  return { t: e.time || Date.now(), valorCuenta: num(e.marginSummary?.accountValue), posiciones };
}

/** Ganancia acumulada del trader en futuros (no se mueve con depósitos ni retiros). */
export async function resumenTrader(direccion: string): Promise<ResumenTrader | null> {
  type Serie = { accountValueHistory: [number, string][]; pnlHistory: [number, string][] };
  const p = Object.fromEntries(await info<[string, Serie][]>({ type: 'portfolio', user: direccion }));
  const serie = p.perpAllTime;
  if (!serie?.pnlHistory?.length) return null;
  const [t, pnl] = serie.pnlHistory[serie.pnlHistory.length - 1];
  const valor = serie.accountValueHistory?.[serie.accountValueHistory.length - 1]?.[1];
  return { t, pnl: num(pnl), valor: num(valor) };
}

// Conexión con la cuenta de Binance (spot) para el bot con dinero real.
// Cada consulta va firmada con la llave secreta (HMAC-SHA256), que solo vive
// en los secretos de Cloudflare: nunca está en el código ni sale del servidor.
//
// Lo único que este archivo sabe hacer: leer saldos, comprar y vender a
// mercado, poner/consultar/cancelar la orden de stop. No puede retirar plata
// (y la llave debe crearse sin ese permiso).

export interface Llaves {
  apiKey: string;
  secreto: string;
}

export class ErrorCuenta extends Error {
  constructor(mensaje: string, readonly status: number, readonly codigo: number | null) {
    super(mensaje);
  }
}

export interface OrdenBinance {
  symbol: string;
  orderId: number;
  clientOrderId: string;
  status: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  price?: string;
  stopPrice?: string;
  fills?: { price: string; qty: string; commission: string; commissionAsset: string }[];
}

const SERVIDOR = 'https://api.binance.com';

async function hmacHex(secreto: string, texto: string): Promise<string> {
  const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const firma = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(texto));
  return [...new Uint8Array(firma)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class CuentaBinance {
  /** Diferencia entre el reloj de Binance y el nuestro (se ajusta sola). */
  private desfase = 0;

  constructor(private llaves: Llaves, private servidor = SERVIDOR) {}

  async sincronizarReloj() {
    const r = await fetch(`${this.servidor}/api/v3/time`);
    if (r.ok) this.desfase = (await r.json() as { serverTime: number }).serverTime - Date.now();
  }

  private async firmada<T>(metodo: 'GET' | 'POST' | 'DELETE', ruta: string, params: Record<string, string | number>, intento = 0): Promise<T> {
    const q = new URLSearchParams(Object.entries({ ...params, recvWindow: 10000, timestamp: Date.now() + this.desfase }).map(([k, v]) => [k, String(v)]));
    q.append('signature', await hmacHex(this.llaves.secreto, q.toString()));
    const r = await fetch(`${this.servidor}${ruta}?${q.toString()}`, { method: metodo, headers: { 'X-MBX-APIKEY': this.llaves.apiKey } });
    const texto = await r.text();
    let cuerpo: { code?: number; msg?: string } = {};
    try { cuerpo = JSON.parse(texto); } catch { /* respuesta que no es JSON */ }
    if (r.ok) return cuerpo as T;
    // -1021: el reloj se corrió; se ajusta y se reintenta una vez.
    if (cuerpo.code === -1021 && intento === 0) {
      await this.sincronizarReloj();
      return this.firmada<T>(metodo, ruta, params, 1);
    }
    throw new ErrorCuenta(`Binance ${ruta}: ${cuerpo.msg ?? texto.slice(0, 120) ?? r.status}`, r.status, cuerpo.code ?? null);
  }

  /** Saldos libres y bloqueados por moneda. */
  async saldos(): Promise<Record<string, { libre: number; bloqueado: number }>> {
    const c = await this.firmada<{ balances: { asset: string; free: string; locked: string }[]; canTrade: boolean }>('GET', '/api/v3/account', { omitZeroBalances: 'true' });
    if (c.canTrade === false) throw new ErrorCuenta('La llave no tiene permiso para operar en spot.', 403, null);
    return Object.fromEntries(c.balances.map((b) => [b.asset, { libre: Number(b.free), bloqueado: Number(b.locked) }]));
  }

  /** Compra a mercado gastando `usdt` (Binance calcula la cantidad). */
  comprarMercado(symbol: string, usdt: string, idCliente: string) {
    return this.firmada<OrdenBinance>('POST', '/api/v3/order', { symbol, side: 'BUY', type: 'MARKET', quoteOrderQty: usdt, newClientOrderId: idCliente, newOrderRespType: 'FULL' });
  }

  venderMercado(symbol: string, cantidad: string, idCliente: string) {
    return this.firmada<OrdenBinance>('POST', '/api/v3/order', { symbol, side: 'SELL', type: 'MARKET', quantity: cantidad, newClientOrderId: idCliente, newOrderRespType: 'FULL' });
  }

  /** Orden de stop en Binance: si el precio baja a `disparo`, vende con límite `limite`. Protege aunque el bot esté caído. */
  ponerStop(symbol: string, cantidad: string, disparo: string, limite: string, idCliente: string) {
    return this.firmada<OrdenBinance>('POST', '/api/v3/order', {
      symbol, side: 'SELL', type: 'STOP_LOSS_LIMIT', timeInForce: 'GTC', quantity: cantidad, stopPrice: disparo, price: limite, newClientOrderId: idCliente,
    });
  }

  consultarOrden(symbol: string, params: { orderId?: number; origClientOrderId?: string }) {
    return this.firmada<OrdenBinance>('GET', '/api/v3/order', { symbol, ...params } as Record<string, string | number>);
  }

  cancelarOrden(symbol: string, orderId: number) {
    return this.firmada<OrdenBinance>('DELETE', '/api/v3/order', { symbol, orderId });
  }
}

/** Reglas de cada par en Binance: paso de cantidad, paso de precio, orden mínima. */
export interface ReglasPar {
  paso: number;
  tick: number;
  minimo: number;
}

export async function reglasDe(symbols: string[], servidor = 'https://data-api.binance.vision'): Promise<Record<string, ReglasPar>> {
  const r = await fetch(`${servidor}/api/v3/exchangeInfo?symbols=${encodeURIComponent(JSON.stringify(symbols))}`);
  if (!r.ok) throw new Error(`Binance exchangeInfo: HTTP ${r.status}`);
  type F = { filterType: string; stepSize?: string; tickSize?: string; minNotional?: string };
  const info = await r.json() as { symbols: { symbol: string; filters: F[] }[] };
  const out: Record<string, ReglasPar> = {};
  for (const s of info.symbols) {
    const f = Object.fromEntries(s.filters.map((x) => [x.filterType, x]));
    out[s.symbol] = {
      paso: Number(f.LOT_SIZE?.stepSize ?? 0.00001),
      tick: Number(f.PRICE_FILTER?.tickSize ?? 0.01),
      minimo: Number(f.NOTIONAL?.minNotional ?? f.MIN_NOTIONAL?.minNotional ?? 5),
    };
  }
  return out;
}

/** Redondea hacia abajo a un múltiplo del paso y lo escribe sin notación científica. */
export function alPaso(x: number, paso: number): string {
  const decimales = Math.max(0, Math.round(-Math.log10(paso)));
  const n = Math.floor(x / paso + 1e-9) * paso;
  return n.toFixed(decimales);
}

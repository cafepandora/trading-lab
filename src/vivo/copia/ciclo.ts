// Ciclo de las copias en papel de traders de Hyperliquid (cada 30 segundos):
// lee sus posiciones y las copia en proporción, con el motor de motor.ts
// (probado en pruebas/copia.test.mjs). Usa precios y funding de Hyperliquid,
// que es donde opera el trader.

import * as hl from './hyperliquid';
import { aplicarFunding, cicloCopia } from './motor';
import { PARAMETROS, type ContextoMoneda, type Cuenta, type Evento, type Mercado, type Operacion } from './tipos';

const HORA = 3_600_000;

export interface EstadoCopias {
  contextos: { t: number; contextos: Record<string, ContextoMoneda> } | null;
  ultimaHoraFunding: number;
  ultimaHoraResumen: number;
}

export const estadoCopiasInicial = (ahora: number): EstadoCopias => ({
  contextos: null,
  ultimaHoraFunding: Math.floor(ahora / HORA), // la primera hora no se cobra funding
  ultimaHoraResumen: -1,
});

export async function cicloCopias(cuentas: Cuenta[], estado: EstadoCopias, ahora: number) {
  const operaciones: Operacion[] = [];
  const eventos: Evento[] = [];
  const errores: string[] = [];
  if (!cuentas.length) return { operaciones, eventos, errores, cambio: false, precios: {} as Record<string, number> };

  let precios: Record<string, number>;
  try {
    precios = await hl.precios();
  } catch (e) {
    return { operaciones, eventos, errores: [`precios de Hyperliquid (${(e as Error).message})`], cambio: false, precios: {} as Record<string, number> };
  }
  let cambio = false;
  if (!estado.contextos || ahora - estado.contextos.t > 55 * 60_000) {
    try {
      estado.contextos = { t: ahora, contextos: await hl.contextos() };
      cambio = true;
    } catch (e) {
      errores.push(`funding de Hyperliquid (${(e as Error).message})`);
    }
  }
  const mercado: Mercado = { t: ahora, precios, contextos: estado.contextos?.contextos ?? {} };

  const activas = cuentas.filter((c) => c.direccion && c.estado !== 'detenida');
  const lecturas = await Promise.allSettled(activas.map((c) => hl.estadoTrader(c.direccion!)));
  const traders = new Map(activas.map((c, i) => [c.id, lecturas[i]]));

  const hora = Math.floor(ahora / HORA);
  if (hora !== estado.ultimaHoraFunding && estado.contextos) {
    for (const c of cuentas) aplicarFunding(c, mercado);
    estado.ultimaHoraFunding = hora;
    cambio = true;
  }

  for (const c of cuentas) {
    const lectura = traders.get(c.id);
    const trader = lectura?.status === 'fulfilled' ? lectura.value : null;
    if (lectura?.status === 'rejected') {
      c.errores += 1;
      errores.push(`${c.id} (${(lectura.reason as Error)?.message ?? 'error'})`);
    }
    const r = cicloCopia(c, trader, mercado, PARAMETROS);
    operaciones.push(...r.operaciones);
    eventos.push(...r.eventos);
  }

  // Cada hora: cuánto ganó el trader por su cuenta, para comparar.
  if (hora !== estado.ultimaHoraResumen) {
    const resumenes = await Promise.allSettled(cuentas.map((c) => (c.direccion ? hl.resumenTrader(c.direccion) : Promise.resolve(null))));
    cuentas.forEach((c, i) => {
      const r = resumenes[i];
      if (r.status === 'fulfilled' && r.value) {
        c.traderActual = r.value;
        if (!c.traderInicial) c.traderInicial = r.value;
      }
    });
    estado.ultimaHoraResumen = hora;
    cambio = true;
  }

  return { operaciones, eventos, errores, cambio: cambio || operaciones.length > 0 || eventos.length > 0, precios };
}

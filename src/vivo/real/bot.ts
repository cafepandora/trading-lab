// El bot con dinero real: Binance spot, solo compras, la estrategia de
// BOT_REAL (config.ts) en velas de 4 horas, con un presupuesto fijo.
//
// Reglas de seguridad (no se pueden cambiar desde el panel):
// - Arranca APAGADO. Solo opera si tiene llaves y alguien lo activa.
// - Nunca usa más que su presupuesto (lleva su propia caja), aunque la cuenta
//   de Binance tenga más plata.
// - Solo vende lo que él mismo compró, nunca otras monedas de la cuenta.
// - Cada compra deja puesta en Binance una orden de stop (protege aunque el
//   bot esté caído). Si no se pudo poner, el bot vigila el precio y vende.
// - Si lo que vale (caja + monedas) baja del piso, vende todo y se apaga.
// - Sin apalancamiento, sin ventas en corto, sin retiros.

import type { Contexto, Estrategia } from '../../estrategias';
import { armarContexto } from '../../estrategias';
import { atr, ema, zigzag, type Vela } from '../../indicadores';
import { BOT_REAL, MONEDAS, ultimaCerrada } from '../config';
import { alPaso, ErrorCuenta, type OrdenBinance, type ReglasPar } from './binance-firmado';

export interface PosicionReal {
  moneda: string;
  symbol: string;
  /** Monedas que compró el bot (ya sin la comisión). */
  cantidad: number;
  entrada: number;
  costo: number;
  stop: number;
  ordenStop: number | null;
  tEntrada: number;
  arriesgado: number;
}

export interface EstadoBot {
  version: 1;
  activo: boolean;
  motivo: string | null;
  presupuesto: number;
  caja: number;
  posiciones: Record<string, PosicionReal>;
  /**
   * Sobrantes que quedaron al vender (Binance obliga a redondear la cantidad
   * hacia abajo). Siguen en la cuenta: se valoran y se suman a la próxima compra.
   */
  polvo: Record<string, number>;
  ultimaVela: Record<string, number>;
  memorias: Record<string, string[]>;
  valor: number;
  pico: number;
  caidaMax: number;
  operaciones: number;
  ganadas: number;
  resultado: number;
  comisiones: number;
  activadoEl: number | null;
  saldoUsdt: number | null;
  ultimoCiclo: { t: number; errores: string[] } | null;
}

export interface EventoBot {
  t: number;
  tipo: 'info' | 'orden' | 'error';
  texto: string;
}

export interface OperacionReal {
  tEntrada: number;
  tSalida: number;
  moneda: string;
  cantidad: number;
  entrada: number;
  salida: number;
  resultado: number;
  por: 'stop' | 'senal' | 'piso' | 'manual';
}

/** Lo que el bot necesita del mundo (en las pruebas se reemplaza por un Binance falso). */
export interface Cuenta {
  sincronizarReloj(): Promise<void>;
  saldos(): Promise<Record<string, { libre: number; bloqueado: number }>>;
  comprarMercado(symbol: string, usdt: string, idCliente: string): Promise<OrdenBinance>;
  venderMercado(symbol: string, cantidad: string, idCliente: string): Promise<OrdenBinance>;
  ponerStop(symbol: string, cantidad: string, disparo: string, limite: string, idCliente: string): Promise<OrdenBinance>;
  consultarOrden(symbol: string, params: { orderId?: number; origClientOrderId?: string }): Promise<OrdenBinance>;
  cancelarOrden(symbol: string, orderId: number): Promise<OrdenBinance>;
}

export interface Dependencias {
  cuenta: Cuenta | null;
  estrategia: Estrategia;
  velas(moneda: string, horas: number, cantidad: number): Promise<Vela[]>;
  precios(monedas: string[]): Promise<Record<string, number>>;
  reglas(): Promise<Record<string, ReglasPar>>;
  ahora: number;
}

const HORAS = Number(BOT_REAL.temporalidad.replace('h', ''));
const MONEDAS_POR_CICLO = 2;
const symbolDe = (m: string) => `${m}USDT`;
const fmt = (x: number) => x.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPrecio = (x: number) => '$' + (x >= 1000 ? x.toLocaleString('es-CO', { maximumFractionDigits: 2 }) : x.toLocaleString('es-CO', { maximumSignificantDigits: 5 }));

export function estadoInicial(): EstadoBot {
  return {
    version: 1, activo: false, motivo: null, presupuesto: BOT_REAL.capital, caja: BOT_REAL.capital, posiciones: {}, polvo: {}, ultimaVela: {},
    memorias: {}, valor: BOT_REAL.capital, pico: BOT_REAL.capital, caidaMax: 0, operaciones: 0, ganadas: 0, resultado: 0,
    comisiones: 0, activadoEl: null, saldoUsdt: null, ultimoCiclo: null,
  };
}

function valorDe(e: EstadoBot, precios: Record<string, number>) {
  const enPosiciones = Object.values(e.posiciones).reduce((s, p) => s + p.cantidad * (precios[p.moneda] ?? p.entrada), 0);
  const enPolvo = Object.entries(e.polvo ?? {}).reduce((s, [m, q]) => s + q * (precios[m] ?? 0), 0);
  return e.caja + enPosiciones + enPolvo;
}

function contexto(vs: Vela[]): Contexto {
  const r = atr(vs);
  return armarContexto(vs, r, ema(vs.map((v) => v.c), 200), zigzag(vs, r, 2.5));
}

/** Monedas recibidas en una compra, ya sin la comisión que Binance cobra en esa moneda. */
function netoComprado(o: OrdenBinance, moneda: string) {
  const comision = (o.fills ?? []).filter((f) => f.commissionAsset === moneda).reduce((s, f) => s + Number(f.commission), 0);
  return Number(o.executedQty) - comision;
}

/** USDT recibidos en una venta, ya sin la comisión (si se cobró en USDT; si fue en BNB, aproximada). */
function netoVendido(o: OrdenBinance) {
  const bruto = Number(o.cummulativeQuoteQty);
  const fills = o.fills ?? [];
  if (fills.length) return bruto - fills.filter((f) => f.commissionAsset === 'USDT').reduce((s, f) => s + Number(f.commission), 0);
  return bruto * (1 - BOT_REAL.comision);
}

/** Activa el bot: revisa que haya llaves y plata, y empieza en la próxima vela. */
export async function activar(e: EstadoBot, d: Dependencias): Promise<EventoBot[]> {
  if (!d.cuenta) throw new Error('Faltan las llaves de Binance (BINANCE_API_KEY y BINANCE_API_SECRET en Cloudflare).');
  await d.cuenta.sincronizarReloj();
  const saldos = await d.cuenta.saldos();
  const usdt = saldos.USDT?.libre ?? 0;
  e.saldoUsdt = usdt;
  const conPosiciones = Object.keys(e.posiciones).length > 0;
  const caja = conPosiciones ? e.caja : Math.min(BOT_REAL.capital, usdt);
  // Para empezar de cero hace falta el presupuesto completo (después de tocar el piso hay que reponerlo a conciencia).
  if (!conPosiciones && usdt < BOT_REAL.capital - 0.5) {
    throw new Error(`Tu billetera Spot tiene ${fmt(usdt)} USDT libres; hacen falta ${BOT_REAL.capital} para empezar.`);
  }
  e.activo = true;
  e.motivo = null;
  e.caja = caja;
  e.presupuesto = Object.keys(e.posiciones).length ? e.presupuesto : caja;
  e.valor = e.pico = valorDe(e, {});
  e.activadoEl = d.ahora;
  for (const m of MONEDAS) e.ultimaVela[m] = ultimaCerrada(HORAS, d.ahora); // nada del pasado
  return [{ t: d.ahora, tipo: 'info', texto: `Bot activado con ${fmt(caja)} USDT. Opera desde el próximo cierre de vela de ${BOT_REAL.temporalidad}.` }];
}

async function venderPosicion(e: EstadoBot, d: Dependencias, p: PosicionReal, por: OperacionReal['por'], precio: number, reglas: ReglasPar) {
  const cuenta = d.cuenta!;
  const eventos: EventoBot[] = [];
  if (p.ordenStop != null) {
    try {
      await cuenta.cancelarOrden(p.symbol, p.ordenStop);
    } catch (err) {
      // Si ya no existe, puede que se haya ejecutado justo ahora.
      const o = await cuenta.consultarOrden(p.symbol, { orderId: p.ordenStop }).catch(() => null);
      if (o?.status === 'FILLED') return cerrarPorStop(e, p, o, d.ahora);
      if (!(err instanceof ErrorCuenta)) throw err;
    }
    p.ordenStop = null;
  }
  const saldos = await cuenta.saldos();
  const disponible = Math.min(p.cantidad, saldos[p.moneda]?.libre ?? 0);
  const cantidad = alPaso(disponible, reglas.paso);
  if (Number(cantidad) * precio < reglas.minimo) {
    delete e.posiciones[p.moneda];
    eventos.push({ t: d.ahora, tipo: 'error', texto: `${p.moneda}: queda menos de lo mínimo que Binance deja vender (${cantidad}); se deja como saldo suelto.` });
    return { eventos, operaciones: [] as OperacionReal[] };
  }
  const o = await cuenta.venderMercado(p.symbol, cantidad, `lab-v-${p.moneda}-${d.ahora}`);
  const neto = netoVendido(o);
  const salida = Number(o.cummulativeQuoteQty) / Number(o.executedQty);
  return cerrarConVenta(e, p, neto, salida, por, d.ahora, eventos, Number(o.executedQty));
}

function cerrarConVenta(
  e: EstadoBot, p: PosicionReal, neto: number, salida: number, por: OperacionReal['por'], t: number,
  eventos: EventoBot[] = [], vendido = p.cantidad,
) {
  // Lo que no se pudo vender por el redondeo de Binance queda como polvo (sigue siendo del bot).
  const sobra = Math.max(0, p.cantidad - vendido);
  e.polvo ??= {};
  if (sobra > 0) e.polvo[p.moneda] = (e.polvo[p.moneda] ?? 0) + sobra;
  const resultado = neto + sobra * salida - p.costo;
  e.caja += neto;
  e.comisiones += neto * BOT_REAL.comision;
  e.operaciones += 1;
  if (resultado > 0) e.ganadas += 1;
  e.resultado += resultado;
  delete e.posiciones[p.moneda];
  const como = { stop: 'tocó el stop', senal: 'la estrategia dio señal de salida', piso: 'la cuenta bajó del piso', manual: 'lo detuviste desde el panel' }[por];
  eventos.push({ t, tipo: 'orden', texto: `Vendió ${p.moneda} a ${fmtPrecio(salida)} (${como}): ${resultado >= 0 ? 'ganó' : 'perdió'} $${fmt(Math.abs(resultado))}.` });
  return { eventos, operaciones: [{ tEntrada: p.tEntrada, tSalida: t, moneda: p.moneda, cantidad: p.cantidad, entrada: p.entrada, salida, resultado, por }] };
}

function cerrarPorStop(e: EstadoBot, p: PosicionReal, o: OrdenBinance, t: number) {
  const vendido = Number(o.cummulativeQuoteQty);
  const salida = vendido / Number(o.executedQty);
  return cerrarConVenta(e, p, vendido * (1 - BOT_REAL.comision), salida, 'stop', t, [], Number(o.executedQty));
}

/** Vende todo lo del bot (piso o "detener") y lo apaga. */
export async function venderTodo(e: EstadoBot, d: Dependencias, por: 'piso' | 'manual', motivo: string) {
  const eventos: EventoBot[] = [];
  const operaciones: OperacionReal[] = [];
  if (d.cuenta && Object.keys(e.posiciones).length) {
    const [precios, reglas] = await Promise.all([d.precios(MONEDAS), d.reglas()]);
    for (const p of Object.values(e.posiciones)) {
      try {
        const r = await venderPosicion(e, d, p, por, precios[p.moneda] ?? p.entrada, reglas[p.symbol]);
        eventos.push(...r.eventos);
        operaciones.push(...r.operaciones);
      } catch (err) {
        eventos.push({ t: d.ahora, tipo: 'error', texto: `No se pudo vender ${p.moneda}: ${(err as Error).message}. Revísalo en Binance.` });
      }
    }
  }
  e.activo = false;
  e.motivo = motivo;
  eventos.push({ t: d.ahora, tipo: 'info', texto: `Bot apagado: ${motivo}` });
  return { eventos, operaciones };
}

/** Un ciclo del bot (cada minuto). */
export async function cicloBot(e: EstadoBot, d: Dependencias) {
  const eventos: EventoBot[] = [];
  const operaciones: OperacionReal[] = [];
  const errores: string[] = [];
  if (!e.activo || !d.cuenta) {
    e.ultimoCiclo = { t: d.ahora, errores };
    return { eventos, operaciones };
  }
  const cuenta = d.cuenta;
  const [precios, reglas] = await Promise.all([d.precios(MONEDAS), d.reglas()]);

  // 1. ¿Se ejecutó algún stop en Binance mientras tanto?
  for (const p of Object.values(e.posiciones)) {
    if (p.ordenStop == null) continue;
    try {
      const o = await cuenta.consultarOrden(p.symbol, { orderId: p.ordenStop });
      if (o.status === 'FILLED') {
        const r = cerrarPorStop(e, p, o, d.ahora);
        eventos.push(...r.eventos);
        operaciones.push(...r.operaciones);
      } else if (['CANCELED', 'EXPIRED', 'REJECTED', 'EXPIRED_IN_MATCH'].includes(o.status)) {
        p.ordenStop = null;
        eventos.push({ t: d.ahora, tipo: 'error', texto: `La orden de stop de ${p.moneda} quedó ${o.status}; se vuelve a poner.` });
      }
    } catch (err) {
      errores.push(`${p.moneda}: ${(err as Error).message}`);
    }
  }

  // 2. Cuánto vale y el piso.
  e.valor = valorDe(e, precios);
  e.pico = Math.max(e.pico, e.valor);
  e.caidaMax = Math.max(e.caidaMax, (e.pico - e.valor) / e.pico);
  if (e.valor < BOT_REAL.pisoUsd) {
    const r = await venderTodo(e, d, 'piso', `lo que vale bajó de ${BOT_REAL.pisoUsd} USD (${fmt(e.valor)}). Para volver a operar hay que activarlo de nuevo.`);
    e.ultimoCiclo = { t: d.ahora, errores };
    return { eventos: [...eventos, ...r.eventos], operaciones: [...operaciones, ...r.operaciones] };
  }

  // 3. Protección: posiciones sin stop en Binance → ponerlo, o vender si el precio ya lo pasó.
  for (const p of Object.values(e.posiciones)) {
    if (p.ordenStop != null) continue;
    const precio = precios[p.moneda];
    try {
      if (precio != null && precio <= p.stop) {
        const r = await venderPosicion(e, d, p, 'stop', precio, reglas[p.symbol]);
        eventos.push(...r.eventos);
        operaciones.push(...r.operaciones);
      } else {
        p.ordenStop = await ponerStop(cuenta, p, reglas[p.symbol], d.ahora);
      }
    } catch (err) {
      errores.push(`stop de ${p.moneda}: ${(err as Error).message}`);
    }
  }

  // 4. Velas de 4 horas que acaban de cerrar: salidas y entradas.
  const hasta = ultimaCerrada(HORAS, d.ahora);
  const pendientes = MONEDAS.filter((m) => (e.ultimaVela[m] ?? hasta) < hasta).slice(0, MONEDAS_POR_CICLO);
  for (const m of pendientes) {
    try {
      const vs = await d.velas(m, HORAS, 600);
      const i = vs.findIndex((v) => v.t === hasta);
      if (i < 0) throw new Error('la vela todavía no aparece');
      const ctx = contexto(vs);
      const p = e.posiciones[m];
      if (p) {
        const nuevo = d.estrategia.nuevoStop?.(ctx, i, 1, p.stop) ?? p.stop;
        if (!Number.isFinite(nuevo)) {
          const r = await venderPosicion(e, d, p, 'senal', precios[m] ?? vs[i].c, reglas[symbolDe(m)]);
          eventos.push(...r.eventos);
          operaciones.push(...r.operaciones);
        }
      } else {
        const memoria = new Set(e.memorias[m] ?? []);
        const s = d.estrategia.senal(ctx, i, memoria);
        e.memorias[m] = [...memoria].slice(-20);
        if (s && s.lado === 1) eventos.push(...(await comprar(e, d, m, s.stop, s.motivo, precios, vs[i].c, reglas[symbolDe(m)], hasta)));
      }
      e.ultimaVela[m] = hasta;
    } catch (err) {
      errores.push(`${m}: ${(err as Error).message}`);
    }
  }
  e.valor = valorDe(e, precios);
  e.ultimoCiclo = { t: d.ahora, errores };
  return { eventos, operaciones };
}

async function ponerStop(cuenta: Cuenta, p: PosicionReal, reglas: ReglasPar, ahora: number): Promise<number | null> {
  const cantidad = alPaso(p.cantidad, reglas.paso);
  const limite = p.stop * 0.99;
  if (Number(cantidad) * limite < reglas.minimo) return null; // muy poco para una orden de stop: lo vigila el bot
  const o = await cuenta.ponerStop(p.symbol, cantidad, alPaso(p.stop, reglas.tick), alPaso(limite, reglas.tick), `lab-s-${p.moneda}-${ahora}`);
  return o.orderId;
}

async function comprar(
  e: EstadoBot, d: Dependencias, m: string, stop: number, motivo: string,
  precios: Record<string, number>, cierre: number, reglas: ReglasPar, tVela: number,
): Promise<EventoBot[]> {
  const cuenta = d.cuenta!;
  const symbol = symbolDe(m);
  const precio = precios[m] ?? cierre;
  const distancia = (precio - stop) / precio;
  if (!(distancia > 0)) return [];
  const saldos = await cuenta.saldos();
  e.saldoUsdt = saldos.USDT?.libre ?? 0;
  const abierto = Object.values(e.posiciones).reduce((s, p) => s + p.cantidad * (precios[p.moneda] ?? p.entrada), 0);
  const valor = e.caja + abierto;
  // Tamaño: arriesgar BOT_REAL.riesgo de lo que vale, sin pasar la caja del bot ni la plata libre en Binance.
  const minimo = Math.max(reglas.minimo, BOT_REAL.ordenMinima) * 1.02;
  const minimoParaStop = (reglas.minimo * precio) / (stop * 0.99) * 1.02;
  let usdt = Math.min((valor * BOT_REAL.riesgo) / distancia, e.caja, e.saldoUsdt, BOT_REAL.apalancamientoMax * valor - abierto);
  usdt = Math.floor(usdt * 100) / 100;
  if (usdt < Math.max(minimo, minimoParaStop)) {
    return [{ t: d.ahora, tipo: 'info', texto: `Señal de compra en ${m} (${motivo}), pero no alcanza para la orden mínima de Binance: se saltó.` }];
  }
  const id = `lab-c-${m}-${tVela}`;
  // Si por un corte ya se había enviado esta misma compra, no se repite.
  let o = await cuenta.consultarOrden(symbol, { origClientOrderId: id }).catch(() => null);
  if (!o) o = await cuenta.comprarMercado(symbol, usdt.toFixed(2), id);
  if (o.status !== 'FILLED') return [{ t: d.ahora, tipo: 'error', texto: `La compra de ${m} quedó ${o.status}.` }];
  // El polvo de ventas anteriores de esta moneda se suma a la posición nueva.
  e.polvo ??= {};
  const polvo = e.polvo[m] ?? 0;
  delete e.polvo[m];
  const cantidad = netoComprado(o, m) + polvo;
  const costo = Number(o.cummulativeQuoteQty) + polvo * precio;
  const entrada = costo / (Number(o.executedQty) + polvo);
  const p: PosicionReal = {
    moneda: m, symbol, cantidad, entrada, costo, stop, ordenStop: null, tEntrada: d.ahora, arriesgado: cantidad * (entrada - stop),
  };
  e.caja -= costo;
  e.comisiones += costo * BOT_REAL.comision;
  e.posiciones[m] = p;
  const eventos: EventoBot[] = [{ t: d.ahora, tipo: 'orden', texto: `Compró ${m} por $${fmt(costo)} a ${fmtPrecio(entrada)} (${motivo}). Stop en ${fmtPrecio(stop)}.` }];
  try {
    p.ordenStop = await ponerStop(cuenta, p, reglas, d.ahora);
    if (p.ordenStop == null) eventos.push({ t: d.ahora, tipo: 'info', texto: `${m}: la posición es muy chica para una orden de stop en Binance; el bot vigila el precio cada minuto.` });
  } catch (err) {
    eventos.push({ t: d.ahora, tipo: 'error', texto: `No se pudo poner el stop de ${m} (${(err as Error).message}); el bot vigila el precio y lo reintenta.` });
  }
  return eventos;
}

/** Para las pruebas: las monedas que vigila y el cierre de vela que usa. */
export const MONEDAS_BOT = MONEDAS;
export const ultimaCerradaBot = (ahora: number) => ultimaCerrada(HORAS, ahora);
export { CuentaBinance } from './binance-firmado';

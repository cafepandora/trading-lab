// Una cuenta virtual por estrategia, que opera todas las monedas a la vez
// (máximo una posición por moneda y temporalidad). Funciones puras: no leen
// la red ni guardan nada, para poder probarlas solas.
//
// Usa las mismas reglas de posicion.ts que la prueba con datos pasados; lo
// único que agrega es la cartera: el riesgo de cada operación sale de lo que
// vale TODA la cuenta, y lo abierto entre todas las monedas no pasa del tope
// de la cuenta (2x por defecto; 1x en la copia del bot real, que es spot).

import type { Contexto, Estrategia } from '../estrategias';
import { abrir, cerrar, cobrarFunding, revisarSalida, type Abierta, type MotivoSalida } from '../posicion';
import { AJUSTES_CUENTA, type AjustesCuenta } from './config';

export interface PosicionVivo extends Abierta {
  moneda: string;
  serie: string;
  /** Inicio de la vela en la que se entró (a su apertura). */
  tEntrada: number;
  /** Última vela cerrada que ya se revisó. */
  revisadaHasta: number;
  motivo: string;
  /**
   * Si el precio en vivo ya tocó el stop o el objetivo. La operación se cierra
   * oficialmente al cierre de la vela (con su máximo y mínimo, igual que en el
   * laboratorio), al precio del stop o del objetivo: esto solo avisa antes.
   */
  tocado?: { por: 'stop' | 'objetivo'; t: number; precio: number };
}

export interface Cuenta {
  id: string;
  nombre: string;
  tipo: 'estrategia' | 'referencia';
  /** Plata con la que empezó (500 USD; 50 en la copia del bot real). */
  capital: number;
  caja: number;
  posiciones: Record<string, PosicionVivo>;
  memorias: Record<string, string[]>;
  operaciones: number;
  ganadas: number;
  sumaR: number;
  comisiones: number;
  funding: number;
  omitidas: number;
  valor: number;
  pico: number;
  caidaMax: number;
}

export interface OperacionVivo {
  tEntrada: number;
  tSalida: number;
  cuenta: string;
  serie: string;
  moneda: string;
  lado: 1 | -1;
  entrada: number;
  salida: number;
  pnl: number;
  r: number;
  por: MotivoSalida;
  motivo: string;
}

export interface Evento {
  t: number;
  cuenta: string;
  texto: string;
}

export function nuevaCuenta(id: string, nombre: string, tipo: Cuenta['tipo'], capital = AJUSTES_CUENTA.capital): Cuenta {
  return {
    id, nombre, tipo, capital, caja: capital, posiciones: {}, memorias: {},
    operaciones: 0, ganadas: 0, sumaR: 0, comisiones: 0, funding: 0, omitidas: 0,
    valor: capital, pico: capital, caidaMax: 0,
  };
}

const precioDe = (p: PosicionVivo, precios: Record<string, number>) => precios[p.moneda] ?? p.entrada;

export function valorCuenta(c: Cuenta, precios: Record<string, number>): number {
  let v = c.caja;
  for (const p of Object.values(c.posiciones)) v += p.lado * p.tam * (precioDe(p, precios) - p.entrada);
  return v;
}

export function nocionalAbierto(c: Cuenta, precios: Record<string, number>): number {
  return Object.values(c.posiciones).reduce((s, p) => s + p.tam * precioDe(p, precios), 0);
}

/** Actualiza valor, máximo y peor caída con los precios de ahora. */
export function marcar(c: Cuenta, precios: Record<string, number>) {
  c.valor = valorCuenta(c, precios);
  c.pico = Math.max(c.pico, c.valor);
  if (c.pico > 0) c.caidaMax = Math.max(c.caidaMax, (c.pico - c.valor) / c.pico);
}

/** Precio en formato colombiano: $75.830,12 · $52,13 · $0,07149 */
const fmtPrecio = (x: number) =>
  '$' + (x >= 1000 ? x.toLocaleString('es-CO', { maximumFractionDigits: 2 }) : x.toLocaleString('es-CO', { maximumSignificantDigits: 5 }));
const fmtNum = (x: number) => x.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Procesa las velas cerradas de una serie con `t` en (desde, hasta], para
 * una cuenta. `precios` sirve para valorar la cuenta al decidir el tamaño.
 */
export function procesarSerie(
  c: Cuenta, est: Estrategia, ctx: Contexto,
  serie: { serie: string; moneda: string; horas: number },
  desde: number, hasta: number, precios: Record<string, number>, aj: AjustesCuenta = AJUSTES_CUENTA,
): { operaciones: OperacionVivo[]; eventos: Evento[] } {
  const operaciones: OperacionVivo[] = [];
  const eventos: Evento[] = [];
  const vs = ctx.velas;
  for (let i = 0; i < vs.length; i++) {
    const v = vs[i];
    if (v.t <= desde || v.t > hasta) continue;

    // 1. Cuidar la posición abierta en esta serie.
    const p = c.posiciones[serie.serie];
    if (p && v.t >= p.tEntrada && v.t > p.revisadaHasta) {
      const pago = cobrarFunding(p, v, serie.horas, aj);
      c.caja -= pago;
      c.funding += pago;
      p.revisadaHasta = v.t;
      const s = revisarSalida(p, v, aj);
      if (s) {
        const r = cerrar(p, s.precio, aj);
        c.caja += r.aCaja;
        c.comisiones += r.comision;
        c.operaciones += 1;
        c.sumaR += r.r;
        if (r.pnl > 0) c.ganadas += 1;
        delete c.posiciones[serie.serie];
        operaciones.push({
          tEntrada: p.tEntrada, tSalida: v.t + serie.horas * 3600_000, cuenta: c.id, serie: serie.serie, moneda: serie.moneda,
          lado: p.lado, entrada: p.entrada, salida: s.precio, pnl: r.pnl, r: r.r, por: s.por, motivo: p.motivo,
        });
        const como = { stop: 'tocó el stop', objetivo: 'llegó al objetivo', tiempo: 'se acabó el tiempo', fin: 'cierre', senal: 'la estrategia dio señal de salida' }[s.por];
        eventos.push({ t: v.t, cuenta: c.id, texto: `Cerró ${p.lado === 1 ? 'la compra' : 'la venta'} de ${serie.serie}: ${como}, ${r.pnl >= 0 ? 'ganó' : 'perdió'} $${fmtNum(Math.abs(r.pnl))} (${r.r >= 0 ? '+' : ''}${fmtNum(r.r)} R).` });
      } else if (est.nuevoStop) {
        p.stop = est.nuevoStop(ctx, i, p.lado, p.stop);
      }
    }

    // 2. ¿Señal nueva? (se entra a la apertura de la vela siguiente)
    if (c.posiciones[serie.serie] || i + 1 >= vs.length) continue;
    const memoria = new Set(c.memorias[serie.serie] ?? []);
    const s = est.senal(ctx, i, memoria);
    c.memorias[serie.serie] = [...memoria].slice(-40);
    if (!s) continue;
    const apertura = vs[i + 1].o;
    const valor = valorCuenta(c, precios);
    const espacio = Math.max(0, aj.apalancamientoMax * valor - nocionalAbierto(c, precios));
    const nueva = abrir(s, apertura, valor * aj.riesgo, espacio / apertura, aj);
    if (!nueva || nueva.tam * apertura < aj.ordenMinima) {
      c.omitidas += 1;
      eventos.push({ t: v.t, cuenta: c.id, texto: `Señal en ${serie.serie} (${s.motivo}) sin espacio para operar: se saltó.` });
      continue;
    }
    c.caja += nueva.acumulado;
    c.comisiones -= nueva.acumulado;
    c.posiciones[serie.serie] = { ...nueva, moneda: serie.moneda, serie: serie.serie, tEntrada: vs[i + 1].t, revisadaHasta: v.t, motivo: s.motivo };
    eventos.push({
      t: vs[i + 1].t, cuenta: c.id,
      texto: `${nueva.lado === 1 ? 'Compró' : 'Vendió en corto'} ${serie.serie} a ${fmtPrecio(nueva.entrada)} (${s.motivo}): stop ${fmtPrecio(nueva.stop)}, objetivo ${Number.isFinite(nueva.objetivo) ? fmtPrecio(nueva.objetivo) : 'sin fijo (sale con la señal)'}, arriesga $${fmtNum(nueva.arriesgado)}.`,
    });
  }
  return { operaciones, eventos };
}

/**
 * Con el precio en vivo, marca las posiciones que ya tocaron su stop o su
 * objetivo (para avisar en el panel antes del cierre de la vela).
 */
export function vigilar(c: Cuenta, precios: Record<string, number>, t: number): Evento[] {
  const eventos: Evento[] = [];
  for (const p of Object.values(c.posiciones)) {
    const precio = precios[p.moneda];
    // Un stop "infinito" es una salida por señal ya decidida: no hay nivel que vigilar.
    if (!precio || p.tocado || !Number.isFinite(p.stop)) continue;
    const tocoStop = p.lado === 1 ? precio <= p.stop : precio >= p.stop;
    const tocoObjetivo = p.lado === 1 ? precio >= p.objetivo : precio <= p.objetivo;
    if (!tocoStop && !tocoObjetivo) continue;
    p.tocado = { por: tocoStop ? 'stop' : 'objetivo', t, precio };
    eventos.push({
      t, cuenta: c.id,
      texto: `${p.serie}: el precio (${fmtPrecio(precio)}) tocó ${tocoStop ? 'el stop' : 'el objetivo'}. Se registra al cierre de la vela.`,
    });
  }
  return eventos;
}

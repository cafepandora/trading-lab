// El motor de la simulación: funciones puras, sin red ni almacenamiento,
// para poder probarlas solas (scripts/pruebas.mjs) y usarlas igual en
// Cloudflare.
//
// Cómo copia: cada minuto mira las posiciones del trader. Cuando una cambia
// (abre, agranda, achica, cierra o voltea), la copia lleva SU posición en esa
// moneda al mismo tamaño proporcional:
//     posición copia = posición trader × (valor copia ÷ valor trader) × recorte
// donde el recorte baja todo si el trader usa más apalancamiento que el tope.
// Se opera al precio medio de ese momento, más deslizamiento y comisión —
// el minuto de demora es parte de lo que se quiere medir.

import type { Cuenta, EstadoTrader, Mercado, Operacion, Parametros, Evento } from './tipos';

const HORA = 3_600_000;

/** Día calendario en Colombia (UTC−5, sin horario de verano). */
export function diaColombia(t: number): string {
  return new Date(t - 5 * HORA).toISOString().slice(0, 10);
}

export function nuevaCuenta(id: string, direccion: string | null, p: Parametros, t: number): Cuenta {
  return {
    id,
    direccion,
    tipo: direccion ? 'copia' : 'referencia',
    efectivo: p.capitalInicial,
    posiciones: {},
    vistoTrader: {},
    estado: 'activa',
    motivoEstado: null,
    inicioDia: { dia: diaColombia(t), valor: p.capitalInicial },
    pico: p.capitalInicial,
    caidaMax: 0,
    comisiones: 0,
    funding: 0,
    deslizamiento: 0,
    operaciones: 0,
    omitidas: 0,
    valor: p.capitalInicial,
    ultimaActualizacion: t,
    traderInicial: null,
    traderActual: null,
    apalancamientoTrader: 0,
    errores: 0,
    ultimoError: null,
  };
}

function precioDe(c: Cuenta, moneda: string, m: Mercado): number {
  return m.precios[moneda] ?? c.posiciones[moneda]?.entrada ?? 0;
}

/** Lo que vale la cuenta: efectivo + ganancia o pérdida de lo abierto. */
export function valorCuenta(c: Cuenta, m: Mercado): number {
  let v = c.efectivo;
  for (const [moneda, pos] of Object.entries(c.posiciones)) {
    v += pos.tam * (precioDe(c, moneda, m) - pos.entrada);
  }
  return v;
}

export function nocionalAbierto(c: Cuenta, m: Mercado): number {
  let n = 0;
  for (const [moneda, pos] of Object.entries(c.posiciones)) n += Math.abs(pos.tam) * precioDe(c, moneda, m);
  return n;
}

function deslizDe(moneda: string, m: Mercado, p: Parametros): number {
  const vol = m.contextos[moneda]?.volumenDia ?? 0;
  return vol >= p.volumenMayor ? p.deslizMayor : p.deslizMenor;
}

/**
 * Lleva la posición de `moneda` a `nuevoTam` con una orden a mercado.
 * Devuelve la operación, o null si no hay nada que hacer o no hay precio.
 */
export function ejecutar(
  c: Cuenta, moneda: string, nuevoTam: number, m: Mercado, p: Parametros, motivo: string,
  opciones: { comision?: number; desliz?: number } = {},
): Operacion | null {
  const actual = c.posiciones[moneda]?.tam ?? 0;
  const delta = nuevoTam - actual;
  const medio = m.precios[moneda];
  if (!medio || Math.abs(delta) * medio < 1e-6) return null;

  const desliz = opciones.desliz ?? deslizDe(moneda, m, p);
  const precio = delta > 0 ? medio * (1 + desliz) : medio * (1 - desliz);
  const nocional = Math.abs(delta) * precio;
  const comision = nocional * (opciones.comision ?? p.comisionTaker);

  // Ganancia realizada: la parte de la posición vieja que se cierra.
  let pnl = 0;
  const pos = c.posiciones[moneda];
  if (pos && Math.sign(delta) !== Math.sign(pos.tam)) {
    const cerrado = Math.min(Math.abs(delta), Math.abs(pos.tam));
    pnl = cerrado * (precio - pos.entrada) * Math.sign(pos.tam);
  }

  if (Math.abs(nuevoTam) < 1e-12) {
    delete c.posiciones[moneda];
  } else if (!pos || Math.sign(nuevoTam) !== Math.sign(pos.tam)) {
    c.posiciones[moneda] = { tam: nuevoTam, entrada: precio }; // abre o voltea
  } else if (Math.abs(nuevoTam) > Math.abs(pos.tam)) {
    // agranda: precio de entrada promedio
    c.posiciones[moneda] = {
      tam: nuevoTam,
      entrada: (pos.entrada * Math.abs(pos.tam) + precio * Math.abs(delta)) / Math.abs(nuevoTam),
    };
  } else {
    c.posiciones[moneda] = { tam: nuevoTam, entrada: pos.entrada }; // achica
  }

  c.efectivo += pnl - comision;
  c.comisiones += comision;
  c.deslizamiento += Math.abs(delta) * medio * desliz;
  c.operaciones += 1;
  return { t: m.t, cuenta: c.id, moneda, lado: delta > 0 ? 'compra' : 'venta', tam: Math.abs(delta), precio, nocional, comision, pnl, motivo };
}

export function cerrarTodo(c: Cuenta, m: Mercado, p: Parametros, motivo: string): Operacion[] {
  const ops: Operacion[] = [];
  for (const moneda of Object.keys(c.posiciones)) {
    // Sin precio no se puede cerrar a mercado: queda abierta y se reintenta
    // en el próximo ciclo (ver cicloCopia).
    const op = ejecutar(c, moneda, 0, m, p, motivo);
    if (op) ops.push(op);
  }
  c.vistoTrader = {};
  return ops;
}

/** Cobra o paga el funding de una hora (los "long" pagan si la tasa es positiva). */
export function aplicarFunding(c: Cuenta, m: Mercado): number {
  if (c.tipo !== 'copia') return 0; // la referencia es Bitcoin comprado y guardado
  let total = 0;
  for (const [moneda, pos] of Object.entries(c.posiciones)) {
    const ctx = m.contextos[moneda];
    if (!ctx) continue;
    const pago = pos.tam * (ctx.oraculo || m.precios[moneda] || pos.entrada) * ctx.funding;
    c.efectivo -= pago;
    total += pago;
  }
  c.funding += total;
  return total;
}

function actualizarMarcas(c: Cuenta, m: Mercado): number {
  const v = valorCuenta(c, m);
  c.valor = v;
  c.pico = Math.max(c.pico, v);
  if (c.pico > 0) c.caidaMax = Math.max(c.caidaMax, (c.pico - v) / c.pico);
  c.ultimaActualizacion = m.t;
  return v;
}

/** La cuenta de referencia: compra Bitcoin una vez y lo guarda. */
export function cicloReferencia(c: Cuenta, m: Mercado, p: Parametros): Operacion[] {
  const ops: Operacion[] = [];
  if (!c.posiciones.BTC && c.operaciones === 0 && m.precios.BTC) {
    // Compra spot: comisión de spot similar, deslizamiento mínimo.
    const tam = (c.efectivo / m.precios.BTC) * (1 - p.comisionTaker - p.deslizMayor);
    const op = ejecutar(c, 'BTC', tam, m, p, 'compra inicial de Bitcoin', { desliz: p.deslizMayor });
    if (op) ops.push(op);
  }
  actualizarMarcas(c, m);
  return ops;
}

export interface ResultadoCiclo {
  operaciones: Operacion[];
  eventos: Evento[];
}

/** Un ciclo de una copia. `trader` es null si no se pudo leer su cuenta. */
export function cicloCopia(c: Cuenta, trader: EstadoTrader | null, m: Mercado, p: Parametros): ResultadoCiclo {
  const operaciones: Operacion[] = [];
  const eventos: Evento[] = [];
  const evento = (texto: string) => eventos.push({ t: m.t, cuenta: c.id, texto });

  if (c.estado === 'detenida') {
    if (Object.keys(c.posiciones).length) operaciones.push(...cerrarTodo(c, m, p, 'cierre pendiente'));
    actualizarMarcas(c, m);
    return { operaciones, eventos };
  }

  // Día nuevo (hora Colombia): se reinicia el freno diario.
  const hoy = diaColombia(m.t);
  if (c.inicioDia.dia !== hoy) {
    c.inicioDia = { dia: hoy, valor: valorCuenta(c, m) };
    if (c.estado === 'pausada') {
      c.estado = 'activa';
      c.motivoEstado = null;
      c.vistoTrader = {}; // al volver, copia lo que el trader tenga abierto
      evento('Día nuevo: vuelve a copiar.');
    }
  }

  let valor = valorCuenta(c, m);

  // Liquidación (con el tope de apalancamiento casi nunca debería pasar).
  let margenMantenimiento = 0;
  for (const [moneda, pos] of Object.entries(c.posiciones)) {
    const maxApal = m.contextos[moneda]?.maxApal || 20;
    margenMantenimiento += (Math.abs(pos.tam) * precioDe(c, moneda, m)) / (2 * maxApal);
  }
  if (Object.keys(c.posiciones).length && valor <= margenMantenimiento) {
    operaciones.push(...cerrarTodo(c, m, p, 'liquidación'));
    c.efectivo = Math.max(c.efectivo, 0);
    c.estado = 'detenida';
    c.motivoEstado = 'La cuenta fue liquidada.';
    evento(c.motivoEstado);
    actualizarMarcas(c, m);
    return { operaciones, eventos };
  }

  // Freno total: cayó más del límite desde el capital inicial.
  if (valor <= p.capitalInicial * (1 - p.caidaMaxTotal)) {
    operaciones.push(...cerrarTodo(c, m, p, 'freno: caída máxima'));
    c.estado = 'detenida';
    c.motivoEstado = `Perdió más del ${Math.round(p.caidaMaxTotal * 100)}% del capital: se detuvo.`;
    evento(c.motivoEstado);
    actualizarMarcas(c, m);
    return { operaciones, eventos };
  }

  // Freno diario.
  if (c.estado === 'activa' && valor <= c.inicioDia.valor * (1 - p.perdidaMaxDia)) {
    operaciones.push(...cerrarTodo(c, m, p, 'freno: pérdida del día'));
    c.estado = 'pausada';
    c.motivoEstado = `Perdió más del ${Math.round(p.perdidaMaxDia * 100)}% hoy: pausada hasta mañana.`;
    evento(c.motivoEstado);
    actualizarMarcas(c, m);
    return { operaciones, eventos };
  }

  if (c.estado !== 'activa' || !trader) {
    if (c.estado === 'pausada' && Object.keys(c.posiciones).length) {
      operaciones.push(...cerrarTodo(c, m, p, 'freno: pérdida del día'));
    }
    actualizarMarcas(c, m);
    return { operaciones, eventos };
  }
  if (trader.valorCuenta <= 0) {
    // El trader se quedó sin plata en el mercado principal: se cierra todo.
    if (Object.keys(c.posiciones).length) {
      operaciones.push(...cerrarTodo(c, m, p, 'el trader ya no tiene cuenta'));
      evento('El trader dejó la cuenta en cero: se cerró todo.');
    }
    c.apalancamientoTrader = 0;
    actualizarMarcas(c, m);
    return { operaciones, eventos };
  }

  // Cuánto de la cuenta del trader representa la copia, con el tope de apalancamiento.
  let nocionalTrader = 0;
  for (const [moneda, tam] of Object.entries(trader.posiciones)) {
    nocionalTrader += Math.abs(tam) * (m.precios[moneda] ?? 0);
  }
  const apalTrader = nocionalTrader / trader.valorCuenta;
  c.apalancamientoTrader = apalTrader;
  const recorte = apalTrader > p.apalancamientoMax ? p.apalancamientoMax / apalTrader : 1;
  const factor = (valor / trader.valorCuenta) * recorte;

  const monedas = new Set([...Object.keys(trader.posiciones), ...Object.keys(c.posiciones), ...Object.keys(c.vistoTrader)]);
  for (const moneda of monedas) {
    const tamTrader = trader.posiciones[moneda] ?? 0;
    const visto = c.vistoTrader[moneda];
    const cambio = visto === undefined
      || Math.sign(tamTrader) !== Math.sign(visto)
      || Math.abs(tamTrader - visto) > p.umbralCambio * Math.max(Math.abs(tamTrader), Math.abs(visto));
    if (!cambio) continue;
    if (!m.precios[moneda]) continue; // sin precio: se intenta en el próximo ciclo

    const actual = c.posiciones[moneda]?.tam ?? 0;
    const objetivo = tamTrader * factor;
    const motivo = describirCambio(visto ?? 0, tamTrader);
    if (tamTrader === 0) {
      delete c.vistoTrader[moneda];
      if (actual !== 0) {
        const op = ejecutar(c, moneda, 0, m, p, motivo);
        if (op) operaciones.push(op);
      }
      continue;
    }
    c.vistoTrader[moneda] = tamTrader;
    if (Math.abs(objetivo - actual) * m.precios[moneda] < p.ordenMinima) {
      if (Math.abs(objetivo - actual) * m.precios[moneda] > 0.01) c.omitidas += 1;
      continue;
    }
    const op = ejecutar(c, moneda, objetivo, m, p, motivo);
    if (op) operaciones.push(op);
  }

  // Si por movimientos de precio el apalancamiento quedó muy por encima del
  // tope, se baja todo en proporción.
  valor = valorCuenta(c, m);
  const nocional = nocionalAbierto(c, m);
  if (valor > 0 && nocional > p.apalancamientoMax * valor * 1.1) {
    const k = (p.apalancamientoMax * valor) / nocional;
    for (const [moneda, pos] of Object.entries({ ...c.posiciones })) {
      const nuevo = pos.tam * k;
      if (Math.abs(pos.tam - nuevo) * precioDe(c, moneda, m) < p.ordenMinima) continue;
      const op = ejecutar(c, moneda, nuevo, m, p, 'baja apalancamiento al tope');
      if (op) operaciones.push(op);
    }
  }

  actualizarMarcas(c, m);
  return { operaciones, eventos };
}

function describirCambio(antes: number, ahora: number): string {
  if (antes === 0 && ahora !== 0) return ahora > 0 ? 'el trader abrió long' : 'el trader abrió short';
  if (ahora === 0) return 'el trader cerró';
  if (Math.sign(antes) !== Math.sign(ahora)) return 'el trader volteó la posición';
  return Math.abs(ahora) > Math.abs(antes) ? 'el trader agrandó' : 'el trader achicó';
}

// Un ciclo de la simulación en vivo (la alarma lo corre cada 30 segundos) y
// el estado que ve el panel. No sabe dónde se guardan los datos: recibe un
// `Almacen` (Durable Object en Cloudflare, memoria en las pruebas).
//
// Corre tres clases de simulaciones en papel (config.ts → SIMULACIONES):
// - una cuenta por estrategia del laboratorio (y la copia del bot real);
// - copias de traders de Hyperliquid con años ganando (copia/);
// - la referencia: Bitcoin comprado el primer día y guardado.

import * as binance from '../binance';
import { armarContexto } from '../estrategias';
import { atr, ema, zigzag } from '../indicadores';
import { estrategiaPorId } from '../variantes';
import { marcar, nuevaCuenta, procesarSerie, vigilar, type Cuenta, type Evento, type OperacionVivo } from './cartera';
import { cicloCopias, estadoCopiasInicial, type EstadoCopias } from './copia/ciclo';
import { nuevaCuenta as nuevaCopia } from './copia/motor';
import { PARAMETROS as PARAMETROS_COPIA, type Cuenta as CuentaCopia, type Operacion as OperacionCopia } from './copia/tipos';
import { AJUSTES_CUENTA, MONEDAS, SERIES, SIMULACIONES, VIVO, ajustesDe, ultimaCerrada, type Simulacion } from './config';
import referencia from './referencia.json';

const HORA = 3_600_000;
const DIA = 24 * HORA;

/** Sube si cambia algo que obliga a empezar de cero (v4: 40 simulaciones y copias de traders). */
export const VERSION = 4;

export interface Config {
  version: typeof VERSION;
  iniciada: number;
  /** Última vela cerrada ya procesada, por serie. */
  ultimaVela: Record<string, number>;
  /** Compra de referencia: Bitcoin comprado al empezar y guardado. */
  btc: { tam: number; entrada: number } | null;
  copias: EstadoCopias;
  ultimaHoraCurva: number;
  ultimoGuardado: number;
  ultimoCiclo: { t: number; ms: number; series: string[]; errores: string[] } | null;
  ciclos: number;
}

export interface PuntoCurva {
  t: number;
  cuenta: string;
  valor: number;
}

export interface Almacen {
  leerConfig(): Promise<Config | null>;
  guardarConfig(c: Config): Promise<void>;
  leerCuentas(): Promise<Cuenta[]>;
  guardarCuentas(cs: Cuenta[]): Promise<void>;
  leerCopias(): Promise<CuentaCopia[]>;
  guardarCopias(cs: CuentaCopia[]): Promise<void>;
  agregarOperaciones(ops: OperacionVivo[]): Promise<void>;
  agregarOperacionesCopia(ops: OperacionCopia[]): Promise<void>;
  agregarEventos(ev: Evento[]): Promise<void>;
  agregarCurva(puntos: PuntoCurva[]): Promise<void>;
  operaciones(cuenta: string | null, limite: number): Promise<OperacionVivo[]>;
  operacionesCopia(cuenta: string, limite: number): Promise<OperacionCopia[]>;
  eventos(limite: number): Promise<Evento[]>;
  curva(): Promise<PuntoCurva[]>;
  borrarTodo(): Promise<void>;
}

/** Lo que el Durable Object recuerda entre ciclos sin escribirlo cada vez. */
export interface Memoria {
  ultimoCiclo?: Config['ultimoCiclo'];
  precios?: Record<string, number>;
  /** Precios de Hyperliquid (para las posiciones de las copias de traders). */
  preciosHl?: Record<string, number>;
}

const simulacion = (id: string) => SIMULACIONES.find((s) => s.id === id);

function explicarError(e: unknown): string {
  if (e instanceof binance.ErrorBinance && (e.status === 429 || e.status === 418)) return 'Binance pidió esperar';
  if (e instanceof binance.ErrorBinance && e.status === 451) return 'Binance no responde desde este lugar';
  if (e instanceof binance.ErrorBinance && e.status >= 500) return 'Binance no respondió';
  return (e as Error)?.message ?? 'error';
}

/** Precio actual de cada moneda, solo el número. */
async function preciosAhora(): Promise<Record<string, number>> {
  const p = await binance.precios(MONEDAS);
  return Object.fromEntries(Object.entries(p).map(([m, x]) => [m, x.precio]));
}

export async function iniciar(a: Almacen, ahora = Date.now()) {
  await a.borrarTodo();
  const estrategias = SIMULACIONES.filter((s) => s.tipo !== 'copia');
  await a.guardarCuentas(estrategias.map((s) => nuevaCuenta(s.id, s.nombre, s.tipo as Cuenta['tipo'], ajustesDe(s).capital)));
  await a.guardarCopias(SIMULACIONES.filter((s) => s.tipo === 'copia').map((s) => nuevaCopia(s.id, s.direccion!, PARAMETROS_COPIA, ahora)));
  // Se empieza desde la próxima vela: nada del pasado se opera en vivo.
  const ultimaVela = Object.fromEntries(SERIES.map((s) => [s.serie, ultimaCerrada(s.horas, ahora)]));
  await a.guardarConfig({
    version: VERSION, iniciada: ahora, ultimaVela, btc: null, copias: estadoCopiasInicial(ahora),
    ultimaHoraCurva: -1, ultimoGuardado: ahora, ultimoCiclo: null, ciclos: 0,
  });
  const nEstrategias = SIMULACIONES.filter((s) => s.tipo === 'estrategia').length;
  const nCopias = SIMULACIONES.filter((s) => s.tipo === 'copia').length;
  await a.agregarEventos([{
    t: ahora, cuenta: '—',
    texto: `Empezó la simulación con precios de Binance: ${nEstrategias} estrategias${nCopias ? ` y ${nCopias} copias de traders` : ''}, ${MONEDAS.length} monedas en velas de 4 horas y diarias.`,
  }]);
}

export async function correrCiclo(a: Almacen, ahora = Date.now(), mem: Memoria = {}) {
  const inicio = Date.now();
  const config = await a.leerConfig();
  if (!config) return null;
  const errores: string[] = [];
  let guardar = ahora - config.ultimoGuardado >= VIVO.guardarCadaMs;

  let precios: Record<string, number>;
  try {
    precios = await preciosAhora();
  } catch (e) {
    mem.ultimoCiclo = { t: ahora, ms: Date.now() - inicio, series: [], errores: [`los precios (${explicarError(e)})`] };
    return mem.ultimoCiclo;
  }
  mem.precios = precios;

  const cuentas = await a.leerCuentas();
  const operaciones: OperacionVivo[] = [];
  const eventos: Evento[] = [];

  // Referencia: compra Bitcoin una vez y lo guarda.
  const btc = cuentas.find((c) => c.tipo === 'referencia');
  if (btc && !config.btc && precios.BTC) {
    const entrada = precios.BTC * (1 + AJUSTES_CUENTA.desliz);
    config.btc = { tam: (btc.capital * (1 - AJUSTES_CUENTA.comision)) / entrada, entrada };
    btc.caja = 0;
    btc.comisiones = btc.capital * AJUSTES_CUENTA.comision;
    guardar = true;
  }

  // Series con velas nuevas cerradas; primero las más atrasadas.
  const pendientes = SERIES
    .map((s) => ({ ...s, desde: config.ultimaVela[s.serie] ?? ultimaCerrada(s.horas, ahora), hasta: ultimaCerrada(s.horas, ahora) }))
    .filter((s) => s.hasta > s.desde)
    .sort((x, y) => x.desde - y.desde)
    .slice(0, VIVO.seriesPorCiclo);

  const hechas: string[] = [];
  for (const s of pendientes) {
    try {
      const vs = await binance.velas(s.moneda, s.horas, VIVO.velasHistoria);
      if (vs.length < 250) throw new Error(`solo ${vs.length} velas`);
      const rangos = atr(vs);
      const ctx = armarContexto(vs, rangos, ema(vs.map((v) => v.c), 200), zigzag(vs, rangos, 2.5));
      for (const c of cuentas) {
        const sim = simulacion(c.id);
        if (c.tipo !== 'estrategia' || !sim?.estrategia) continue;
        if (sim.temporalidades && !sim.temporalidades.includes(s.tf)) continue;
        const est = estrategiaPorId(sim.estrategia);
        if (!est) continue;
        const r = procesarSerie(c, est, ctx, s, s.desde, s.hasta, precios, ajustesDe(sim));
        operaciones.push(...r.operaciones);
        eventos.push(...r.eventos);
      }
      config.ultimaVela[s.serie] = s.hasta;
      hechas.push(s.serie);
      guardar = true;
    } catch (e) {
      errores.push(`${s.serie} (${explicarError(e)})`);
    }
  }

  for (const c of cuentas) {
    if (c.tipo === 'referencia') {
      if (config.btc && precios.BTC) {
        c.valor = config.btc.tam * precios.BTC;
        c.pico = Math.max(c.pico, c.valor);
        c.caidaMax = Math.max(c.caidaMax, (c.pico - c.valor) / c.pico);
      }
    } else {
      const avisos = vigilar(c, precios, ahora);
      if (avisos.length) guardar = true;
      eventos.push(...avisos);
      marcar(c, precios);
    }
  }

  // Copias de traders (Hyperliquid).
  const copias = await a.leerCopias();
  const rc = await cicloCopias(copias, config.copias, ahora);
  if (Object.keys(rc.precios).length) mem.preciosHl = rc.precios;
  errores.push(...rc.errores);
  eventos.push(...rc.eventos);
  if (rc.cambio) guardar = true;

  const hora = Math.floor(ahora / HORA);
  if (hora !== config.ultimaHoraCurva) {
    await a.agregarCurva([...cuentas, ...copias].map((c) => ({ t: ahora, cuenta: c.id, valor: c.valor })));
    config.ultimaHoraCurva = hora;
    guardar = true;
  }

  if (operaciones.length) await a.agregarOperaciones(operaciones);
  if (rc.operaciones.length) await a.agregarOperacionesCopia(rc.operaciones);
  if (eventos.length) await a.agregarEventos(eventos);
  config.ciclos += 1;
  config.ultimoCiclo = mem.ultimoCiclo = { t: ahora, ms: Date.now() - inicio, series: hechas, errores };
  // Para no gastar escrituras: solo se guarda cuando algo cambió, o cada 10 minutos.
  if (guardar) {
    config.ultimoGuardado = ahora;
    await a.guardarCuentas(cuentas);
    await a.guardarCopias(copias);
    await a.guardarConfig(config);
  }
  return config.ultimoCiclo;
}

type Pasado = { operaciones: number; rPromedio: number; aciertos: number; suerte: number };

/** Lo que muestra el panel. */
export async function armarEstado(a: Almacen, ahora = Date.now(), mem: Memoria = {}) {
  const config = await a.leerConfig();
  if (!config) return { iniciada: false as const };
  const ref = referencia as Record<string, Pasado>;
  const precios = mem.precios ?? {};
  const meta = (s: Simulacion | undefined) => ({ nota: s?.nota ?? null, temporalidades: s?.temporalidades ?? ['4h', '1d'] });

  const filas = (await a.leerCuentas()).map((c) => {
    const sim = simulacion(c.id);
    // Con los precios del último ciclo (aunque no se hayan guardado).
    if (c.tipo === 'estrategia' && mem.precios) marcar(c, precios);
    if (c.tipo === 'referencia' && config.btc && precios.BTC) c.valor = config.btc.tam * precios.BTC;
    const est = sim?.estrategia ? estrategiaPorId(sim.estrategia) : undefined;
    return {
      id: c.id, nombre: c.nombre, tipo: c.tipo, ...meta(sim),
      capital: c.capital, valor: c.valor, resultado: c.valor / c.capital - 1, caidaMax: c.caidaMax,
      operaciones: c.operaciones, aciertos: c.operaciones ? c.ganadas / c.operaciones : null,
      rPromedio: c.operaciones ? c.sumaR / c.operaciones : null,
      comisiones: c.comisiones, funding: c.funding, omitidas: c.omitidas,
      pasado: (sim?.estrategia && ref[sim.estrategia]) || null,
      explicacion: est?.explicacion ?? sim?.nota ?? '',
      posiciones: Object.values(c.posiciones).map((p) => ({
        serie: p.serie, moneda: p.moneda, lado: p.lado, entrada: p.entrada, tam: p.tam,
        stop: Number.isFinite(p.stop) ? p.stop : null, objetivo: Number.isFinite(p.objetivo) ? p.objetivo : null,
        arriesgado: p.arriesgado, tEntrada: p.tEntrada, motivo: p.motivo, tocado: p.tocado ?? null,
      })),
      estado: null as string | null, motivoEstado: null as string | null, resultadoTrader: null as number | null, direccion: null as string | null,
      alElegir: null as Record<string, unknown> | null,
    };
  });

  const copias = (await a.leerCopias()).map((c) => {
    const sim = simulacion(c.id);
    const ti = c.traderInicial, ta = c.traderActual;
    return {
      id: c.id, nombre: sim?.nombre ?? c.id, tipo: 'copia' as const, ...meta(sim),
      capital: PARAMETROS_COPIA.capitalInicial, valor: c.valor, resultado: c.valor / PARAMETROS_COPIA.capitalInicial - 1, caidaMax: c.caidaMax,
      operaciones: c.operaciones, aciertos: null, rPromedio: null,
      comisiones: c.comisiones, funding: c.funding, omitidas: c.omitidas, pasado: null,
      explicacion: sim?.nota ?? '',
      posiciones: Object.entries(c.posiciones).map(([moneda, p]) => ({
        serie: moneda, moneda, lado: (p.tam > 0 ? 1 : -1) as 1 | -1, entrada: p.entrada, tam: Math.abs(p.tam),
        stop: null, objetivo: null, arriesgado: 0, tEntrada: 0, motivo: 'copia del trader', tocado: null,
        precioActual: mem.preciosHl?.[moneda] ?? null,
      })),
      estado: c.estado, motivoEstado: c.motivoEstado,
      resultadoTrader: ti && ta && ti.valor > 0 ? (ta.pnl - ti.pnl) / ti.valor : null,
      direccion: c.direccion, alElegir: sim?.alElegir ?? null,
    };
  });

  // Para la gráfica basta con ~200 momentos, aunque la prueba dure meses.
  const todos = await a.curva();
  const tiempos = [...new Set(todos.map((x) => x.t))];
  const paso = Math.max(1, Math.ceil(tiempos.length / 200));
  const elegidos = new Set(tiempos.filter((_, i) => i % paso === 0 || i === tiempos.length - 1));

  return {
    iniciada: true as const,
    ahora,
    iniciadaEl: config.iniciada,
    dias: (ahora - config.iniciada) / DIA,
    ajustes: { capital: AJUSTES_CUENTA.capital, riesgo: AJUSTES_CUENTA.riesgo, apalancamientoMax: AJUSTES_CUENTA.apalancamientoMax, comision: AJUSTES_CUENTA.comision, operacionesParaDecidir: VIVO.operacionesParaDecidir },
    monedas: MONEDAS,
    ultimoCiclo: mem.ultimoCiclo ?? config.ultimoCiclo,
    ciclos: config.ciclos,
    filas: [...filas, ...copias],
    curva: todos.filter((x) => elegidos.has(x.t)),
    eventos: await a.eventos(60),
  };
}

// Un ciclo de la simulación en vivo (la alarma lo corre cada minuto) y el
// estado que ve el panel. No sabe dónde se guardan los datos: recibe un
// `Almacen` (Durable Object en Cloudflare, memoria en las pruebas).

import { ESTRATEGIAS, armarContexto } from '../estrategias';
import { atr, ema, zigzag } from '../indicadores';
import { marcar, nuevaCuenta, procesarSerie, type Cuenta, type Evento, type OperacionVivo } from './cartera';
import { ESTRATEGIAS_VIVO, SERIES, VIVO, ultimaCerrada } from './config';
import * as hl from './hyperliquid';
import referencia from './referencia.json';

const HORA = 3_600_000;
const DIA = 24 * HORA;

export interface Config {
  version: 2;
  iniciada: number;
  /** Última vela cerrada ya procesada, por serie. */
  ultimaVela: Record<string, number>;
  /** Compra de referencia: Bitcoin comprado al empezar y guardado. */
  btc: { tam: number; entrada: number } | null;
  ultimaHoraCurva: number;
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
  agregarOperaciones(ops: OperacionVivo[]): Promise<void>;
  agregarEventos(ev: Evento[]): Promise<void>;
  agregarCurva(puntos: PuntoCurva[]): Promise<void>;
  operaciones(cuenta: string | null, limite: number): Promise<OperacionVivo[]>;
  eventos(limite: number): Promise<Evento[]>;
  curva(): Promise<PuntoCurva[]>;
  borrarTodo(): Promise<void>;
}

const estrategia = (id: string) => ESTRATEGIAS.find((e) => e.id === id)!;

function explicarError(e: unknown): string {
  if (e instanceof hl.ErrorApi && e.status === 429) return 'Hyperliquid pidió esperar';
  if (e instanceof hl.ErrorApi && e.status >= 500) return 'Hyperliquid no respondió';
  return (e as Error)?.message ?? 'error';
}

export async function iniciar(a: Almacen, ahora = Date.now()) {
  await a.borrarTodo();
  const cuentas = [
    ...ESTRATEGIAS_VIVO.map((id) => nuevaCuenta(id, estrategia(id).nombre, 'estrategia')),
    nuevaCuenta('BTC', 'Solo guardar Bitcoin', 'referencia'),
  ];
  await a.guardarCuentas(cuentas);
  // Se empieza desde la próxima vela: nada del pasado se opera en vivo.
  const ultimaVela = Object.fromEntries(SERIES.map((s) => [s.serie, ultimaCerrada(s.horas, ahora)]));
  await a.guardarConfig({ version: 2, iniciada: ahora, ultimaVela, btc: null, ultimaHoraCurva: -1, ultimoCiclo: null, ciclos: 0 });
  await a.agregarEventos([{
    t: ahora, cuenta: '—',
    texto: `Empezó la simulación: ${ESTRATEGIAS_VIVO.length} estrategias, ${VIVO.capital} USD virtuales cada una, ${SERIES.length / 2} monedas en velas de 4 horas y diarias.`,
  }]);
}

export async function correrCiclo(a: Almacen, ahora = Date.now()) {
  const inicio = Date.now();
  const config = await a.leerConfig();
  if (!config) return null;
  const errores: string[] = [];

  let precios: Record<string, number>;
  try {
    precios = await hl.precios();
  } catch (e) {
    config.ultimoCiclo = { t: ahora, ms: Date.now() - inicio, series: [], errores: [`los precios (${explicarError(e)})`] };
    await a.guardarConfig(config);
    return config.ultimoCiclo;
  }

  const cuentas = await a.leerCuentas();
  const operaciones: OperacionVivo[] = [];
  const eventos: Evento[] = [];

  // Referencia: compra Bitcoin una vez y lo guarda.
  const btc = cuentas.find((c) => c.tipo === 'referencia');
  if (btc && !config.btc && precios.BTC) {
    const entrada = precios.BTC * (1 + VIVO.desliz);
    const tam = (VIVO.capital * (1 - VIVO.comision)) / entrada;
    config.btc = { tam, entrada };
    btc.caja = 0;
    btc.comisiones = VIVO.capital * VIVO.comision;
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
      const vs = await hl.velas(s.moneda, s.horas, VIVO.velasHistoria, ahora);
      if (vs.length < 250) throw new Error(`solo ${vs.length} velas`);
      const rangos = atr(vs);
      const ctx = armarContexto(vs, rangos, ema(vs.map((v) => v.c), 200), zigzag(vs, rangos, 2.5));
      for (const c of cuentas) {
        if (c.tipo !== 'estrategia') continue;
        const r = procesarSerie(c, estrategia(c.id), ctx, s, s.desde, s.hasta, precios);
        operaciones.push(...r.operaciones);
        eventos.push(...r.eventos);
      }
      config.ultimaVela[s.serie] = s.hasta;
      hechas.push(s.serie);
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
      marcar(c, precios);
    }
  }

  const hora = Math.floor(ahora / HORA);
  if (hora !== config.ultimaHoraCurva) {
    await a.agregarCurva(cuentas.map((c) => ({ t: ahora, cuenta: c.id, valor: c.valor })));
    config.ultimaHoraCurva = hora;
  }

  await a.guardarCuentas(cuentas);
  if (operaciones.length) await a.agregarOperaciones(operaciones);
  if (eventos.length) await a.agregarEventos(eventos);
  config.ciclos += 1;
  config.ultimoCiclo = { t: ahora, ms: Date.now() - inicio, series: hechas, errores };
  await a.guardarConfig(config);
  return config.ultimoCiclo;
}

/** Lo que muestra el panel. */
export async function armarEstado(a: Almacen, ahora = Date.now()) {
  const config = await a.leerConfig();
  if (!config) return { iniciada: false as const };
  const cuentas = await a.leerCuentas();
  const ref = referencia as Record<string, { operaciones: number; rPromedio: number; aciertos: number; suerte: number }>;

  const filas = cuentas.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    tipo: c.tipo,
    valor: c.valor,
    resultado: c.valor / VIVO.capital - 1,
    caidaMax: c.caidaMax,
    operaciones: c.operaciones,
    aciertos: c.operaciones ? c.ganadas / c.operaciones : null,
    rPromedio: c.operaciones ? c.sumaR / c.operaciones : null,
    comisiones: c.comisiones,
    funding: c.funding,
    omitidas: c.omitidas,
    pasado: ref[c.id] ?? null,
    explicacion: c.tipo === 'estrategia' ? estrategia(c.id).explicacion : 'Compra Bitcoin el primer día y no hace nada más: la vara para medir.',
    posiciones: Object.values(c.posiciones).map((p) => ({
      serie: p.serie, lado: p.lado, entrada: p.entrada, stop: p.stop, objetivo: Number.isFinite(p.objetivo) ? p.objetivo : null,
      arriesgado: p.arriesgado, tEntrada: p.tEntrada, motivo: p.motivo,
    })),
  }));

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
    ajustes: { capital: VIVO.capital, riesgo: VIVO.riesgo, apalancamientoMax: VIVO.apalancamientoMax, comision: VIVO.comision, operacionesParaDecidir: VIVO.operacionesParaDecidir },
    monedas: [...new Set(SERIES.map((s) => s.moneda))],
    ultimoCiclo: config.ultimoCiclo,
    ciclos: config.ciclos,
    filas,
    curva: todos.filter((x) => elegidos.has(x.t)),
    eventos: await a.eventos(50),
  };
}

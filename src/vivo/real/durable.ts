// El bot con dinero real corre en su propio Durable Object, separado de las
// simulaciones, con una alarma cada minuto. Se crea en Sudamérica
// (locationHint 'sam') porque Binance bloquea servidores de algunos países,
// entre ellos Estados Unidos.
//
// Todo lo que toca la cuenta pasa por una sola fila (`enFila`), para que dos
// cosas nunca operen al mismo tiempo (por ejemplo, la alarma y "detener").

import { DurableObject } from 'cloudflare:workers';
import * as binance from '../../binance';
import { estrategiaPorId } from '../../variantes';
import { BOT_REAL, MONEDAS } from '../config';
import { activar, cicloBot, estadoInicial, venderTodo, type Dependencias, type EstadoBot, type EventoBot, type OperacionReal } from './bot';
import { CuentaBinance, reglasDe, type ReglasPar } from './binance-firmado';

export interface EnvBot {
  BINANCE_API_KEY?: string;
  BINANCE_API_SECRET?: string;
  /** Solo para probar en local contra un Binance falso (http://127.0.0.1:…). */
  BINANCE_SERVIDOR_PRUEBAS?: string;
}

const MINUTO = 60_000;

export class BotReal extends DurableObject<EnvBot> {
  private fila: Promise<unknown> = Promise.resolve();
  private reglas: { t: number; valor: Record<string, ReglasPar> } | null = null;

  constructor(ctx: DurableObjectState, env: EnvBot) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS eventos (t INTEGER, tipo TEXT, texto TEXT);
        CREATE TABLE IF NOT EXISTS operaciones (tEntrada INTEGER, tSalida INTEGER, moneda TEXT, cantidad REAL, entrada REAL, salida REAL, resultado REAL, por TEXT);
      `);
    });
  }

  private enFila<T>(fn: () => Promise<T>): Promise<T> {
    const r = this.fila.then(fn, fn);
    this.fila = r.catch(() => undefined);
    return r;
  }

  private tieneLlaves() {
    return !!(this.env.BINANCE_API_KEY && this.env.BINANCE_API_SECRET);
  }

  private deps(): Dependencias {
    const prueba = this.env.BINANCE_SERVIDOR_PRUEBAS?.startsWith('http://127.0.0.1') ? this.env.BINANCE_SERVIDOR_PRUEBAS : undefined;
    return {
      cuenta: this.tieneLlaves() ? new CuentaBinance({ apiKey: this.env.BINANCE_API_KEY!, secreto: this.env.BINANCE_API_SECRET! }, prueba) : null,
      estrategia: estrategiaPorId(BOT_REAL.estrategia)!,
      velas: (m, h, n) => binance.velas(m, h, n),
      precios: async (ms) => Object.fromEntries(Object.entries(await binance.precios(ms)).map(([m, p]) => [m, p.precio])),
      reglas: async () => {
        if (!this.reglas || Date.now() - this.reglas.t > 86400_000) this.reglas = { t: Date.now(), valor: await reglasDe(MONEDAS.map((m) => `${m}USDT`)) };
        return this.reglas.valor;
      },
      ahora: Date.now(),
    };
  }

  private async leer(): Promise<EstadoBot> {
    return (await this.ctx.storage.get<EstadoBot>('bot')) ?? estadoInicial();
  }

  private async guardar(e: EstadoBot, eventos: EventoBot[], operaciones: OperacionReal[] = []) {
    await this.ctx.storage.put('bot', e);
    for (const ev of eventos) this.ctx.storage.sql.exec('INSERT INTO eventos VALUES (?,?,?)', ev.t, ev.tipo, ev.texto);
    for (const o of operaciones) {
      this.ctx.storage.sql.exec('INSERT INTO operaciones VALUES (?,?,?,?,?,?,?,?)', o.tEntrada, o.tSalida, o.moneda, o.cantidad, o.entrada, o.salida, o.resultado, o.por);
    }
  }

  async asegurar() {
    if ((await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(Date.now() + MINUTO);
  }

  async alarm() {
    try {
      await this.enFila(async () => {
        const e = await this.leer();
        if (!e.activo) return;
        try {
          const r = await cicloBot(e, this.deps());
          await this.guardar(e, r.eventos, r.operaciones);
        } catch (err) {
          e.ultimoCiclo = { t: Date.now(), errores: [(err as Error).message] };
          await this.guardar(e, []);
        }
      });
    } finally {
      await this.ctx.storage.setAlarm(Date.now() + MINUTO);
    }
  }

  async estado() {
    await this.asegurar();
    const e = await this.leer();
    return JSON.stringify({
      llaves: this.tieneLlaves(),
      reglas: BOT_REAL,
      estado: e,
      eventos: this.ctx.storage.sql.exec('SELECT * FROM eventos ORDER BY t DESC LIMIT 60').toArray(),
      operaciones: this.ctx.storage.sql.exec('SELECT * FROM operaciones ORDER BY tSalida DESC LIMIT 100').toArray(),
    });
  }

  /** Prueba la conexión con la cuenta: firma, permisos y saldo. No opera. */
  async probar() {
    if (!this.tieneLlaves()) return JSON.stringify({ ok: false, error: 'Faltan las llaves de Binance (BINANCE_API_KEY y BINANCE_API_SECRET en Cloudflare).' });
    try {
      const cuenta = this.deps().cuenta!;
      await cuenta.sincronizarReloj();
      const saldos = await cuenta.saldos();
      return JSON.stringify({ ok: true, usdt: saldos.USDT?.libre ?? 0, monedas: Object.keys(saldos).length });
    } catch (err) {
      return JSON.stringify({ ok: false, error: (err as Error).message });
    }
  }

  async activar() {
    return this.enFila(async () => {
      const e = await this.leer();
      try {
        const eventos = await activar(e, this.deps());
        await this.guardar(e, eventos);
        await this.asegurar();
        return JSON.stringify({ ok: true });
      } catch (err) {
        return JSON.stringify({ ok: false, error: (err as Error).message });
      }
    });
  }

  async detener() {
    return this.enFila(async () => {
      const e = await this.leer();
      const r = await venderTodo(e, this.deps(), 'manual', 'lo detuviste desde el panel.');
      await this.guardar(e, r.eventos, r.operaciones);
      return JSON.stringify({ ok: true });
    });
  }
}

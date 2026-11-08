// Almacén dentro del Durable Object: config y cuentas como clave → valor,
// y el historial (operaciones, eventos, curva) en tablas SQLite.

import type { Cuenta, Evento, OperacionVivo } from './cartera';
import { SIMULACIONES } from './config';
import type { Cuenta as CuentaCopia, Operacion as OperacionCopia } from './copia/tipos';
import type { Almacen, Config, PuntoCurva } from './simulacion';

export class AlmacenDO implements Almacen {
  constructor(private s: DurableObjectStorage) {}

  crearTablas() {
    this.s.sql.exec(`
      CREATE TABLE IF NOT EXISTS operaciones (
        tEntrada INTEGER, tSalida INTEGER, cuenta TEXT, serie TEXT, moneda TEXT, lado INTEGER,
        entrada REAL, salida REAL, pnl REAL, r REAL, por TEXT, motivo TEXT);
      CREATE INDEX IF NOT EXISTS operaciones_cuenta ON operaciones (cuenta, tSalida);
      CREATE TABLE IF NOT EXISTS operaciones_copia (
        t INTEGER, cuenta TEXT, moneda TEXT, lado TEXT, tam REAL, precio REAL,
        nocional REAL, comision REAL, pnl REAL, motivo TEXT);
      CREATE INDEX IF NOT EXISTS operaciones_copia_cuenta ON operaciones_copia (cuenta, t);
      CREATE TABLE IF NOT EXISTS eventos (t INTEGER, cuenta TEXT, texto TEXT);
      CREATE TABLE IF NOT EXISTS curva (t INTEGER, cuenta TEXT, valor REAL);
      CREATE INDEX IF NOT EXISTS curva_t ON curva (t);
    `);
  }

  async leerConfig() {
    return (await this.s.get<Config>('config')) ?? null;
  }
  async guardarConfig(c: Config) {
    await this.s.put('config', c);
  }
  async leerCuentas() {
    const mapa = await this.s.list<Cuenta>({ prefix: 'cuenta:' });
    const orden = (c: Cuenta) => SIMULACIONES.findIndex((s) => s.id === c.id);
    return [...mapa.values()].sort((a, b) => orden(a) - orden(b));
  }
  async guardarCuentas(cs: Cuenta[]) {
    await this.s.put(Object.fromEntries(cs.map((c) => [`cuenta:${c.id}`, c])));
  }
  async leerCopias() {
    return [...(await this.s.list<CuentaCopia>({ prefix: 'copia:' })).values()];
  }
  async guardarCopias(cs: CuentaCopia[]) {
    if (cs.length) await this.s.put(Object.fromEntries(cs.map((c) => [`copia:${c.id}`, c])));
  }
  async agregarOperacionesCopia(ops: OperacionCopia[]) {
    for (const o of ops) {
      this.s.sql.exec('INSERT INTO operaciones_copia VALUES (?,?,?,?,?,?,?,?,?,?)', o.t, o.cuenta, o.moneda, o.lado, o.tam, o.precio, o.nocional, o.comision, o.pnl, o.motivo);
    }
  }
  async operacionesCopia(cuenta: string, limite: number) {
    return this.s.sql.exec('SELECT * FROM operaciones_copia WHERE cuenta = ? ORDER BY t DESC LIMIT ?', cuenta, limite).toArray() as unknown as OperacionCopia[];
  }
  async agregarOperaciones(ops: OperacionVivo[]) {
    for (const o of ops) {
      this.s.sql.exec(
        'INSERT INTO operaciones VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        o.tEntrada, o.tSalida, o.cuenta, o.serie, o.moneda, o.lado, o.entrada, o.salida, o.pnl, o.r, o.por, o.motivo,
      );
    }
  }
  async agregarEventos(ev: Evento[]) {
    for (const e of ev) this.s.sql.exec('INSERT INTO eventos VALUES (?,?,?)', e.t, e.cuenta, e.texto);
  }
  async agregarCurva(puntos: PuntoCurva[]) {
    for (const p of puntos) this.s.sql.exec('INSERT INTO curva VALUES (?,?,?)', p.t, p.cuenta, p.valor);
  }
  async operaciones(cuenta: string | null, limite: number) {
    const cursor = cuenta
      ? this.s.sql.exec('SELECT * FROM operaciones WHERE cuenta = ? ORDER BY tSalida DESC LIMIT ?', cuenta, limite)
      : this.s.sql.exec('SELECT * FROM operaciones ORDER BY tSalida DESC LIMIT ?', limite);
    return cursor.toArray() as unknown as OperacionVivo[];
  }
  async eventos(limite: number) {
    return this.s.sql.exec('SELECT * FROM eventos ORDER BY t DESC LIMIT ?', limite).toArray() as unknown as Evento[];
  }
  async curva() {
    return this.s.sql.exec('SELECT * FROM curva ORDER BY t').toArray() as unknown as PuntoCurva[];
  }
  async borrarTodo() {
    await this.s.deleteAll();
    this.crearTablas();
  }
}

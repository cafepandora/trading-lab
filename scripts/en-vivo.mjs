// Corre la simulación en vivo (el mismo código que en Cloudflare) desde este
// computador, guardando todo en memoria, y repite los últimos N días como si
// estuvieran pasando ahora. Sirve para revisar que todo funciona antes de publicar.
//
// Uso: npm run en-vivo -- [dias=30]
import fs from 'node:fs';
import { armarEstado, correrCiclo, iniciar } from '../.compilado/simulacion.mjs';

const dias = Number(process.argv[2]) || 30;

class AlmacenMemoria {
  config = null; cuentas = new Map(); copias = new Map(); ops = []; opsCopia = []; ev = []; puntos = [];
  async leerCopias() { return [...this.copias.values()].map((c) => structuredClone(c)); }
  async guardarCopias(cs) { for (const c of cs) this.copias.set(c.id, structuredClone(c)); }
  async agregarOperacionesCopia(o) { this.opsCopia.push(...o); }
  async operacionesCopia(cuenta, n) { return this.opsCopia.filter((o) => o.cuenta === cuenta).slice(-n).reverse(); }
  async leerConfig() { return structuredClone(this.config); }
  async guardarConfig(c) { this.config = structuredClone(c); }
  async leerCuentas() { return [...this.cuentas.values()].map((c) => structuredClone(c)); }
  async guardarCuentas(cs) { for (const c of cs) this.cuentas.set(c.id, structuredClone(c)); }
  async agregarOperaciones(o) { this.ops.push(...o); }
  async agregarEventos(e) { this.ev.push(...e); }
  async agregarCurva(p) { this.puntos.push(...p); }
  async operaciones(cuenta, n) { return this.ops.filter((o) => !cuenta || o.cuenta === cuenta).slice(-n).reverse(); }
  async eventos(n) { return this.ev.slice(-n).reverse(); }
  async curva() { return this.puntos; }
  async borrarTodo() { Object.assign(this, new AlmacenMemoria()); }
}

const a = new AlmacenMemoria();
const mem = {};
await iniciar(a);
for (const s of Object.keys(a.config.ultimaVela)) a.config.ultimaVela[s] -= dias * 86400_000;
let ciclos = 0;
for (;;) {
  const r = await correrCiclo(a, Date.now(), mem);
  ciclos++;
  if (r.errores.length) console.log('avisos:', r.errores.join(' | '));
  if (!r.series.length || ciclos > 60) break;
  console.log(`ciclo ${ciclos}: ${r.series.join(', ')} (${r.ms} ms)`);
}
const e = await armarEstado(a, Date.now(), mem);
console.log(`\nRepetición de ${dias} días en ${ciclos} ciclos:`);
for (const f of e.filas) {
  const r = f.rPromedio == null ? '—' : f.rPromedio.toFixed(2);
  const abiertas = f.posiciones.map((p) => p.serie).join(', ') || '—';
  console.log(`${f.nombre.padEnd(44)} $${f.valor.toFixed(2).padStart(7)}  ${(f.resultado * 100).toFixed(2).padStart(6)}%  ${String(f.operaciones).padStart(3)} op  R ${r}  abiertas ${abiertas}`);
}
console.log('\nÚltimos eventos:');
for (const ev of a.ev.slice(-10)) console.log(' ', new Date(ev.t).toISOString().slice(0, 16), ev.cuenta, ev.texto);
fs.mkdirSync('.compilado', { recursive: true });
fs.writeFileSync('.compilado/estado-en-vivo.json', JSON.stringify(e, null, 1));

// Scalping, day trading y swing trading, con las reglas del bot real, y una
// fórmula algorítmica que elige sola entre los tres.
//
// Cada estilo es un grupo de estrategias en sus velas típicas:
// - Scalping: velas de 5 minutos; ninguna operación dura más de 1 hora.
// - Day trading: velas de 15 minutos y 1 hora; ninguna dura más de 1 día.
// - Swing trading: velas de 4 horas y diarias; duran días o semanas.
// Todas solo compran (spot) y pagan lo que cobra Binance spot: 0,1% por orden
// y deslizamiento. La cuenta es la del bot: 50 USD, 0,5% de riesgo por
// operación, nunca más de lo que hay, órdenes de al menos 5 USD (también la
// del stop).
//
// La fórmula algorítmica: cada 3 meses mira SOLO lo que ya pasó, elige hasta 3
// combinaciones (estilo + estrategia + velas) con t ≥ 2 y al menos 30
// operaciones, y las opera los 3 meses siguientes, que no vio.
//
// Uso: npm run estilos   (usa datos/binance/; las velas cortas las baja
// `npm run corto-plazo`). Escribe resultados/estilos.json.

import fs from 'node:fs';
import { AJUSTES, armarContexto, atr, ema, estrategiaPorId, probar, zigzag } from '../.compilado/lab.mjs';

const DIA = 86400_000;
const AHORA = Date.now();
const CAPITAL = 50, RIESGO = 0.005, TOPE = 1, MINIMO_BINANCE = 5;
const COSTOS = { comision: 0.001, desliz: AJUSTES.desliz, deslizStop: AJUSTES.deslizStop, fundingHora: 0 };
const CORTAS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB']; // las que tienen velas de 5m, 15m y 1h
const TODAS_MONEDAS = [...CORTAS, 'AVAX', 'LINK', 'LTC', 'ADA', 'SUI', 'AAVE', 'DOT', 'NEAR'];

const ESTILOS = [
  {
    id: 'scalping', nombre: 'Scalping', maxHoras: 1, monedas: CORTAS,
    velas: { '5m': 5 / 60 },
    estrategias: ['rsi-2-10-compras', 'bollinger-compras', 'envolvente', 'martillo', 'estrella', 'cruce-20-50-compras', 'tendencia-20-10-compras'],
  },
  {
    id: 'day', nombre: 'Day trading', maxHoras: 24, monedas: CORTAS,
    velas: { '15m': 0.25, '1h': 1 },
    estrategias: ['rsi-2-10-compras', 'bollinger-compras', 'envolvente', 'soldados', 'cruce-20-50-compras', 'tendencia-20-10-compras'],
  },
  {
    id: 'swing', nombre: 'Swing trading', maxHoras: Infinity, monedas: TODAS_MONEDAS,
    velas: { '4h': 4, '1d': 24 },
    estrategias: ['cruce-20-50-compras', 'cruce-50-200-compras', 'tendencia-20-10-compras', 'tendencia-55-20-compras', 'soldados', 'rsi-14-30-compras', 'bollinger-compras', 'triple'],
  },
];

/** Solo compras, y nunca más de `maxVelas` velas abierta. */
function adaptar(est, maxVelas) {
  return {
    ...est,
    senal(ctx, i, memoria) {
      const s = est.senal(ctx, i, memoria);
      if (!s || s.lado !== 1) return null;
      return Number.isFinite(maxVelas) ? { ...s, maxVelas: Math.min(s.maxVelas ?? Infinity, maxVelas) } : s;
    },
  };
}

const media = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const desv = (xs) => { const m = media(xs); return Math.sqrt(media(xs.map((x) => (x - m) ** 2))); };
const tDe = (xs) => (xs.length > 1 ? media(xs) / ((desv(xs) || 1e-9) / Math.sqrt(xs.length)) : 0);
const pct = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1).replace('.', ',')}%`;
const num = (x, d = 2) => `${x >= 0 ? '+' : ''}${x.toFixed(d).replace('.', ',')}`;
const fecha = (t) => new Date(t).toISOString().slice(0, 10);
const sumarMeses = (t, n) => { const d = new Date(t); d.setUTCMonth(d.getUTCMonth() + n); return d.getTime(); };

// ── 1. Todas las operaciones de cada combinación ─────────────────────────
const combos = []; // { id, estilo, tf, estrategia, ops, desde }
for (const estilo of ESTILOS) {
  for (const [tf, horas] of Object.entries(estilo.velas)) {
    const series = [];
    for (const m of estilo.monedas) {
      const archivo = `datos/binance/${m}-${tf}.json`;
      if (!fs.existsSync(archivo)) { console.log(`falta ${archivo}`); continue; }
      const vs = JSON.parse(fs.readFileSync(archivo, 'utf8'));
      const r = atr(vs);
      series.push({ m, desde: vs[200]?.t ?? vs[0].t, ctx: armarContexto(vs, r, ema(vs.map((v) => v.c), 200), zigzag(vs, r, 2.5)) });
    }
    for (const id of estilo.estrategias) {
      const est = adaptar(estrategiaPorId(id), estilo.maxHoras / horas);
      const ops = [];
      for (const s of series) {
        for (const o of probar(s.ctx, est, { ...AJUSTES, ...COSTOS, horasPorVela: horas }).operaciones) {
          if (o.salidaPor !== 'fin') ops.push({ ...o, m: s.m, combo: `${estilo.id}|${tf}|${id}` });
        }
      }
      ops.sort((a, b) => a.tEntrada - b.tEntrada);
      combos.push({ id: `${estilo.id}|${tf}|${id}`, estilo: estilo.id, tf, estrategia: id, ops, desde: Math.min(...series.map((s) => s.desde)) });
    }
  }
}
console.log(`${combos.length} combinaciones, ${combos.reduce((s, c) => s + c.ops.length, 0).toLocaleString('es-CO')} operaciones simuladas.\n`);

/** La cuenta del bot con estas operaciones (solo cuenta lo cerrado). */
function cuenta(ops, desde, hasta) {
  const lista = ops.filter((o) => o.tEntrada >= desde && o.tSalida < hasta);
  const eventos = [];
  lista.forEach((o, k) => { eventos.push([o.tEntrada, 1, k]); eventos.push([o.tSalida, 0, k]); });
  eventos.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  let caja = CAPITAL, abierto = 0, pico = CAPITAL, caida = 0, hechas = 0;
  const tomadas = new Map();
  for (const [, tipo, k] of eventos) {
    const o = lista[k];
    if (tipo === 1) {
      const n = Math.min((caja * RIESGO) / o.riesgoPct, Math.max(0, TOPE * caja - abierto));
      if (n < Math.max(MINIMO_BINANCE, MINIMO_BINANCE / ((1 - o.riesgoPct) * 0.99)) * 1.02) continue;
      tomadas.set(k, n); abierto += n; hechas++;
    } else if (tomadas.has(k)) {
      const n = tomadas.get(k);
      caja += o.r * n * o.riesgoPct; abierto -= n; tomadas.delete(k);
      pico = Math.max(pico, caja); caida = Math.max(caida, 1 - caja / pico);
    }
  }
  return { final: caja, resultado: caja / CAPITAL - 1, caida, hechas };
}

// Costo de cada operación en R: comisión de entrada y salida + deslizamiento, ÷ distancia al stop.
const costoR = (o) => (2 * COSTOS.comision + 2 * COSTOS.desliz) / o.riesgoPct;

// ── 2. Cada estilo en el último año (el único período con datos de los tres) ──
const UN_ANIO = AHORA - 365 * DIA;
const resumen = (c, desde, hasta) => {
  const ops = c.ops.filter((o) => o.tEntrada >= desde && o.tSalida < hasta);
  const rs = ops.map((o) => o.r);
  return {
    combo: c.id, estilo: c.estilo, tf: c.tf, estrategia: c.estrategia, operaciones: ops.length,
    porDia: ops.length / ((hasta - desde) / DIA), aciertos: rs.length ? rs.filter((r) => r > 0).length / rs.length : 0,
    rPromedio: media(rs), t: tDe(rs), costoR: media(ops.map(costoR)),
    horasPromedio: media(ops.map((o) => (o.tSalida - o.tEntrada) / 3600_000)),
    cuenta: cuenta(c.ops, desde, hasta),
  };
};
const ultimoAnio = combos.map((c) => resumen(c, UN_ANIO, AHORA));
const porEstilo = {};
console.log(`=== El último año (${fecha(UN_ANIO)} → ${fecha(AHORA)}), cuenta de 50 USD con las reglas del bot ===`);
for (const estilo of ESTILOS) {
  const filas = ultimoAnio.filter((f) => f.estilo === estilo.id).sort((a, b) => b.cuenta.resultado - a.cuenta.resultado);
  const todas = combos.filter((c) => c.estilo === estilo.id).flatMap((c) => c.ops.filter((o) => o.tEntrada >= UN_ANIO));
  porEstilo[estilo.id] = {
    nombre: estilo.nombre, combinaciones: filas.length,
    ganan: filas.filter((f) => f.cuenta.resultado > 0).length,
    rPromedio: media(todas.map((o) => o.r)), costoR: media(todas.map(costoR)), operaciones: todas.length,
    mejor: filas[0], filas,
  };
  const e = porEstilo[estilo.id];
  console.log(`\n${estilo.nombre}: ${e.ganan} de ${e.combinaciones} combinaciones terminan ganando · por cada $1 arriesgado ${num(e.rPromedio)} · lo que se comen los costos ${num(e.costoR)} por operación`);
  for (const f of filas) {
    console.log(`  ${f.tf.padEnd(3)} ${f.estrategia.padEnd(24)} ${String(f.operaciones).padStart(6)} op (${f.porDia.toFixed(1).replace('.', ',')}/día, duran ${f.horasPromedio.toFixed(1).replace('.', ',')} h) · ${num(f.rPromedio)} R (t ${f.t.toFixed(1).replace('.', ',')}) · costo ${num(f.costoR)} R · cuenta ${pct(f.cuenta.resultado)}, cae ${Math.round(f.cuenta.caida * 100)}%`);
  }
}

// ── 3. La fórmula algorítmica, a ciegas, cada 3 meses ─────────────────────
const INICIO = Date.UTC(2024, 0, 1);
const ventanas = [];
for (let desde = INICIO; desde < AHORA; desde = sumarMeses(desde, 3)) {
  const hasta = Math.min(sumarMeses(desde, 3), AHORA);
  const candidatas = combos
    .map((c) => { const rs = c.ops.filter((o) => o.tSalida < desde).map((o) => o.r); return { c, n: rs.length, r: media(rs), t: tDe(rs) }; })
    .filter((x) => x.n >= 30 && x.t >= 2)
    .sort((a, b) => b.t - a.t)
    .slice(0, 3);
  const ids = new Set(candidatas.map((x) => x.c.id));
  ventanas.push({ desde, hasta, elegidas: candidatas.map((x) => ({ combo: x.c.id, n: x.n, r: +x.r.toFixed(3), t: +x.t.toFixed(2) })), ops: combos.filter((c) => ids.has(c.id)).flatMap((c) => c.ops.filter((o) => o.tEntrada >= desde && o.tEntrada < hasta)) });
}
const ciegas = ventanas.flatMap((v) => v.ops).sort((a, b) => a.tEntrada - b.tEntrada);
const formula = { ...cuenta(ciegas, INICIO, AHORA + DIA), rPromedio: media(ciegas.map((o) => o.r)), t: tDe(ciegas.map((o) => o.r)), operaciones: ciegas.length };
const eleccionesPorEstilo = {};
for (const v of ventanas) for (const e of v.elegidas) { const s = e.combo.split('|')[0]; eleccionesPorEstilo[s] = (eleccionesPorEstilo[s] || 0) + 1; }
// Para comparar: el bot de hoy (swing, cruce 20/50 en 4h) en el mismo período.
const botHoy = cuenta(combos.find((c) => c.id === 'swing|4h|cruce-20-50-compras').ops, INICIO, AHORA + DIA);

console.log(`\n=== Fórmula algorítmica a ciegas (${fecha(INICIO)} → hoy, elige cada 3 meses) ===`);
for (const v of ventanas) {
  const r = cuenta(v.ops, v.desde, v.hasta + DIA);
  console.log(`  ${fecha(v.desde)}: ${v.elegidas.length ? v.elegidas.map((e) => e.combo.replace(/\|/g, ' ')).join(' · ') : 'nada pasa los filtros: no opera'} → ${pct(r.resultado)}`);
}
console.log(`  Total: ${formula.operaciones} operaciones · ${num(formula.rPromedio)} R por operación (t ${formula.t.toFixed(1).replace('.', ',')}) · 50 USD → ${formula.final.toFixed(2)} USD (${pct(formula.resultado)}), cae hasta ${Math.round(formula.caida * 100)}%`);
console.log(`  Veces que eligió cada estilo: ${Object.entries(eleccionesPorEstilo).map(([k, n]) => `${k} ${n}`).join(' · ') || 'ninguno'}`);
console.log(`  El bot de hoy (swing, cruce 20/50 en 4h), mismo período: 50 USD → ${botHoy.final.toFixed(2)} USD (${pct(botHoy.resultado)}), cae hasta ${Math.round(botHoy.caida * 100)}%`);

fs.mkdirSync('resultados', { recursive: true });
fs.writeFileSync('resultados/estilos.json', JSON.stringify({
  generado: new Date().toISOString(),
  reglas: { capital: CAPITAL, riesgo: RIESGO, tope: TOPE, costos: COSTOS, minimoBinance: MINIMO_BINANCE },
  ultimoAnio: { desde: fecha(UN_ANIO), porEstilo },
  formula: { desde: fecha(INICIO), ...formula, eleccionesPorEstilo, ventanas: ventanas.map(({ ops, ...v }) => ({ ...v, desde: fecha(v.desde), hasta: fecha(v.hasta), operaciones: ops.length })) },
  botHoy,
}, null, 1) + '\n');
console.log('\nGuardado en resultados/estilos.json');

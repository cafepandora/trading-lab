// Prueba todas las estrategias con precios reales (Binance por defecto).
// Uso: npm run laboratorio
//   LAB_MONEDAS=BTC,ETH,XRP   otras monedas (por defecto BTC, ETH, SOL)
//   LAB_FUENTE=hyperliquid    precios de Hyperliquid en vez de Binance
//   LAB_SALIDA=archivo.json   dónde guardar el resultado (por defecto resultados.json)
// Guarda los precios en datos/<fuente>/ para no volver a bajarlos.

import fs from 'node:fs';
import {
  AJUSTES, ESTRATEGIAS, armarContexto, atr, binance, comprarYGuardar, ema, estrategiaAzar, probar, zigzag,
} from '../.compilado/lab.mjs';

// Monedas: por defecto las 3 grandes; con LAB_MONEDAS se puede probar otra lista.
const MONEDAS = (process.env.LAB_MONEDAS || 'BTC,ETH,SOL').split(',').map((m) => m.trim()).filter(Boolean);
const FUENTE = process.env.LAB_FUENTE === 'hyperliquid' ? 'hyperliquid' : 'binance';
const TEMPORALIDADES = { '4h': 4, '1d': 24 };
const SEMILLAS = 200;
const PARTE_NUEVA = 0.3; // el último 30% del tiempo se mira aparte

async function velas(moneda, iv) {
  const archivo = `datos/${FUENTE}/${moneda}-${iv}.json`;
  if (fs.existsSync(archivo)) return JSON.parse(fs.readFileSync(archivo, 'utf8'));
  fs.mkdirSync(`datos/${FUENTE}`, { recursive: true });
  if (FUENTE === 'binance') {
    const vs = await binance.historia(moneda, TEMPORALIDADES[iv]);
    fs.writeFileSync(archivo, JSON.stringify(vs));
    return vs;
  }
  const ms = TEMPORALIDADES[iv] * 3600_000, ahora = Date.now();
  const r = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'candleSnapshot', req: { coin: moneda, interval: iv, startTime: ahora - 5000 * ms, endTime: ahora } }),
  });
  if (!r.ok) throw new Error(`${moneda} ${iv}: HTTP ${r.status}`);
  // Solo velas cerradas.
  const vs = (await r.json()).filter((v) => v.T < ahora).map((v) => ({ t: v.t, o: +v.o, h: +v.h, l: +v.l, c: +v.c }));
  fs.mkdirSync('datos', { recursive: true });
  fs.writeFileSync(archivo, JSON.stringify(vs));
  return vs;
}

const media = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const desv = (xs) => { const m = media(xs); return Math.sqrt(media(xs.map((x) => (x - m) ** 2))); };
const percentil = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

function resumir(series) {
  const ops = series.flatMap((s) => s.ops);
  const rs = ops.map((o) => o.r);
  const ganadas = rs.filter((r) => r > 0);
  const perdidas = rs.filter((r) => r <= 0);
  const vieja = series.flatMap((s) => s.ops.filter((o) => o.tEntrada < s.corte)).map((o) => o.r);
  const nueva = series.flatMap((s) => s.ops.filter((o) => o.tEntrada >= s.corte)).map((o) => o.r);
  return {
    operaciones: ops.length,
    rPromedio: media(rs),
    // ¿Se distingue de cero? (promedio ÷ error estándar)
    t: rs.length > 1 ? media(rs) / (desv(rs) / Math.sqrt(rs.length)) : 0,
    aciertos: rs.length ? ganadas.length / rs.length : 0,
    factorGanancia: perdidas.length ? ganadas.reduce((s, x) => s + x, 0) / Math.abs(perdidas.reduce((s, x) => s + x, 0) || 1e-9) : null,
    anualPromedio: media(series.map((s) => s.res.anual)),
    caidaPromedio: media(series.map((s) => s.res.caidaMax)),
    seriesEnGanancia: series.filter((s) => s.res.retorno > 0).length,
    rParteVieja: media(vieja), opsVieja: vieja.length,
    rParteNueva: media(nueva), opsNueva: nueva.length,
    porSerie: series.map((s) => ({ serie: s.serie, retorno: s.res.retorno, anual: s.res.anual, caidaMax: s.res.caidaMax, operaciones: s.ops.length, rPromedio: media(s.ops.map((o) => o.r)) })),
  };
}

const contextos = [];
for (const moneda of MONEDAS) {
  for (const [iv, horas] of Object.entries(TEMPORALIDADES)) {
    const vs = await velas(moneda, iv);
    if (vs.length < 400) { console.log(`${moneda} ${iv}: solo ${vs.length} velas, se salta`); continue; }
    const rangos = atr(vs);
    const ctx = armarContexto(vs, rangos, ema(vs.map((v) => v.c), 200), zigzag(vs, rangos, 2.5));
    const t0 = vs[AJUSTES.inicio].t, t1 = vs[vs.length - 1].t;
    contextos.push({ serie: `${moneda} ${iv}`, ctx, aj: { ...AJUSTES, horasPorVela: horas }, corte: t1 - PARTE_NUEVA * (t1 - t0), desde: t0, hasta: t1 });
    console.log(`${FUENTE} ${moneda} ${iv}: ${vs.length} velas, ${new Date(t0).toISOString().slice(0, 10)} → ${new Date(t1).toISOString().slice(0, 10)}`);
  }
}

const filas = [];
for (const est of ESTRATEGIAS) {
  const series = contextos.map((c) => { const res = probar(c.ctx, est, c.aj); return { serie: c.serie, res, ops: res.operaciones, corte: c.corte }; });
  filas.push({ id: est.id, nombre: est.nombre, grupo: est.grupo, explicacion: est.explicacion, ...resumir(series) });
}

// El azar, muchas veces: cuánto puede dar la pura suerte con las mismas salidas.
const azar = [];
const rAzar = [];
for (let s = 1; s <= SEMILLAS; s++) {
  const series = contextos.map((c) => { const res = probar(c.ctx, estrategiaAzar(s * 7919), c.aj); return { serie: c.serie, res, ops: res.operaciones, corte: c.corte }; });
  azar.push(resumir(series));
  for (const x of series) for (const o of x.ops) rAzar.push(o.r);
}
// Probabilidad de que el azar, con el MISMO número de operaciones, dé un
// promedio igual o mejor (mientras más operaciones, menos suerte cabe).
let semilla = 12345;
const aleatorio = () => ((semilla = (semilla * 1664525 + 1013904223) >>> 0) / 2 ** 32);
function probabilidadAzar(n, rObjetivo) {
  if (!n) return 1;
  let mejores = 0;
  const veces = 4000;
  for (let k = 0; k < veces; k++) {
    let suma = 0;
    for (let j = 0; j < n; j++) suma += rAzar[Math.floor(aleatorio() * rAzar.length)];
    if (suma / n >= rObjetivo) mejores++;
  }
  return mejores / veces;
}
const limiteR = percentil(azar.map((a) => a.rPromedio), 0.95);
const limiteAnual = percentil(azar.map((a) => a.anualPromedio), 0.95);
const azarResumen = {
  rMediana: percentil(azar.map((a) => a.rPromedio), 0.5), r95: limiteR,
  anualMediana: percentil(azar.map((a) => a.anualPromedio), 0.5), anual95: limiteAnual,
  operacionesMediana: percentil(azar.map((a) => a.operaciones), 0.5),
};
const guardar = contextos.map((c) => ({ serie: c.serie, ...comprarYGuardar(c.ctx, c.aj) }));
const guardarAnual = media(guardar.map((g) => g.anual));

for (const f of filas) {
  f.probabilidadAzar = probabilidadAzar(f.operaciones, f.rPromedio);
  f.leGanaAlAzar = f.probabilidadAzar < 0.05;
  f.leGanaAGuardar = f.anualPromedio > guardarAnual;
  f.confiable = f.operaciones >= 30 && f.t >= 2 && f.rParteNueva > 0 && f.rParteVieja > 0;
}

const pct = (x) => (x * 100).toFixed(1).replace('.', ',') + '%';
const num = (x, d = 2) => (x == null ? '—' : x.toFixed(d).replace('.', ','));
console.log('\nEstrategia                                  Ops  R prom.  t     Acierto  Anual   Caída   Vieja/Nueva (R)   Suerte  ¿Guardar?');
for (const f of [...filas].sort((a, b) => b.rPromedio - a.rPromedio)) {
  console.log(`${f.nombre.padEnd(43).slice(0, 43)} ${String(f.operaciones).padStart(4)}  ${num(f.rPromedio).padStart(6)}  ${num(f.t, 1).padStart(4)}  ${pct(f.aciertos).padStart(6)}  ${pct(f.anualPromedio).padStart(6)}  ${pct(f.caidaPromedio).padStart(6)}  ${num(f.rParteVieja).padStart(6)} / ${num(f.rParteNueva).padStart(6)}   ${pct(f.probabilidadAzar).padStart(6)}  ${f.leGanaAGuardar ? 'sí' : 'no'}`);
}
console.log(`\nAzar (${SEMILLAS} intentos): R mediana ${num(azarResumen.rMediana)}, el 5% con más suerte pasa de ${num(limiteR)}; anual mediana ${pct(azarResumen.anualMediana)}, 95%: ${pct(limiteAnual)}`);
for (const f of [...filas].sort((a, b) => b.rPromedio - a.rPromedio).slice(0, 3)) {
  console.log(`  ${f.nombre}: ` + f.porSerie.map((x) => `${x.serie} ${x.operaciones} ops ${num(x.rPromedio)}R`).join(' · '));
}
console.log(`Comprar y guardar: anual promedio ${pct(guardarAnual)} · ${guardar.map((g) => `${g.serie} ${pct(g.anual)} (caída ${pct(g.caidaMax)})`).join(' · ')}`);

fs.writeFileSync(process.env.LAB_SALIDA || 'resultados.json', JSON.stringify({
  fecha: new Date().toISOString(), ajustes: AJUSTES,
  series: contextos.map((c) => ({ serie: c.serie, desde: c.desde, hasta: c.hasta, corte: c.corte })),
  estrategias: filas, azar: azarResumen, comprarYGuardar: guardar,
}, null, 1));

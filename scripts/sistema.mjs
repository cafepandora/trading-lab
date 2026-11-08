// El sistema: escoge estrategias con datos pasados y se mide a ciegas.
//
// Reglas, fijadas ANTES de ver resultados:
// 1. Cada 6 meses (desde enero de 2021) mira SOLO las operaciones que ya
//    habían cerrado, de las 35 estrategias en las 14 monedas.
// 2. Elige hasta 3: las de mejor t (ganancia promedio ÷ su error), con al
//    menos 50 operaciones y t ≥ 2. Si ninguna pasa, no opera ese semestre.
// 3. Opera las elegidas los 6 meses siguientes, que no vio.
// 4. "Funciona" solo si, en esa parte a ciegas: gana en promedio, se
//    distingue de la suerte (t ≥ 2), le gana al azar (probabilidad < 5%)
//    y la cuenta no cae más de 25% arriesgando 0,5% por operación.
//
// Uso: npm run sistema   (usa los precios de datos/binance/; si faltan, corre
// antes `LAB_MONEDAS=... npm run laboratorio`). Escribe resultados/sistema.json,
// con lo que elegiría hoy (`elegidasHoy`).

import fs from 'node:fs';
import { AJUSTES, TODAS, armarContexto, atr, ema, estrategiaAzar, probar, zigzag } from '../.compilado/lab.mjs';

const MONEDAS = (process.env.LAB_MONEDAS || 'BTC,ETH,SOL,XRP,DOGE,BNB,AVAX,LINK,LTC,ADA,SUI,AAVE,DOT,NEAR').split(',');
const TEMPORALIDADES = { '4h': 4, '1d': 24 };
const INICIO_CIEGO = Date.UTC(2021, 0, 1);
const MESES = 6;
const MIN_OPERACIONES = 50;
const MIN_T = 2;
const ELEGIR = 3;
// Riesgo por operación (LAB_RIESGO solo para ver cuánto cambia con apuestas más chicas o más grandes).
const RIESGO = Number(process.env.LAB_RIESGO) || 0.005;
// Tope de todo lo abierto junto, en veces la cuenta (LAB_TOPE solo para ver el efecto).
const TOPE = Number(process.env.LAB_TOPE) || AJUSTES.apalancamientoMax;
const CAIDA_MAXIMA = 0.25;
const AHORA = Date.now();

const media = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const desv = (xs) => { const m = media(xs); return Math.sqrt(media(xs.map((x) => (x - m) ** 2))); };
const tDe = (xs) => (xs.length > 1 ? media(xs) / ((desv(xs) || 1e-9) / Math.sqrt(xs.length)) : 0);
const sumarMeses = (t, n) => { const d = new Date(t); d.setUTCMonth(d.getUTCMonth() + n); return d.getTime(); };
const fecha = (t) => new Date(t).toISOString().slice(0, 10);
const pct = (x) => (x * 100).toFixed(1).replace('.', ',') + '%';
const num = (x, d = 2) => x.toFixed(d).replace('.', ',');
let semilla = 2026;
const aleatorio = () => ((semilla = (semilla * 1664525 + 1013904223) >>> 0) / 2 ** 32);

// ── 1. Todas las operaciones de todas las estrategias ───────────────────

const series = [];
for (const m of MONEDAS) {
  for (const [tf, horas] of Object.entries(TEMPORALIDADES)) {
    const archivo = `datos/binance/${m}-${tf}.json`;
    if (!fs.existsSync(archivo)) { console.log(`falta ${archivo} (corre npm run laboratorio con esa moneda)`); continue; }
    const vs = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    if (vs.length < 400) continue;
    const r = atr(vs);
    series.push({ serie: `${m} ${tf}`, horas, ctx: armarContexto(vs, r, ema(vs.map((v) => v.c), 200), zigzag(vs, r, 2.5)) });
  }
}
console.log(`${series.length} series de precios de Binance. Corriendo ${TODAS.length} estrategias…`);

const operaciones = []; // { id, serie, tEntrada, tSalida, r }
for (const est of TODAS) {
  for (const s of series) {
    const res = probar(s.ctx, est, { ...AJUSTES, horasPorVela: s.horas });
    for (const o of res.operaciones) {
      if (o.salidaPor !== 'fin') operaciones.push({ id: est.id, serie: s.serie, tEntrada: o.tEntrada, tSalida: o.tSalida, r: o.r, riesgoPct: o.riesgoPct });
    }
  }
}
const porId = new Map(TODAS.map((e) => [e.id, []]));
for (const o of operaciones) porId.get(o.id).push(o);

// El azar con las mismas salidas: para saber cuánto da la pura suerte.
const rAzar = [];
for (let k = 1; k <= 30; k++) {
  for (const s of series) for (const o of probar(s.ctx, estrategiaAzar(k * 7919), { ...AJUSTES, horasPorVela: s.horas }).operaciones) rAzar.push(o.r);
}
console.log(`${operaciones.length.toLocaleString('es-CO')} predicciones (operaciones simuladas) de las ${TODAS.length} estrategias, más ${rAzar.length.toLocaleString('es-CO')} al azar para comparar.\n`);

// ── 2. Prueba a ciegas, semestre por semestre ───────────────────────────

function elegir(hasta) {
  const candidatas = [];
  for (const [id, ops] of porId) {
    const rs = ops.filter((o) => o.tSalida < hasta).map((o) => o.r);
    if (rs.length >= MIN_OPERACIONES) candidatas.push({ id, n: rs.length, r: media(rs), t: tDe(rs) });
  }
  return {
    elegidas: candidatas.filter((c) => c.t >= MIN_T).sort((a, b) => b.t - a.t).slice(0, ELEGIR),
    disponibles: candidatas.map((c) => c.id),
  };
}

const ventanas = [];
for (let desde = INICIO_CIEGO; desde < AHORA; desde = sumarMeses(desde, MESES)) {
  const hasta = Math.min(sumarMeses(desde, MESES), AHORA);
  const { elegidas, disponibles } = elegir(desde);
  const ids = new Set(elegidas.map((e) => e.id));
  const ops = operaciones.filter((o) => ids.has(o.id) && o.tEntrada >= desde && o.tEntrada < hasta);
  ventanas.push({ desde, hasta, elegidas, disponibles, ops });
}

/**
 * La cuenta real, con las mismas restricciones que la simulación en vivo:
 * 500 USD, cada operación arriesga RIESGO de lo que hay en la caja, todo lo
 * abierto junto no pasa de 2x, y las órdenes de menos de 10 USD se saltan.
 * Las operaciones se recorren en el orden en que pasaron.
 */
function cuenta(ops) {
  const eventos = [];
  ops.forEach((o, k) => { eventos.push([o.tEntrada, 1, k]); eventos.push([o.tSalida, 0, k]); });
  // En una misma vela, primero las entradas (son a la apertura) y después las
  // salidas (pasan durante la vela). Así una operación que toca el stop en su
  // misma vela de entrada se abre y se cierra, en ese orden.
  eventos.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  let caja = AJUSTES.capital, pico = caja, caida = 0, abierto = 0, abiertas = 0, maxAbiertas = 0;
  const tomadas = new Map();
  const curva = [[ops.length ? Math.min(...ops.map((o) => o.tEntrada)) : 0, caja]];
  for (const [, tipo, k] of eventos) {
    const o = ops[k];
    if (tipo === 1) {
      const nocional = Math.min((caja * RIESGO) / o.riesgoPct, Math.max(0, TOPE * caja - abierto));
      if (nocional < AJUSTES.ordenMinima) continue;
      tomadas.set(k, nocional);
      abierto += nocional;
      maxAbiertas = Math.max(maxAbiertas, ++abiertas);
    } else if (tomadas.has(k)) {
      const nocional = tomadas.get(k);
      caja += o.r * nocional * o.riesgoPct;
      abierto -= nocional;
      abiertas--;
      pico = Math.max(pico, caja);
      caida = Math.max(caida, (pico - caja) / pico);
      curva.push([o.tSalida, caja]);
    }
  }
  return { final: caja / AJUSTES.capital, caidaMax: caida, maxAbiertas, tomadas: tomadas.size, curva };
}

function resumen(ops, desde, hasta) {
  const rs = ops.map((o) => o.r);
  const c = cuenta(ops);
  const anios = (hasta - desde) / (365.25 * 86400_000);
  return {
    operaciones: rs.length, rPromedio: media(rs), t: tDe(rs), aciertos: rs.length ? rs.filter((r) => r > 0).length / rs.length : 0,
    final: c.final, anual: c.final ** (1 / anios) - 1, caidaMax: c.caidaMax, maxAbiertas: c.maxAbiertas, tomadas: c.tomadas,
  };
}

function probabilidadAzar(n, r) {
  let mejores = 0;
  for (let k = 0; k < 4000; k++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += rAzar[Math.floor(aleatorio() * rAzar.length)];
    if (s / n >= r) mejores++;
  }
  return mejores / 4000;
}

const ciegas = ventanas.flatMap((v) => v.ops);
const sistema = { ...resumen(ciegas, INICIO_CIEGO, AHORA), suerte: probabilidadAzar(ciegas.length, media(ciegas.map((o) => o.r))) };

// ¿Elegir con datos pasados sirve, o daría igual escoger 3 al azar?
const alAzar = [];
for (let k = 0; k < 1000; k++) {
  const rs = [];
  for (const v of ventanas) {
    const pool = [...v.disponibles];
    const ids = new Set();
    while (ids.size < Math.min(ELEGIR, pool.length)) ids.add(pool[Math.floor(aleatorio() * pool.length)]);
    for (const o of operaciones) if (ids.has(o.id) && o.tEntrada >= v.desde && o.tEntrada < v.hasta) rs.push(o.r);
  }
  alAzar.push(media(rs));
}
const peoresQueElSistema = alAzar.filter((r) => r < sistema.rPromedio).length / alAzar.length;

// Comparaciones en el mismo periodo a ciegas.
const fija = (id) => resumen(porId.get(id).filter((o) => o.tEntrada >= INICIO_CIEGO), INICIO_CIEGO, AHORA);
const btc = series.find((s) => s.serie === 'BTC 1d').ctx.velas;
const iBtc = btc.findIndex((v) => v.t >= INICIO_CIEGO);
let picoBtc = 0, caidaBtc = 0;
for (let i = iBtc; i < btc.length; i++) { picoBtc = Math.max(picoBtc, btc[i].c); caidaBtc = Math.max(caidaBtc, (picoBtc - btc[i].c) / picoBtc); }
const aniosCiegos = (AHORA - INICIO_CIEGO) / (365.25 * 86400_000);
const btcGuardar = { anual: (btc[btc.length - 1].c / btc[iBtc].o) ** (1 / aniosCiegos) - 1, caidaMax: caidaBtc };

const funciona = sistema.rPromedio > 0 && sistema.t >= 2 && sistema.suerte < 0.05 && sistema.caidaMax <= CAIDA_MAXIMA;

// ── 3. Informe ───────────────────────────────────────────────────────────

const nombre = (id) => TODAS.find((e) => e.id === id).nombre;
console.log('Semestre (a ciegas)        Elegidas                                                      Ops   R prom.');
for (const v of ventanas) {
  const r = resumen(v.ops, v.desde, v.hasta);
  console.log(`${fecha(v.desde)} → ${fecha(v.hasta)}  ${(v.elegidas.map((e) => e.id).join(', ') || '(ninguna pasó: no opera)').padEnd(60)} ${String(r.operaciones).padStart(5)}  ${num(r.rPromedio).padStart(6)}`);
}
console.log(`\nSISTEMA a ciegas (${fecha(INICIO_CIEGO)} → hoy): ${sistema.operaciones} predicciones · acierto ${pct(sistema.aciertos)} · ${num(sistema.rPromedio)} R por operación · t ${num(sistema.t, 1)} · suerte ${pct(sistema.suerte)}`);
console.log(`  cuenta de 500 USD arriesgando ${pct(RIESGO)} por operación (tope ${String(TOPE).replace(".", ",")}x): ${pct(sistema.anual)} al año · peor caída ${pct(sistema.caidaMax)} · ${sistema.tomadas} operaciones cupieron (las demás no tenían espacio) · hasta ${sistema.maxAbiertas} abiertas a la vez`);
console.log(`  frente a escoger 3 estrategias al azar cada semestre: mejor que el ${pct(peoresQueElSistema)} de 1.000 intentos`);
for (const id of ['soldados', 'tendencia', 'cruce-20-50', 'cruce-20-50-compras']) {
  const f = fija(id);
  console.log(`  ${nombre(id)} fija: ${f.operaciones} ops · ${num(f.rPromedio)} R · ${pct(f.anual)} al año · caída ${pct(f.caidaMax)}`);
}
console.log(`  Bitcoin comprado y guardado: ${pct(btcGuardar.anual)} al año · caída ${pct(btcGuardar.caidaMax)}`);
console.log(`\n¿FUNCIONA según las reglas fijadas antes? ${funciona ? 'SÍ' : 'NO'}`);

// Lo que el sistema elige hoy, con todos los datos, para la simulación en vivo.
const hoy = elegir(AHORA);
console.log(`\nHoy elige: ${hoy.elegidas.map((e) => `${nombre(e.id)} (${e.n} ops, ${num(e.r)} R, t ${num(e.t, 1)})`).join(' · ')}`);

// Por año, sobre la MISMA cuenta continua (arrastra lo ganado y lo abierto).
const { curva } = cuenta(ciegas);
const valorEn = (t) => { let v = curva[0][1]; for (const [tt, c] of curva) { if (tt > t) break; v = c; } return v; };
const anual = {};
for (let a = new Date(INICIO_CIEGO).getUTCFullYear(); a <= new Date(AHORA).getUTCFullYear(); a++) {
  const ops = ciegas.filter((o) => new Date(o.tSalida).getUTCFullYear() === a);
  anual[a] = { operaciones: ops.length, rPromedio: media(ops.map((o) => o.r)), rendimiento: valorEn(Date.UTC(a + 1, 0, 1) - 1) / valorEn(Date.UTC(a, 0, 1) - 1) - 1 };
}
console.log('Por año (a ciegas):', Object.entries(anual).map(([a, x]) => `${a}: ${x.operaciones} ops ${num(x.rPromedio)} R ${pct(x.rendimiento)}`).join(' · '));

const reglas = { inicioCiego: fecha(INICIO_CIEGO), meses: MESES, minOperaciones: MIN_OPERACIONES, minT: MIN_T, elegir: ELEGIR, riesgo: RIESGO, caidaMaxima: CAIDA_MAXIMA };
fs.writeFileSync('resultados/sistema.json', JSON.stringify({
  fecha: new Date(AHORA).toISOString(), reglas, monedas: MONEDAS, estrategias: TODAS.length,
  prediccionesTotales: operaciones.length, sistema, funciona, peoresQueElSistema, anual,
  comparaciones: { soldados: fija('soldados'), tendencia: fija('tendencia'), btcGuardar },
  ventanas: ventanas.map((v) => ({ desde: fecha(v.desde), hasta: fecha(v.hasta), elegidas: v.elegidas, ...resumen(v.ops, v.desde, v.hasta) })),
  elegidasHoy: hoy.elegidas,
}, null, 1));

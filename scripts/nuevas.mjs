// Tres estrategias nuevas para ganar con la volatilidad del día a día.
//
// REGLAS FIJADAS ANTES DE VER CUALQUIER RESULTADO (no se cambian después):
//
// 1. "Pánico aislado" (cripto, velas diarias, 13 monedas sin BTC):
//    al cierre de un día, si una moneda cayó más de 2,5 veces su movimiento
//    diario normal (desviación de los 30 días anteriores), cayó al menos 2 de
//    esas unidades más que BTC, y BTC está sobre su media de 50 días (el
//    mercado está sano), se compra a la apertura siguiente. Stop a 2 veces su
//    movimiento diario normal. Se vende al cierre del tercer día.
//    Idea: un desplome que es solo de esa moneda, con el mercado bien, es
//    sobre todo miedo, y el miedo se corrige en pocos días.
//
// 2. "La noche después del susto" (QQQ y SPY, velas diarias):
//    si el día cerró en rojo, con un rango al menos 1,5 veces el promedio de
//    los 20 días anteriores y el cierre en el 25% más bajo del rango, se
//    compra al cierre y se vende a la apertura del día siguiente.
//    Idea: el que vende en pánico al final del día le regala el precio a quien
//    aguanta la noche.
//
// 3. "Compresión que revienta" (cripto, velas de 1 hora, BTC ETH SOL XRP DOGE BNB):
//    si el día de ayer (UTC) tuvo el rango más chico de los últimos 7 días y
//    cerró sobre su media de 20 días, apenas una vela de 1 hora cierra sobre
//    el máximo de ayer se compra a la apertura de la siguiente. Stop en el
//    mínimo de ayer. Se vende al cierre del día. Máximo una por día y moneda.
//    Idea: después de un día quieto, la volatilidad vuelve, y si vuelve hacia
//    arriba en una tendencia alcista, sigue el resto del día.
//
// Costos: cripto como Binance spot (0,1% por orden + 0,05% de deslizamiento,
// 0,1% en los stops); ETFs 0,05% por lado (comisión + diferencial).
//
// "FUNCIONA" solo si, en la parte a ciegas (2024-01-01 → hoy): al menos 30
// operaciones, gana en promedio después de costos, t ≥ 2, le gana a entrar
// al azar (probabilidad < 5%), la cuenta no cae más de 60%, y además ganó en
// promedio en la parte de diseño (antes de 2024).
//
// Uso: npm run nuevas   (usa datos/binance/ y datos/yahoo/; para bajarlos:
// npm run laboratorio, npm run corto-plazo, npm run indices).
// Escribe resultados/nuevas.json.

import fs from 'node:fs';

const DIA = 86400_000, ANIO = 365.25 * DIA;
const CORTE = Date.UTC(2024, 0, 1);
const CRIPTO = { comision: 0.001, desliz: 0.0005, deslizStop: 0.001 };
const ETF = 0.0005;
const MONEDAS = ['ETH', 'SOL', 'XRP', 'DOGE', 'BNB', 'AVAX', 'LINK', 'LTC', 'ADA', 'SUI', 'AAVE', 'DOT', 'NEAR'];
const CORTAS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB'];

const leer = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const media = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const desv = (xs) => { const m = media(xs); return Math.sqrt(media(xs.map((x) => (x - m) ** 2))); };
const tDe = (xs) => (xs.length > 1 ? media(xs) / ((desv(xs) || 1e-9) / Math.sqrt(xs.length)) : 0);
const pct = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1).replace('.', ',')}%`;
const num = (x, d = 2) => `${x >= 0 ? '+' : ''}${x.toFixed(d).replace('.', ',')}`;
let semilla = 20261108;
const azar = () => ((semilla = (semilla * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const elegir = (xs) => xs[Math.floor(azar() * xs.length)];
function emaDe(xs, n) { const k = 2 / (n + 1); const out = []; let e = xs[0]; for (const x of xs) { e = x * k + e * (1 - k); out.push(e); } return out; }
const netoCripto = (entrada, salida, porStop) => (salida * (1 - (porStop ? CRIPTO.deslizStop : CRIPTO.desliz))) / (entrada * (1 + CRIPTO.desliz)) * (1 - CRIPTO.comision) ** 2 - 1;

/** Probabilidad de que entrar al azar (misma cantidad, mismas salidas) dé un promedio igual o mejor. */
function pAzar(rReal, sortear, veces = 2000) {
  const objetivo = media(rReal);
  let mejores = 0;
  for (let k = 0; k < veces; k++) {
    const rs = [];
    for (let j = 0; j < rReal.length; j++) { const r = sortear(); if (r != null) rs.push(r); }
    if (media(rs) >= objetivo) mejores++;
  }
  return mejores / veces;
}

/** Cuenta con riesgo por operación (como el bot: 50 USD, 0,5%, tope 1x, órdenes ≥ 5 USD) o "todo o nada". */
function cuenta(ops, { todoONada = false } = {}) {
  const eventos = [];
  ops.forEach((o, k) => { eventos.push([o.tEntrada, 1, k]); eventos.push([o.tSalida, 0, k]); });
  eventos.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  let caja = 50, abierto = 0, pico = 50, caida = 0;
  const tomadas = new Map();
  for (const [, tipo, k] of eventos) {
    const o = ops[k];
    if (tipo === 1) {
      const n = todoONada ? caja : Math.min((caja * 0.005) / o.riesgoPct, Math.max(0, caja - abierto));
      if (!todoONada && n < Math.max(5, 5 / ((1 - o.riesgoPct) * 0.99)) * 1.02) continue;
      tomadas.set(k, n); abierto += n;
    } else if (tomadas.has(k)) {
      const n = tomadas.get(k); caja += n * o.ret; abierto -= n; tomadas.delete(k);
      pico = Math.max(pico, caja); caida = Math.max(caida, 1 - caja / pico);
    }
  }
  return { final: caja, caida };
}

function juzgar(nombre, ops, sortearDe, opcionesCuenta) {
  const partes = { diseño: ops.filter((o) => o.tEntrada < CORTE), ciego: ops.filter((o) => o.tEntrada >= CORTE) };
  const out = { nombre, partes: {} };
  for (const [k, lista] of Object.entries(partes)) {
    if (!lista.length) { out.partes[k] = { operaciones: 0 }; continue; }
    const rs = lista.map((o) => o.r);
    const c = cuenta(lista, opcionesCuenta);
    const anios = (Math.max(...lista.map((o) => o.tSalida)) - Math.min(...lista.map((o) => o.tEntrada))) / ANIO;
    out.partes[k] = {
      operaciones: lista.length, porMes: lista.length / (anios * 12), aciertos: rs.filter((r) => r > 0).length / rs.length,
      rPromedio: media(rs), t: tDe(rs), retornoPromedio: media(lista.map((o) => o.ret)),
      azar: pAzar(rs, sortearDe(k)), cuentaFinal: c.final, cuentaAnual: (c.final / 50) ** (1 / Math.max(anios, 0.1)) - 1, caidaMax: c.caida,
    };
  }
  const d = out.partes.diseño, c = out.partes.ciego;
  out.funciona = !!(c.operaciones >= 30 && c.rPromedio > 0 && c.t >= 2 && c.azar < 0.05 && c.caidaMax <= 0.6 && d.rPromedio > 0);
  console.log(`\n=== ${nombre} ===`);
  for (const [k, p] of Object.entries(out.partes)) {
    if (!p.operaciones) { console.log(`  ${k}: sin operaciones`); continue; }
    console.log(`  ${k.padEnd(7)}: ${p.operaciones} op (${p.porMes.toFixed(1).replace('.', ',')}/mes) · aciertos ${Math.round(p.aciertos * 100)}% · ${num(p.rPromedio)} R por op (t ${p.t.toFixed(1).replace('.', ',')}) · ${pct(p.retornoPromedio)} por op · el azar da igual o mejor ${Math.round(p.azar * 1000) / 10}% de las veces · cuenta de 50 USD: ${p.cuentaFinal.toFixed(2)} (${pct(p.cuentaAnual)}/año), cae ${Math.round(p.caidaMax * 100)}%`);
  }
  console.log(`  ¿Funciona según las reglas fijadas antes? ${out.funciona ? 'SÍ' : 'NO'}`);
  return out;
}

const resultados = [];

// ── 1. Pánico aislado ────────────────────────────────────────────────────
{
  const series = Object.fromEntries(['BTC', ...MONEDAS].map((m) => [m, leer(`datos/binance/${m}-1d.json`)]));
  const porFecha = Object.fromEntries(Object.entries(series).map(([m, vs]) => [m, new Map(vs.map((v, i) => [v.t, i]))]));
  const btc = series.BTC, emaBtc = emaDe(btc.map((v) => v.c), 50);
  const volDe = (vs, i) => { if (i < 31) return null; const rs = []; for (let k = i - 30; k < i; k++) rs.push(vs[k].c / vs[k - 1].c - 1); return desv(rs); };
  /** Compra a la apertura de i+1, stop a 2 veces su movimiento normal, vende al cierre de i+3. */
  function operar(vs, i, vol) {
    if (i + 3 >= vs.length) return null;
    const entrada = vs[i + 1].o, stop = entrada * (1 - 2 * vol);
    let salida = vs[i + 3].c, porStop = false, tSalida = vs[i + 3].t;
    for (let k = i + 1; k <= i + 3; k++) {
      if (k > i + 1 && vs[k].o <= stop) { salida = vs[k].o; porStop = true; tSalida = vs[k].t; break; }
      if (vs[k].l <= stop) { salida = stop; porStop = true; tSalida = vs[k].t; break; }
    }
    const ret = netoCripto(entrada, salida, porStop);
    return { tEntrada: vs[i + 1].t, tSalida, ret, riesgoPct: 2 * vol, r: ret / (2 * vol) };
  }
  const ops = [], universo = { diseño: [], ciego: [] };
  const libreDesde = {};
  btc.forEach((b, j) => {
    if (j < 51 || b.c <= emaBtc[j]) return;
    const zBtc = (b.c / btc[j - 1].c - 1) / (volDe(btc, j) || Infinity);
    for (const m of MONEDAS) {
      const i = porFecha[m].get(b.t);
      if (i == null) continue;
      const vs = series[m], vol = volDe(vs, i);
      if (!vol) continue;
      (b.t < CORTE ? universo.diseño : universo.ciego).push([m, i, vol]);
      const z = (vs[i].c / vs[i - 1].c - 1) / vol;
      if (z <= -2.5 && z - zBtc <= -2 && b.t >= (libreDesde[m] ?? 0)) {
        const o = operar(vs, i, vol);
        if (o) { ops.push({ ...o, moneda: m }); libreDesde[m] = o.tSalida + DIA; }
      }
    }
  });
  resultados.push(juzgar('1. Pánico aislado (cripto, diario)', ops, (k) => () => { const [m, i, vol] = elegir(universo[k]); return operar(series[m], i, vol)?.r ?? null; }));
}

// ── 2. La noche después del susto ────────────────────────────────────────
for (const id of ['QQQ', 'SPY']) {
  const vs = leer(`datos/yahoo/${id}-1d.json`);
  const rango = (i) => (vs[i].h - vs[i].l) / vs[i - 1].c;
  const promedio = (i) => media(Array.from({ length: 20 }, (_, k) => rango(i - 1 - k)));
  const noche = (i) => { const ret = (vs[i + 1].o * (1 - ETF)) / (vs[i].c * (1 + ETF)) - 1; const riesgoPct = promedio(i); return { tEntrada: vs[i].t + 7 * 3600_000, tSalida: vs[i + 1].t, ret, riesgoPct, r: ret / riesgoPct }; }; // compra al cierre (~6,5 h después de la apertura), vende a la apertura siguiente
  const ops = [], universo = { diseño: [], ciego: [] };
  for (let i = 22; i < vs.length - 1; i++) {
    (vs[i].t < CORTE ? universo.diseño : universo.ciego).push(i);
    const v = vs[i];
    const rojo = v.c < v.o, amplio = rango(i) >= 1.5 * promedio(i), abajo = v.h > v.l && (v.c - v.l) / (v.h - v.l) <= 0.25;
    if (rojo && amplio && abajo) ops.push(noche(i));
  }
  resultados.push(juzgar(`2. La noche después del susto (${id})`, ops, (k) => () => noche(elegir(universo[k])).r, { todoONada: true }));
}

// ── 3. Compresión que revienta ───────────────────────────────────────────
{
  const ops = [], universo = { diseño: [], ciego: [] }, distancias = [];
  const dias = {};
  for (const m of CORTAS) {
    const vs = leer(`datos/binance/${m}-1h.json`);
    // Días UTC completos (24 velas).
    const grupos = new Map();
    for (const v of vs) { const d = Math.floor(v.t / DIA) * DIA; if (!grupos.has(d)) grupos.set(d, []); grupos.get(d).push(v); }
    const lista = [...grupos.entries()].filter(([, h]) => h.length === 24).sort((a, b) => a[0] - b[0])
      .map(([t, h]) => ({ t, h, alto: Math.max(...h.map((x) => x.h)), bajo: Math.min(...h.map((x) => x.l)), cierre: h[23].c }));
    const ema20 = emaDe(lista.map((d) => d.cierre), 20);
    dias[m] = lista;
    for (let j = 27; j < lista.length; j++) {
      const ayer = lista[j - 1], hoy = lista[j];
      if (hoy.t - ayer.t !== DIA) continue;
      (hoy.t < CORTE ? universo.diseño : universo.ciego).push([m, j]);
      const rangoAyer = ayer.alto - ayer.bajo;
      const nr7 = [2, 3, 4, 5, 6, 7].every((k) => rangoAyer < lista[j - k].alto - lista[j - k].bajo);
      if (!nr7 || ayer.cierre <= ema20[j - 1]) continue;
      const k = hoy.h.findIndex((x, n) => n < 23 && x.c > ayer.alto);
      if (k < 0) continue;
      const o = intradia(hoy.h, k + 1, ayer.bajo);
      if (o) { ops.push({ ...o, moneda: m }); distancias.push(o.riesgoPct); }
    }
  }
  /** Compra a la apertura de la vela `desde`, stop fijo, vende al cierre del día. */
  function intradia(horas, desde, stop) {
    const entrada = horas[desde].o;
    if (entrada <= stop) return null;
    let salida = horas[23].c, porStop = false, tSalida = horas[23].t + 3600_000;
    for (let n = desde; n < 24; n++) {
      if (horas[n].o <= stop) { salida = horas[n].o; porStop = true; tSalida = horas[n].t; break; }
      if (horas[n].l <= stop) { salida = stop; porStop = true; tSalida = horas[n].t; break; }
    }
    const ret = netoCripto(entrada, salida, porStop), riesgoPct = (entrada - stop) / entrada;
    return { tEntrada: horas[desde].t, tSalida, ret, riesgoPct, r: ret / riesgoPct };
  }
  ops.sort((a, b) => a.tEntrada - b.tEntrada);
  resultados.push(juzgar('3. Compresión que revienta (cripto, 1 hora)', ops, (k) => () => {
    const [m, j] = elegir(universo[k]);
    const horas = dias[m][j].h, desde = 1 + Math.floor(azar() * 23), dist = elegir(distancias);
    return intradia(horas, desde, horas[desde].o * (1 - dist))?.r ?? null;
  }));
}

fs.mkdirSync('resultados', { recursive: true });
fs.writeFileSync('resultados/nuevas.json', JSON.stringify({ generado: new Date().toISOString(), corte: '2024-01-01', costos: { cripto: CRIPTO, etf: ETF }, resultados }, null, 1) + '\n');
console.log('\nGuardado en resultados/nuevas.json');

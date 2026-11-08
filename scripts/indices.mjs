// ¿Se gana más con el Nasdaq 100 o el S&P 500 que con cripto?
//
// Prueba las estrategias de swing del laboratorio (solo compras, velas
// diarias) en QQQ (Nasdaq 100) y SPY (S&P 500), con dividendos incluidos, y
// las compara con comprar y guardar, con versiones apalancadas 2x y 3x (como
// QLD/TQQQ o SSO/UPRO, simuladas con la historia de los índices desde 1985 y
// 1970) y con el bot de cripto.
//
// "Todo o nada": cuando la estrategia está comprada, todo lo de la cuenta está
// en el ETF; si no, en efectivo (sin intereses, para no inflar nada).
// Costos de un bróker internacional: 0,05% por orden más 0,02% de deslizamiento.
//
// Uso: npm run indices   (baja los precios de Yahoo Finance a datos/yahoo/)
// Escribe resultados/indices.json.

import fs from 'node:fs';
import { AJUSTES, armarContexto, atr, ema, estrategiaPorId, probar, zigzag } from '../.compilado/lab.mjs';

const DIA = 86400_000, ANIO = 365.25 * DIA;
const COSTOS = { comision: 0.0005, desliz: 0.0002, deslizStop: 0.0005, fundingHora: 0 };
const ESTRATEGIAS = ['cruce-20-50-compras', 'cruce-50-200-compras', 'tendencia-20-10-compras', 'tendencia-55-20-compras', 'rsi-2-10-compras', 'rsi-14-30-compras', 'bollinger-compras', 'soldados'];
const INSTRUMENTOS = [
  { id: 'QQQ', nombre: 'Nasdaq 100 (QQQ)', ajustar: true },
  { id: 'SPY', nombre: 'S&P 500 (SPY)', ajustar: true },
];
const INDICES = [
  { id: '^NDX', nombre: 'Nasdaq 100 (índice, desde 1985)', dividendos: 0.008 },
  { id: '^GSPC', nombre: 'S&P 500 (índice, desde 1970)', dividendos: 0.025 },
];
const DESDE = { 'desde el inicio': 0, 'desde 2010': Date.UTC(2010, 0, 1), 'desde 2018': Date.UTC(2018, 0, 1), 'desde 2021': Date.UTC(2021, 0, 1) };

async function yahoo(simbolo, ajustar) {
  const archivo = `datos/yahoo/${simbolo.replace('^', '')}-1d.json`;
  if (!fs.existsSync(archivo)) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?period1=0&period2=9999999999&interval=1d&events=div%2Csplit&includeAdjustedClose=true`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (laboratorio de trading)' } });
    if (!r.ok) throw new Error(`Yahoo ${simbolo}: ${r.status}`);
    const j = (await r.json()).chart.result[0];
    const q = j.indicators.quote[0], adj = j.indicators.adjclose?.[0]?.adjclose;
    const vs = [];
    j.timestamp.forEach((t, i) => {
      const [o, h, l, c] = [q.open[i], q.high[i], q.low[i], q.close[i]];
      if (![o, h, l, c].every((x) => x > 0)) return;
      const f = ajustar && adj?.[i] > 0 ? adj[i] / c : 1; // dividendos y splits incluidos
      vs.push({ t: t * 1000, o: o * f, h: h * f, l: l * f, c: c * f });
    });
    fs.mkdirSync('datos/yahoo', { recursive: true });
    fs.writeFileSync(archivo, JSON.stringify(vs));
  }
  return JSON.parse(fs.readFileSync(archivo, 'utf8'));
}

const soloCompras = (est) => ({ ...est, senal: (ctx, i, m) => { const s = est.senal(ctx, i, m); return s && s.lado === 1 ? s : null; } });
const anual = (multiplo, desde, hasta) => multiplo ** (ANIO / (hasta - desde)) - 1;
const pct = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1).replace('.', ',')}%`;
const p0 = (x) => `${Math.round(x * 100)}%`;

/** Cuánto vale 1 dólar día a día (al cierre) entre `desde` y el final. */
function curvaGuardar(vs, desde) {
  const i0 = vs.findIndex((v) => v.t >= desde);
  return vs.slice(i0).map((v) => [v.t, v.c / vs[i0].c]);
}

/** "Todo o nada" con las operaciones de una estrategia, valorado al cierre de cada día. */
function curvaEstrategia(vs, ops, desde) {
  const lista = ops.filter((o) => o.tEntrada >= desde);
  const curva = [];
  let valor = 1, k = 0, dentro = null;
  for (const v of vs) {
    if (v.t < desde) continue;
    if (!dentro && k < lista.length && lista[k].tEntrada <= v.t) dentro = { o: lista[k], base: valor };
    if (dentro && dentro.o.tSalida <= v.t) {
      valor = dentro.base * (1 + dentro.o.r * dentro.o.riesgoPct); // resultado neto de costos
      dentro = null; k++;
      if (k < lista.length && lista[k].tEntrada <= v.t) dentro = { o: lista[k], base: valor };
    }
    const marcado = dentro ? dentro.base * (v.c / dentro.o.entrada) * (1 - COSTOS.comision) : valor;
    curva.push([v.t, marcado]);
  }
  return curva;
}

/** Apalancado diario (como TQQQ): L veces el movimiento de cada día, menos sus costos. */
function curvaApalancada(vs, L, dividendos, desde) {
  const costoDia = (0.0095 + (L - 1) * 0.03) / 252; // comisión del fondo + lo que paga por financiarse
  const i0 = vs.findIndex((v) => v.t >= desde);
  let valor = 1;
  const curva = [[vs[i0].t, 1]];
  for (let i = i0 + 1; i < vs.length; i++) {
    const r = vs[i].c / vs[i - 1].c - 1 + dividendos / 252;
    valor = Math.max(0, valor * (1 + L * r - costoDia));
    curva.push([vs[i].t, valor]);
  }
  return curva;
}

function medir(curva) {
  let pico = 0, caida = 0;
  for (const [, v] of curva) { pico = Math.max(pico, v); if (pico > 0) caida = Math.max(caida, 1 - v / pico); }
  const [t0, v0] = curva[0], [t1, v1] = curva[curva.length - 1];
  // Qué tan seguido gana a 12 meses, arrancando cualquier semana.
  const ventanas = [];
  for (let a = 0, b = 0; a < curva.length; a += 5) {
    while (b < curva.length && curva[b][0] < curva[a][0] + ANIO) b++;
    if (b >= curva.length) break;
    ventanas.push(curva[b][1] / curva[a][1] - 1);
  }
  return {
    multiplo: v1 / v0, anual: anual(v1 / v0, t0, t1), caidaMax: caida,
    gana12m: ventanas.length ? ventanas.filter((x) => x > 0).length / ventanas.length : null,
  };
}

const salida = { generado: new Date().toISOString(), costos: COSTOS, instrumentos: {}, apalancados: {} };

for (const ins of INSTRUMENTOS) {
  const vs = await yahoo(ins.id, ins.ajustar);
  const r = atr(vs);
  const ctx = armarContexto(vs, r, ema(vs.map((v) => v.c), 200), zigzag(vs, r, 2.5));
  const filas = {};
  filas['Comprar y guardar'] = Object.fromEntries(Object.entries(DESDE).map(([k, d]) => [k, medir(curvaGuardar(vs, Math.max(d, vs[200].t)))]));
  for (const id of ESTRATEGIAS) {
    const ops = probar(ctx, soloCompras(estrategiaPorId(id)), { ...AJUSTES, ...COSTOS, horasPorVela: 24 }).operaciones.filter((o) => o.salidaPor !== 'fin');
    const dias = ops.reduce((s, o) => s + (o.tSalida - o.tEntrada), 0) / DIA;
    filas[id] = Object.fromEntries(Object.entries(DESDE).map(([k, d]) => [k, medir(curvaEstrategia(vs, ops, Math.max(d, vs[200].t)))]));
    filas[id].operaciones = ops.length;
    filas[id].tiempoDentro = dias / ((vs.at(-1).t - vs[200].t) / DIA);
  }
  salida.instrumentos[ins.id] = { nombre: ins.nombre, desde: new Date(vs[200].t).toISOString().slice(0, 10), filas };
  console.log(`\n=== ${ins.nombre}, velas diarias, desde ${salida.instrumentos[ins.id].desde} (con dividendos) ===`);
  console.log('                          | desde el inicio            | desde 2010                 | desde 2018                 | desde 2021');
  for (const [id, f] of Object.entries(filas)) {
    const celdas = Object.keys(DESDE).map((k) => `${pct(f[k].anual).padStart(7)}/año, cae ${p0(f[k].caidaMax).padStart(3)}, 12m ${p0(f[k].gana12m ?? 0).padStart(3)}`);
    console.log(`${id.padEnd(26)}| ${celdas.join(' | ')}${f.operaciones ? `  (${f.operaciones} op, comprado ${p0(f.tiempoDentro)} del tiempo)` : ''}`);
  }
}

for (const ind of INDICES) {
  const vs = await yahoo(ind.id, false);
  const filas = {};
  for (const L of [1, 2, 3]) {
    filas[`${L}x`] = Object.fromEntries(Object.entries({ 'desde el inicio': vs[0].t, 'desde 2000': Date.UTC(2000, 0, 1), 'desde 2010': Date.UTC(2010, 0, 1), 'desde 2021': Date.UTC(2021, 0, 1) })
      .map(([k, d]) => [k, medir(curvaApalancada(vs, L, ind.dividendos, Math.max(d, vs[0].t)))]));
  }
  salida.apalancados[ind.id] = { nombre: ind.nombre, filas };
  console.log(`\n=== ${ind.nombre}: guardar con apalancamiento diario (como QLD/TQQQ, SSO/UPRO) ===`);
  for (const [id, f] of Object.entries(filas)) {
    console.log(`${id}: ${Object.entries(f).map(([k, m]) => `${k} ${pct(m.anual)}/año (x${m.multiplo.toFixed(1).replace('.', ',')}), cae ${p0(m.caidaMax)}`).join(' · ')}`);
  }
}

fs.mkdirSync('resultados', { recursive: true });
fs.writeFileSync('resultados/indices.json', JSON.stringify(salida, null, 1) + '\n');
console.log('\nGuardado en resultados/indices.json');

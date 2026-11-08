// ¿Qué tan seguido gana el bot real, y cuánto conviene arriesgar por operación?
//
// Repite las reglas del bot (BOT_REAL en src/vivo/config.ts): cruce de medias
// 20/50 solo compras, velas de 4 horas, 14 monedas, 50 USD, tope 1x (spot),
// comisión 0,1%, orden mínima de Binance (también la del stop) y el freno.
// Lo prende con 50 USD en cada semana desde 2018 y mira cómo termina después
// de 1, 3, 6, 12 y 24 meses. Lo hace con varios tamaños de riesgo.
//
// Uso: npm run probabilidades   (usa datos/binance/*-4h.json; si faltan, corre
// antes `LAB_MONEDAS=... npm run laboratorio`). Escribe resultados/probabilidades.json.
// RIESGOS=0.005,0.01 PISO=20 npm run probabilidades   → otros valores.

import fs from 'node:fs';
import { AJUSTES, armarContexto, atr, ema, estrategiaPorId, probar, zigzag } from '../.compilado/lab.mjs';

const MONEDAS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB', 'AVAX', 'LINK', 'LTC', 'ADA', 'SUI', 'AAVE', 'DOT', 'NEAR'];
const CAPITAL = 50, TOPE = 1, COMISION = 0.001, MINIMO_BINANCE = 5;
const PISO = Number(process.env.PISO ?? 20);
const RIESGOS = (process.env.RIESGOS || '0.0025,0.005,0.0075,0.01,0.02,0.03').split(',').map(Number);
const MESES = [1, 3, 6, 12, 24];
const DESDE = { 'desde 2018': Date.UTC(2018, 0, 1), 'desde 2021': Date.UTC(2021, 0, 1), 'desde 2023': Date.UTC(2023, 0, 1) };
const DIA = 86400_000;

const est = estrategiaPorId('cruce-20-50-compras');
const velas = {};
const ops = [];
for (const m of MONEDAS) {
  const archivo = `datos/binance/${m}-4h.json`;
  if (!fs.existsSync(archivo)) { console.log(`falta ${archivo} (corre npm run laboratorio con esa moneda)`); continue; }
  const vs = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  velas[m] = vs;
  const r = atr(vs);
  const ctx = armarContexto(vs, r, ema(vs.map((v) => v.c), 200), zigzag(vs, r, 2.5));
  for (const o of probar(ctx, est, { ...AJUSTES, comision: COMISION, fundingHora: 0, horasPorVela: 4 }).operaciones) {
    if (o.salidaPor !== 'fin') ops.push({ ...o, m });
  }
}
ops.sort((a, b) => a.tEntrada - b.tEntrada);
const FIN = Math.max(...Object.values(velas).map((vs) => vs.at(-1).t));

function precio(m, t) {
  const vs = velas[m];
  if (t < vs[0].t) return null;
  let lo = 0, hi = vs.length - 1;
  while (lo < hi) { const md = (lo + hi + 1) >> 1; if (vs[md].t <= t) lo = md; else hi = md - 1; }
  return vs[lo].c;
}

/** Una cuenta nueva de 50 USD entre `desde` y `hasta`, con lo abierto valorado a precio de mercado. */
function cuenta(desde, hasta, riesgo) {
  const lista = ops.filter((o) => o.tEntrada >= desde && o.tEntrada < hasta);
  const eventos = [];
  lista.forEach((o, k) => { eventos.push([o.tEntrada, 1, k]); if (o.tSalida < hasta) eventos.push([o.tSalida, 0, k]); });
  // En una misma vela, primero las entradas (a la apertura) y después las salidas.
  eventos.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  let caja = CAPITAL, abierto = 0, pico = CAPITAL, caida = 0, hechas = 0;
  const tomadas = new Map();
  const valor = (t) => {
    let v = caja;
    for (const [k, n] of tomadas) { const o = lista[k]; v += n * ((precio(o.m, t) ?? o.entrada) / o.entrada - 1) - n * COMISION; }
    return v;
  };
  for (const [t, tipo, k] of eventos) {
    const o = lista[k];
    if (tipo === 1) {
      const n = Math.min((caja * riesgo) / o.riesgoPct, Math.max(0, TOPE * caja - abierto));
      // Como el bot: la compra y la orden de stop deben pasar el mínimo de Binance.
      const minimo = Math.max(MINIMO_BINANCE, MINIMO_BINANCE / ((1 - o.riesgoPct) * 0.99)) * 1.02;
      if (n < minimo) continue;
      tomadas.set(k, n); abierto += n; hechas++;
    } else if (tomadas.has(k)) {
      const n = tomadas.get(k);
      caja += o.r * n * o.riesgoPct; abierto -= n; tomadas.delete(k);
    }
    const v = valor(t);
    pico = Math.max(pico, v); caida = Math.max(caida, 1 - v / pico);
    if (v < PISO) return { final: v, piso: true, caida, hechas };
  }
  return { final: valor(hasta), piso: false, caida, hechas };
}

const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const pct = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1).replace('.', ',')}%`;
const p0 = (x) => `${Math.round(x * 100)}%`;

console.log(`${ops.length} operaciones posibles de cruce 20/50 (solo compras) en ${Object.keys(velas).length} monedas. Freno: ${PISO} USD.\n`);
const salida = { generado: new Date().toISOString(), reglas: { capital: CAPITAL, tope: TOPE, comision: COMISION, piso: PISO }, porRiesgo: {} };
for (const riesgo of RIESGOS) {
  const r = { ventanas: {}, porAnio: {}, todo: {} };
  console.log(`── Arriesgando ${(riesgo * 100).toString().replace('.', ',')}% por operación`);
  for (const [nombre, inicio] of Object.entries(DESDE)) {
    for (const meses of MESES) {
      const largo = meses * 30.44 * DIA;
      const rs = []; let piso = 0;
      for (let t = inicio; t + largo <= FIN; t += 7 * DIA) { const c = cuenta(t, t + largo, riesgo); rs.push(c.final / CAPITAL - 1); if (c.piso) piso++; }
      if (!rs.length) continue;
      const v = {
        arranques: rs.length, gana: rs.filter((x) => x > 0).length / rs.length, piso: piso / rs.length,
        malo: q(rs, 0.1), tipico: q(rs, 0.5), bueno: q(rs, 0.9), mejor: Math.max(...rs), peor: Math.min(...rs),
        promedio: rs.reduce((s, x) => s + x, 0) / rs.length,
      };
      r.ventanas[`${nombre}, ${meses} meses`] = v;
      if (meses === 12 || meses === 24) {
        console.log(`  ${nombre}, ${String(meses).padStart(2)} meses: gana ${p0(v.gana)} de las veces · se apaga ${p0(v.piso)} · típico ${pct(v.tipico)} (malo ${pct(v.malo)}, bueno ${pct(v.bueno)})`);
      }
    }
    const c = cuenta(inicio, FIN, riesgo);
    r.todo[nombre] = { termina: +c.final.toFixed(2), operaciones: c.hechas, peorCaida: +c.caida.toFixed(3), seApago: c.piso };
    console.log(`  una sola cuenta ${nombre} hasta hoy: ${c.final.toFixed(0)} USD, ${c.hechas} operaciones, peor caída ${p0(c.caida)}${c.piso ? ' (se apagó)' : ''}`);
  }
  for (let a = 2018; a <= new Date(FIN).getUTCFullYear(); a++) {
    const c = cuenta(Date.UTC(a, 0, 1), Math.min(Date.UTC(a + 1, 0, 1), FIN), riesgo);
    r.porAnio[a] = { resultado: +(c.final / CAPITAL - 1).toFixed(3), seApago: c.piso };
  }
  console.log(`  año por año: ${Object.entries(r.porAnio).map(([a, x]) => `${a} ${pct(x.resultado)}${x.seApago ? '*' : ''}`).join(' · ')}\n`);
  salida.porRiesgo[riesgo] = r;
}
fs.mkdirSync('resultados', { recursive: true });
fs.writeFileSync('resultados/probabilidades.json', JSON.stringify(salida, null, 1) + '\n');
console.log('Guardado en resultados/probabilidades.json (* = se apagó por el freno).');

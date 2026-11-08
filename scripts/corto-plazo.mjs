// ¿Sirve hacer muchas operaciones cortas y ganar poco a poco?
// Prueba las mismas estrategias en velas de 5 minutos, 15 minutos, 1 hora y
// 4 horas, con dos escenarios de costos, y un bot de grilla.
//
// Uso: npm run corto-plazo   (baja de Binance lo que falte a datos/binance/)
// Resultado: resultados/corto-plazo.json

import fs from 'node:fs';
import { AJUSTES, TODAS, armarContexto, atr, binance, ema, estrategiaAzar, probar, simularGrilla, zigzag } from '../.compilado/lab.mjs';

const MONEDAS = (process.env.LAB_MONEDAS || 'BTC,ETH,SOL,XRP,DOGE,BNB').split(',');
const AHORA = Date.now();
const ANIO = 365.25 * 86400_000;
// Temporalidad → horas por vela y cuántos años de historia (las cortas tienen muchísimas velas).
const TEMPORALIDADES = [
  { tf: '5m', horas: 5 / 60, anios: 1 },
  { tf: '15m', horas: 0.25, anios: 2 },
  { tf: '1h', horas: 1, anios: 4 },
  { tf: '4h', horas: 4, anios: 4 },
];
const IDS = ['rsi-2-10', 'rsi-2-10-compras', 'rsi-14-30', 'bollinger', 'bollinger-compras', 'envolvente', 'martillo',
  'soldados', 'soldados-sin-2r', 'tendencia-20-10', 'cruce-20-50', 'fib-50-618'];
const COSTOS = {
  'a mercado': { comision: AJUSTES.comision, desliz: AJUSTES.desliz, deslizStop: AJUSTES.deslizStop },
  // El mejor caso: órdenes límite que siempre se llenan (en la vida real no pasa).
  'límite (mejor caso)': { comision: 0.0002, desliz: 0, deslizStop: 0.0005 },
};
const RIESGO = 0.005;

const media = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const desv = (xs) => { const m = media(xs); return Math.sqrt(media(xs.map((x) => (x - m) ** 2))); };
const tDe = (xs) => (xs.length > 1 ? media(xs) / ((desv(xs) || 1e-9) / Math.sqrt(xs.length)) : 0);
const pct = (x) => (x * 100).toFixed(1).replace('.', ',') + '%';
const num = (x, d = 2) => x.toFixed(d).replace('.', ',');
let semilla = 99;
const aleatorio = () => ((semilla = (semilla * 1664525 + 1013904223) >>> 0) / 2 ** 32);

async function velas(moneda, tf, horas, anios) {
  const archivo = `datos/binance/${moneda}-${tf}.json`;
  let vs;
  if (fs.existsSync(archivo)) vs = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  else {
    process.stdout.write(`bajando ${moneda} ${tf}… `);
    vs = await binance.historia(moneda, horas, AHORA, AHORA - anios * ANIO - 300 * horas * 3600_000);
    fs.mkdirSync('datos/binance', { recursive: true });
    fs.writeFileSync(archivo, JSON.stringify(vs));
    console.log(`${vs.length} velas`);
  }
  return vs.filter((v) => v.t >= AHORA - anios * ANIO - 300 * horas * 3600_000);
}

/** Cuenta de 500 USD con las reglas de la simulación en vivo (tope 2x, órdenes ≥ 10 USD). */
function cuenta(ops, desde, hasta) {
  const eventos = [];
  ops.forEach((o, k) => { eventos.push([o.tEntrada, 1, k]); eventos.push([o.tSalida, 0, k]); });
  eventos.sort((a, b) => a[0] - b[0] || b[1] - a[1]); // en una misma vela, primero la entrada
  let caja = AJUSTES.capital, pico = caja, caida = 0, abierto = 0;
  const tomadas = new Map();
  for (const [, tipo, k] of eventos) {
    const o = ops[k];
    if (tipo === 1) {
      const nocional = Math.min((caja * RIESGO) / o.riesgoPct, Math.max(0, AJUSTES.apalancamientoMax * caja - abierto));
      if (nocional < AJUSTES.ordenMinima) continue;
      tomadas.set(k, nocional);
      abierto += nocional;
    } else if (tomadas.has(k)) {
      const n = tomadas.get(k);
      caja += o.r * n * o.riesgoPct;
      abierto -= n;
      pico = Math.max(pico, caja);
      caida = Math.max(caida, (pico - caja) / pico);
    }
  }
  return { anual: caja > 0 ? (caja / AJUSTES.capital) ** (ANIO / (hasta - desde)) - 1 : -1, caidaMax: caida };
}

const resultados = { fecha: new Date(AHORA).toISOString(), monedas: MONEDAS, riesgo: RIESGO, temporalidades: [], grilla: [] };

for (const { tf, horas, anios } of TEMPORALIDADES) {
  const series = [];
  for (const m of MONEDAS) {
    const vs = await velas(m, tf, horas, anios);
    const r = atr(vs);
    series.push({ serie: `${m} ${tf}`, ctx: armarContexto(vs, r, ema(vs.map((v) => v.c), 200), zigzag(vs, r, 2.5)) });
  }
  const desde = AHORA - anios * ANIO, corte = AHORA - 0.3 * anios * ANIO;
  console.log(`\n══ Velas de ${tf} · ${MONEDAS.length} monedas · último${anios > 1 ? 's ' + anios + ' años' : ' año'} ══`);
  const bloque = { tf, anios, escenarios: {} };
  for (const [escenario, costos] of Object.entries(COSTOS)) {
    const aj = { ...AJUSTES, ...costos, horasPorVela: horas };
    const rAzar = [];
    for (let k = 1; k <= 8; k++) for (const s of series) for (const o of probar(s.ctx, estrategiaAzar(k * 31), aj).operaciones) if (o.tEntrada >= desde) rAzar.push(o.r);
    const suerte = (n, r) => {
      if (!n || !rAzar.length) return 1;
      let mejores = 0;
      for (let k = 0; k < 2000; k++) { let s = 0; for (let j = 0; j < n; j++) s += rAzar[Math.floor(aleatorio() * rAzar.length)]; if (s / n >= r) mejores++; }
      return mejores / 2000;
    };
    const filas = [];
    for (const id of IDS) {
      const est = TODAS.find((e) => e.id === id);
      const ops = series.flatMap((s) => probar(s.ctx, est, aj).operaciones.filter((o) => o.salidaPor !== 'fin' && o.tEntrada >= desde));
      const rs = ops.map((o) => o.r);
      // Lo que cuestan comisión y deslizamiento, medido en R (lo arriesgado).
      const costoR = media(ops.map((o) => (2 * costos.comision + 2 * costos.desliz) / o.riesgoPct));
      const c = cuenta(ops, desde, AHORA);
      filas.push({
        id, nombre: est.nombre, operaciones: rs.length, porDia: rs.length / (anios * 365.25), rPromedio: media(rs), t: tDe(rs),
        aciertos: rs.length ? rs.filter((r) => r > 0).length / rs.length : 0, costoR,
        vieja: media(ops.filter((o) => o.tEntrada < corte).map((o) => o.r)), nueva: media(ops.filter((o) => o.tEntrada >= corte).map((o) => o.r)),
        suerte: suerte(rs.length, media(rs)), anual: c.anual, caidaMax: c.caidaMax,
      });
    }
    filas.sort((a, b) => b.rPromedio - a.rPromedio);
    bloque.escenarios[escenario] = { azarR: media(rAzar), filas };
    console.log(`\n  Órdenes ${escenario}: entrar al azar da ${num(media(rAzar))} R por operación`);
    console.log('  Estrategia                                Ops/día  Costo   R prom.  t      Vieja/Nueva     Suerte  Cuenta 0,5%      Caída');
    for (const f of filas) {
      console.log(`  ${f.nombre.padEnd(41).slice(0, 41)} ${num(f.porDia, 1).padStart(6)}  ${num(f.costoR).padStart(5)}R ${num(f.rPromedio).padStart(6)}  ${num(f.t, 1).padStart(5)}  ${num(f.vieja).padStart(6)}/${num(f.nueva).padStart(6)}  ${pct(f.suerte).padStart(6)}  ${pct(f.anual).padStart(7)} al año  ${pct(f.caidaMax).padStart(6)}`);
    }
  }
  resultados.temporalidades.push(bloque);
}

// ── Bot de grilla ────────────────────────────────────────────────────────
console.log('\n══ Bot de grilla (spot, se rearma cada 30 días) · velas de 15 minutos · últimos 2 años ══');
console.log('  Moneda  Rango  Escalones  Vueltas   Ganado en vueltas  Monedas que quedaron  Al año   Caída   | Solo guardar: al año  caída');
for (const m of ['BTC', 'ETH', 'SOL']) {
  const vs = await velas(m, '15m', 0.25, 2);
  const guardar = vs[vs.length - 1].c / vs[0].o;
  let pico = 0, caidaG = 0;
  for (const v of vs) { pico = Math.max(pico, v.c); caidaG = Math.max(caidaG, (pico - v.c) / pico); }
  const anualG = guardar ** (ANIO / (vs[vs.length - 1].t - vs[0].t)) - 1;
  for (const rango of [0.05, 0.1, 0.2]) {
    for (const niveles of [10, 30]) {
      const g = simularGrilla(vs, { capital: 500, rango, niveles, dias: 30, comision: 0.0002, comisionMercado: AJUSTES.comision });
      resultados.grilla.push({ moneda: m, rango, niveles, ...g, guardarAnual: anualG, guardarCaida: caidaG });
      console.log(`  ${m.padEnd(6)} ±${String(rango * 100).padStart(2)}%  ${String(niveles).padStart(9)}  ${String(g.vueltas).padStart(7)}   ${('$' + num(g.gananciaVueltas, 0)).padStart(17)}  ${('$' + num(g.resultadoInventario, 0)).padStart(20)}  ${pct(g.anual).padStart(6)}  ${pct(g.caidaMax).padStart(6)}  |  ${pct(anualG).padStart(18)}  ${pct(caidaG).padStart(5)}`);
    }
  }
}

fs.writeFileSync('resultados/corto-plazo.json', JSON.stringify(resultados, null, 1));

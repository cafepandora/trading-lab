// Busca traders de Hyperliquid que lleven AÑOS ganando (no solo un buen mes),
// para copiarlos en papel en la simulación en vivo.
//
// Uso: npm run traders   → escribe src/vivo/traders.json
//
// Filtros (todos con datos públicos):
// - cuenta con al menos 1,75 años de historia de futuros (Hyperliquid solo
//   muestra historia desde fines de 2024: nadie aparece con más de ~1,9 años);
// - ganó en al menos el 70% de los trimestres y nunca cayó más de 40%;
// - sigue activo (operó en los últimos 30 días) en el mercado principal;
// - no es un bot (no opera cada pocos minutos) y no usa más de 10x hoy.
// Ojo: entre decenas de miles de cuentas, algunas se ven así por suerte.

import fs from 'node:fs';

const API = 'https://api.hyperliquid.xyz/info';
const RANKING = 'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard';
const CUANTOS = Number(process.argv[2]) || 3;
const DIA = 86400_000;
const MIN_ANIOS = 1.75;
const AHORA = Date.now();
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (x) => Number(x) || 0;

async function info(cuerpo, intento = 0) {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  if (r.status === 429 && intento < 5) { await esperar(5000 * (intento + 1)); return info(cuerpo, intento + 1); }
  if (!r.ok) throw new Error(`${cuerpo.type}: HTTP ${r.status}`);
  return r.json();
}

function historia(serie) {
  const pnl = serie.pnlHistory.map(([t, v]) => [t, num(v)]);
  const av = serie.accountValueHistory.map(([t, v]) => [t, num(v)]);
  if (pnl.length < 8) return null;
  const desde = pnl[0][0];
  // Curva sin depósitos ni retiros: valor medio de la cuenta + ganancia acumulada.
  const base = Math.max(av.reduce((s, [, v]) => s + v, 0) / av.length, 1);
  const curva = pnl.map(([t, p]) => [t, base + p - pnl[0][1]]);
  let pico = curva[0][1], caida = 0;
  for (const [, v] of curva) { pico = Math.max(pico, v); caida = Math.max(caida, (pico - v) / pico); }
  // Trimestres: cuánto cambió la ganancia de punta a punta en cada uno.
  const trimestres = [];
  for (let t = desde; t < AHORA; t += 91 * DIA) {
    const dentro = pnl.filter(([x]) => x >= t && x < t + 91 * DIA);
    if (dentro.length >= 1) {
      const antes = [...pnl].reverse().find(([x]) => x < t)?.[1] ?? dentro[0][1];
      trimestres.push(dentro[dentro.length - 1][1] - antes);
    }
  }
  return {
    anios: (AHORA - desde) / (365.25 * DIA),
    ganancia: pnl[pnl.length - 1][1] - pnl[0][1],
    caidaMax: caida,
    trimestres: trimestres.length,
    trimestresEnVerde: trimestres.length ? trimestres.filter((x) => x > 0).length / trimestres.length : 0,
  };
}

async function revisar(direccion) {
  const p = Object.fromEntries(await info({ type: 'portfolio', user: direccion }));
  const h = p.perpAllTime && historia(p.perpAllTime);
  if (!h) return { direccion, descarte: 'sin historia' };
  if (h.anios < MIN_ANIOS) return { direccion, ...h, descarte: `solo ${h.anios.toFixed(1)} años de historia` };
  if (h.ganancia <= 0) return { direccion, ...h, descarte: 'en total pierde' };
  if (h.trimestresEnVerde < 0.7) return { direccion, ...h, descarte: `ganó solo en el ${Math.round(h.trimestresEnVerde * 100)}% de los trimestres` };
  if (h.caidaMax > 0.4) return { direccion, ...h, descarte: `llegó a caer ${Math.round(h.caidaMax * 100)}%` };
  await esperar(1500);
  const fills = await info({ type: 'userFillsByTime', user: direccion, startTime: AHORA - 30 * DIA, aggregateByTime: true });
  const principal = fills.filter((f) => !/[:/@]/.test(f.coin));
  if (fills.length >= 2000) return { direccion, ...h, descarte: 'opera demasiado seguido (bot)' };
  if (principal.length < 5) return { direccion, ...h, descarte: 'casi no operó en el mercado principal este mes' };
  if (principal.length / fills.length < 0.8) return { direccion, ...h, descarte: 'opera sobre todo fuera del mercado principal' };
  await esperar(1500);
  const estado = await info({ type: 'clearinghouseState', user: direccion });
  const valor = num(estado.marginSummary?.accountValue);
  const apal = valor > 0 ? num(estado.marginSummary?.totalNtlPos) / valor : 0;
  if (valor < 10_000) return { direccion, ...h, descarte: 'cuenta pequeña en el mercado principal' };
  if (apal > 10) return { direccion, ...h, descarte: `usa ${apal.toFixed(0)}x hoy` };
  const monedas = {};
  for (const f of principal) monedas[f.coin] = (monedas[f.coin] || 0) + num(f.px) * num(f.sz);
  return {
    direccion, ...h, valorCuenta: valor, apalancamiento: apal, operaciones30d: fills.length,
    monedas: Object.entries(monedas).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c]) => c),
  };
}

console.log('Bajando el ranking de Hyperliquid…');
const filas = (await (await fetch(RANKING)).json()).leaderboardRows;
const ventanas = (f) => Object.fromEntries(f.windowPerformances.map(([w, p]) => [w, { pnl: num(p.pnl), roi: num(p.roi), vlm: num(p.vlm) }]));
const previas = filas.map((f) => ({ direccion: f.ethAddress, valor: num(f.accountValue), v: ventanas(f) }))
  .filter(({ valor, v }) => v.allTime && v.month && valor >= 50_000 && valor <= 50_000_000
    && v.allTime.pnl >= 100_000 && v.allTime.roi >= 0.5 && v.month.roi > -0.1
    && v.month.vlm >= 0.3 * valor && v.month.vlm <= 40 * valor)
  .sort((a, b) => b.v.allTime.pnl - a.v.allTime.pnl)
  .slice(0, 160);
console.log(`${filas.length} cuentas en el ranking; ${previas.length} pasan el primer filtro. Revisando su historia…`);

const elegidos = [];
for (const [k, c] of previas.entries()) {
  try {
    const r = await revisar(c.direccion);
    console.log(`${String(k + 1).padStart(3)} ${c.direccion.slice(0, 10)} ${r.descarte ? '✗ ' + r.descarte : `✓ ${r.anios.toFixed(1)} años, ${Math.round(r.trimestresEnVerde * 100)}% de trimestres en verde, caída máx ${Math.round(r.caidaMax * 100)}%`}`);
    if (!r.descarte) elegidos.push(r);
  } catch (e) {
    console.log(`${String(k + 1).padStart(3)} ${c.direccion.slice(0, 10)} error: ${e.message}`);
  }
  await esperar(1500);
}

const mejores = elegidos
  .sort((a, b) => b.trimestresEnVerde - a.trimestresEnVerde || a.caidaMax - b.caidaMax)
  .slice(0, CUANTOS)
  .map((r, i) => ({
    id: `trader-${i + 1}`,
    nombre: `Copia del trader ${i + 1} (${r.anios.toFixed(1).replace(".", ",")} años ganando)`,
    direccion: r.direccion,
    alElegir: {
      fecha: new Date(AHORA).toISOString().slice(0, 10), anios: +r.anios.toFixed(2), gananciaTotal: Math.round(r.ganancia),
      trimestresEnVerde: +r.trimestresEnVerde.toFixed(2), trimestres: r.trimestres, caidaMax: +r.caidaMax.toFixed(3),
      valorCuenta: Math.round(r.valorCuenta), apalancamiento: +r.apalancamiento.toFixed(2), monedas: r.monedas,
    },
  }));
fs.writeFileSync('src/vivo/traders.json', JSON.stringify(mejores, null, 1) + '\n');
console.log(`\n${elegidos.length} pasaron todo; elegidos ${mejores.length}:`);
for (const m of mejores) console.log(`  ${m.id} ${m.direccion} · ${m.alElegir.anios} años · ${Math.round(m.alElegir.trimestresEnVerde * 100)}% trimestres en verde · caída máx ${Math.round(m.alElegir.caidaMax * 100)}% · ${m.alElegir.monedas.join(', ')}`);

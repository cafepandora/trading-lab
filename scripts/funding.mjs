// Cobrar el funding: comprar la moneda en spot y venderla en corto en
// futuros perpetuos, en la misma cantidad. El precio deja de importar (lo
// que gana una pata lo pierde la otra) y se cobra el funding cuando es
// positivo (los que están comprados en futuros les pagan a los que están en
// corto). Cuando es negativo, se paga.
//
// REGLAS FIJADAS ANTES DE VER LOS RESULTADOS:
// - "Siempre puesta": se abre el primer día y no se cierra nunca.
// - "Solo cuando paga": cada día a las 00:00 UTC mira el promedio de los
//   últimos 7 días. Abre si paga 8% al año o más; cierra si se vuelve
//   negativo. Paga los costos de abrir y cerrar cada vez.
// - Costos por abrir o cerrar: Binance spot 0,1% + futuros 0,05% (en
//   Hyperliquid: spot comprado en Binance 0,1% + su futuro 0,045%).
// - Rendimiento sobre la plata total con el corto a 1x: la mitad de la plata
//   en spot y la otra mitad de garantía del corto, así no lo liquidan aunque
//   la moneda suba mucho. Por eso la cuenta rinde la mitad del funding.
// - No incluye la diferencia entre el precio spot y el del futuro (base) al
//   abrir y cerrar: suele ser menor a 0,1% y se compensa con el tiempo.
//
// Datos: Binance (data.binance.vision, cada 8 horas, desde 2020) e
// Hyperliquid (api.hyperliquid.xyz, desde mayo de 2023).
// Uso: npm run funding   → resultados/funding.json

import fs from 'node:fs';
import zlib from 'node:zlib';

const MONEDAS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'];
const DIA = 86400_000, ANIO = 365 * DIA;
const COSTO = { binance: 0.001 + 0.0005, hyperliquid: 0.001 + 0.00045 }; // por abrir, y otra vez por cerrar
const ENTRA = 0.08, SALE = 0;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1).replace('.', ',')}%`;
const p0 = (x) => `${Math.round(x * 100)}%`;

/** Lee el único archivo de un .zip (los de data.binance.vision), sin librerías. */
function deZip(buf) {
  const fin = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const central = buf.readUInt32LE(fin + 16);
  const metodo = buf.readUInt16LE(central + 10), tam = buf.readUInt32LE(central + 20), local = buf.readUInt32LE(central + 42);
  const inicio = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
  const datos = buf.subarray(inicio, inicio + tam);
  return (metodo === 8 ? zlib.inflateRawSync(datos) : datos).toString('utf8');
}

async function fundingBinance(m) {
  const archivo = `datos/funding/binance-${m}.json`;
  if (fs.existsSync(archivo)) return JSON.parse(fs.readFileSync(archivo, 'utf8'));
  const filas = [];
  const hoy = new Date();
  for (let a = 2019; a <= hoy.getUTCFullYear(); a++) {
    for (let mes = 1; mes <= 12; mes++) {
      if (a === hoy.getUTCFullYear() && mes >= hoy.getUTCMonth() + 1) break;
      const nombre = `${m}USDT-fundingRate-${a}-${String(mes).padStart(2, '0')}`;
      const r = await fetch(`https://data.binance.vision/data/futures/um/monthly/fundingRate/${m}USDT/${nombre}.zip`);
      if (r.status === 404) continue;
      if (!r.ok) throw new Error(`Binance ${nombre}: ${r.status}`);
      for (const linea of deZip(Buffer.from(await r.arrayBuffer())).trim().split('\n').slice(1)) {
        const [t, , tasa] = linea.split(',');
        if (Number(t) > 0) filas.push([Number(t), Number(tasa)]);
      }
    }
  }
  filas.sort((x, y) => x[0] - y[0]);
  fs.mkdirSync('datos/funding', { recursive: true });
  fs.writeFileSync(archivo, JSON.stringify(filas));
  return filas;
}

async function fundingHyperliquid(m) {
  const archivo = `datos/funding/hyperliquid-${m}.json`;
  if (fs.existsSync(archivo)) return JSON.parse(fs.readFileSync(archivo, 'utf8'));
  const filas = [];
  let desde = 0;
  for (;;) {
    let r;
    for (let intento = 0; ; intento++) {
      r = await fetch('https://api.hyperliquid.xyz/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'fundingHistory', coin: m, startTime: desde }) });
      if (r.status !== 429 || intento >= 6) break;
      await esperar(2000 * 2 ** intento); // pide más despacio si Hyperliquid lo frena
    }
    if (!r.ok) throw new Error(`Hyperliquid ${m}: ${r.status}`);
    const lote = await r.json();
    for (const f of lote) filas.push([f.time, Number(f.fundingRate)]);
    if (lote.length < 500) break;
    desde = lote[lote.length - 1].time + 1;
    await esperar(1200);
  }
  fs.mkdirSync('datos/funding', { recursive: true });
  fs.writeFileSync(archivo, JSON.stringify(filas));
  return filas;
}

/** Suma el funding por día UTC. */
const porDia = (filas) => {
  const d = new Map();
  for (const [t, r] of filas) { const k = Math.floor(t / DIA) * DIA; d.set(k, (d.get(k) ?? 0) + r); }
  return [...d.entries()].sort((a, b) => a[0] - b[0]);
};

function analizar(dias, costo) {
  const t0 = dias[0][0], t1 = dias[dias.length - 1][0] + DIA, anios = (t1 - t0) / ANIO;
  // Siempre puesta.
  let siempre = 1 - costo;
  const curvaSiempre = [];
  for (const [t, r] of dias) { siempre *= 1 + r; curvaSiempre.push([t, siempre]); }
  siempre *= 1 - costo;
  // Solo cuando paga.
  let valor = 1, dentro = false, cambios = 0, diasDentro = 0;
  const curvaSolo = [];
  for (let i = 0; i < dias.length; i++) {
    if (i >= 7) {
      const prom = dias.slice(i - 7, i).reduce((s, [, r]) => s + r, 0) / 7 * 365; // anual, con datos hasta ayer
      if (!dentro && prom >= ENTRA) { dentro = true; valor *= 1 - costo; cambios++; }
      else if (dentro && prom < SALE) { dentro = false; valor *= 1 - costo; cambios++; }
    }
    if (dentro) { valor *= 1 + dias[i][1]; diasDentro++; }
    curvaSolo.push([dias[i][0], valor]);
  }
  if (dentro) valor *= 1 - costo;
  const caida = (curva) => { let pico = 1, c = 0; for (const [, v] of curva) { pico = Math.max(pico, v); c = Math.max(c, 1 - v / pico); } return c; };
  let peor30 = Infinity;
  for (let i = 30; i <= dias.length; i++) peor30 = Math.min(peor30, dias.slice(i - 30, i).reduce((s, [, r]) => s + r, 0));
  const porAnio = {};
  for (const [t, r] of dias) { const a = new Date(t).getUTCFullYear(); (porAnio[a] ??= { suma: 0, dias: 0 }); porAnio[a].suma += r; porAnio[a].dias++; }
  const anual = (m) => m ** (1 / anios) - 1;
  return {
    desde: new Date(t0).toISOString().slice(0, 10), anios: +anios.toFixed(2),
    fundingAnual: dias.reduce((s, [, r]) => s + r, 0) / anios,
    diasPositivos: dias.filter(([, r]) => r > 0).length / dias.length,
    peor30Dias: peor30,
    porAnio: Object.fromEntries(Object.entries(porAnio).map(([a, x]) => [a, x.suma * 365 / x.dias])),
    siempre: { anualSobreNocional: anual(siempre), anualSobreCuenta: anual(1 + (siempre - 1) / 2), caida: caida(curvaSiempre) },
    soloCuandoPaga: { anualSobreNocional: anual(valor), anualSobreCuenta: anual(1 + (valor - 1) / 2), caida: caida(curvaSolo), cambios, tiempoDentro: diasDentro / dias.length },
  };
}

const salida = { generado: new Date().toISOString(), reglas: { entra: ENTRA, sale: SALE, costo: COSTO }, binance: {}, hyperliquid: {} };
for (const m of MONEDAS) {
  process.stdout.write(`${m}: bajando funding… `);
  salida.binance[m] = analizar(porDia(await fundingBinance(m)), COSTO.binance);
  salida.hyperliquid[m] = analizar(porDia(await fundingHyperliquid(m)), COSTO.hyperliquid);
  // Lo mismo en Binance, pero solo desde que hay datos de Hyperliquid, para comparar parejo.
  const desdeHl = Date.parse(salida.hyperliquid[m].desde);
  salida.binance[m].mismoPeriodoQueHl = analizar(porDia(await fundingBinance(m)).filter(([t]) => t >= desdeHl), COSTO.binance);
  console.log('listo');
}

for (const bolsa of ['binance', 'hyperliquid']) {
  console.log(`\n=== ${bolsa === 'binance' ? 'Binance' : 'Hyperliquid'} ===`);
  for (const [m, r] of Object.entries(salida[bolsa])) {
    console.log(`${m} desde ${r.desde}: funding ${pct(r.fundingAnual)}/año · días que paga ${p0(r.diasPositivos)} · peor mes ${pct(r.peor30Dias)}`);
    console.log(`   por año: ${Object.entries(r.porAnio).map(([a, x]) => `${a} ${pct(x)}`).join(' · ')}`);
    console.log(`   siempre puesta: cuenta ${pct(r.siempre.anualSobreCuenta)}/año (cae ${p0(r.siempre.caida)}) · solo cuando paga: cuenta ${pct(r.soloCuandoPaga.anualSobreCuenta)}/año (cae ${p0(r.soloCuandoPaga.caida)}, ${r.soloCuandoPaga.cambios} cambios, puesta ${p0(r.soloCuandoPaga.tiempoDentro)} del tiempo)`);
    if (r.mismoPeriodoQueHl) {
      const s = r.mismoPeriodoQueHl;
      console.log(`   mismo período que Hyperliquid: funding ${pct(s.fundingAnual)}/año · siempre puesta ${pct(s.siempre.anualSobreCuenta)}/año · solo cuando paga ${pct(s.soloCuandoPaga.anualSobreCuenta)}/año`);
    }
  }
}
fs.mkdirSync('resultados', { recursive: true });
fs.writeFileSync('resultados/funding.json', JSON.stringify(salida, null, 1) + '\n');
console.log('\nGuardado en resultados/funding.json');

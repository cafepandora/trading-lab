// Resume la prueba con datos pasados de 15 monedas para mostrarla en el panel
// al lado de lo que pasa en vivo. Uso: node scripts/referencia.mjs
import fs from 'node:fs';
const r = JSON.parse(fs.readFileSync('resultados/binance-15-monedas.json', 'utf8'));
const out = Object.fromEntries(r.estrategias.map((e) => [e.id, {
  operaciones: e.operaciones, rPromedio: +e.rPromedio.toFixed(4), aciertos: +e.aciertos.toFixed(4), suerte: +e.probabilidadAzar.toFixed(4),
}]));
fs.writeFileSync('src/vivo/referencia.json', JSON.stringify(out, null, 1) + '\n');
console.log(out);

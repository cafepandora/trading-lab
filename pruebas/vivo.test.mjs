// La simulación en vivo debe dar lo mismo que la prueba con datos pasados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AJUSTES, ESTRATEGIAS, armarContexto, atr, ema, probar, zigzag } from '../.compilado/lab.mjs';
import { nuevaCuenta, nocionalAbierto, procesarSerie, valorCuenta } from '../.compilado/cartera.mjs';

const contexto = (vs) => { const r = atr(vs); return armarContexto(vs, r, ema(vs.map((v) => v.c), 200), zigzag(vs, r, 2.5)); };

for (const [archivo, horas] of [['datos/binance/SOL-4h.json', 4], ['datos/binance/ETH-1d.json', 24]]) {
  test(`en vivo, de a pocas velas, da las mismas operaciones que la prueba (${archivo})`, { skip: !fs.existsSync(archivo) }, () => {
    const vs = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    const ctx = contexto(vs);
    for (const id of ['soldados', 'triple', 'tendencia', 'confluencia', 'fib-50-618', 'envolvente']) {
      const est = ESTRATEGIAS.find((e) => e.id === id);
      const pasado = probar(ctx, est, { ...AJUSTES, horasPorVela: horas }).operaciones.filter((o) => o.salidaPor !== 'fin');
      const c = nuevaCuenta(id, est.nombre, 'estrategia');
      const serie = { serie: `X ${horas}h`, moneda: 'X', horas };
      const ops = [];
      // Avanza de a 7 velas, como si fueran llegando.
      for (let k = 199; k < vs.length - 1; k += 7) {
        const hasta = vs[Math.min(k + 7, vs.length - 2)].t;
        ops.push(...procesarSerie(c, est, ctx, serie, vs[k].t, hasta, {}).operaciones);
      }
      assert.equal(ops.length, pasado.length, `${est.nombre}: ${ops.length} en vivo vs ${pasado.length} en la prueba`);
      ops.forEach((o, n) => {
        assert.equal(o.tEntrada, pasado[n].tEntrada, `${est.nombre}: operación ${n} entra en otro momento`);
        assert.ok(Math.abs(o.r - pasado[n].r) < 1e-9, `${est.nombre}: operación ${n} R ${o.r} vs ${pasado[n].r}`);
      });
    }
  });
}

test('entre todas las monedas, lo abierto no pasa de 2x lo que vale la cuenta', () => {
  const c = nuevaCuenta('soldados', 'x', 'estrategia');
  const precios = { A: 100, B: 100, C: 100 };
  const senal = { lado: 1, stop: 99.9, rr: 2, motivo: 'prueba' }; // stop muy cerca: con 1% de riesgo serían 10x
  const est = { id: 'p', nombre: 'p', senal: (_c, i) => (i === 0 ? senal : null) };
  const velas = [0, 1, 2].map((t) => ({ t, o: 100, h: 100.01, l: 99.99, c: 100 }));
  const ctx = { velas, atr: [1, 1, 1], ema200: [100, 100, 100], pivotes: [], confirmadosHasta: [0, 0, 0] };
  for (const m of ['A', 'B', 'C']) procesarSerie(c, est, ctx, { serie: m, moneda: m, horas: 4 }, -1, 0, precios);
  const valor = valorCuenta(c, precios);
  // El tope se calcula antes de la comisión y el deslizamiento de entrada: puede pasarse por centavos.
  assert.ok(nocionalAbierto(c, precios) <= 2 * valor * 1.005, `${nocionalAbierto(c, precios)} > 2 × ${valor}`);
  assert.equal(Object.keys(c.posiciones).length, 1); // la primera ocupa todo el espacio
  assert.equal(c.omitidas, 2);
});

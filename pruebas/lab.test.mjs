// Pruebas del laboratorio. Correr: npm run pruebas (después de npm run laboratorio,
// que deja los precios en datos/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AJUSTES, TODAS, armarContexto, atr, ema, estrategiaAzar, probar, zigzag } from '../.compilado/lab.mjs';

const contexto = (vs) => { const r = atr(vs); return armarContexto(vs, r, ema(vs.map((v) => v.c), 200), zigzag(vs, r, 2.5)); };

// Si una estrategia usara datos del futuro, sus señales cambiarían al cortar la serie.
for (const archivo of ['datos/binance/BTC-4h.json', 'datos/binance/SOL-1d.json']) {
  test(`ninguna estrategia mira el futuro (${archivo})`, { skip: !fs.existsSync(archivo) }, () => {
    const vs = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    const completo = contexto(vs);
    for (const corte of [Math.floor(vs.length * 0.55), Math.floor(vs.length * 0.8)]) {
      const cortado = contexto(vs.slice(0, corte));
      for (const est of [...TODAS, estrategiaAzar(42)]) {
        const senales = (ctx) => {
          const mem = new Set(), out = [];
          const e = est.id === 'azar' ? estrategiaAzar(42) : est;
          for (let i = 200; i < corte; i++) { const s = e.senal(ctx, i, mem); if (s) out.push(`${i}:${s.lado}:${s.stop.toFixed(6)}:${(s.objetivo ?? s.rr).toFixed?.(6)}`); }
          return out;
        };
        assert.deepEqual(senales(cortado), senales(completo), `${est.nombre} cambia con datos futuros (corte ${corte})`);
      }
    }
  });
}

// Velas armadas a mano para revisar las cuentas del probador.
const vela = (t, o, h, l, c) => ({ t: t * 4 * 3600_000, o, h, l, c });
const unaSenal = (iSenal, lado, stop, objetivo, maxVelas = 60) => ({
  id: 'prueba', nombre: 'prueba', grupo: 'Comparación', explicacion: '',
  senal: (_c, i) => (i === iSenal ? { lado, stop, objetivo, maxVelas, motivo: 'prueba' } : null),
});
const plano = (n) => Array.from({ length: n }, (_, t) => vela(t, 100, 101, 99, 100));
const sinCostos = { ...AJUSTES, comision: 0, desliz: 0, deslizStop: 0, fundingHora: 0, horasPorVela: 4, inicio: 1 };

test('una compra que llega al objetivo gana exactamente lo planeado', () => {
  const vs = plano(10); vs[3] = vela(3, 100, 110.5, 99.5, 110);
  const r = probar(contexto(vs), unaSenal(1, 1, 95, 110), sinCostos);
  assert.equal(r.operaciones.length, 1);
  const op = r.operaciones[0];
  assert.equal(op.salidaPor, 'objetivo');
  assert.ok(Math.abs(op.r - 2) < 1e-9, `R = ${op.r}`); // arriesgó 5 para ganar 10
  assert.ok(Math.abs(r.final - (500 + 500 * 0.01 * 2)) < 1e-6, String(r.final));
});

test('si toca stop y objetivo en la misma vela, cuenta el stop', () => {
  const vs = plano(10); vs[2] = vela(2, 100, 111, 94, 100);
  const r = probar(contexto(vs), unaSenal(1, 1, 95, 110), sinCostos);
  assert.equal(r.operaciones[0].salidaPor, 'stop');
  assert.ok(Math.abs(r.operaciones[0].r + 1) < 1e-9);
});

test('si el precio abre más allá del stop, sale a la apertura (pierde más de 1R)', () => {
  const vs = plano(10); vs[3] = vela(3, 90, 91, 89, 90);
  const r = probar(contexto(vs), unaSenal(1, 1, 95, 110), sinCostos);
  assert.ok(Math.abs(r.operaciones[0].r + 2) < 1e-9, String(r.operaciones[0].r)); // entró a 100, stop 95, salió a 90
});

test('una venta en corto gana cuando baja', () => {
  const vs = plano(10); vs[4] = vela(4, 100, 100.5, 89, 90);
  const r = probar(contexto(vs), unaSenal(1, -1, 105, 90), sinCostos);
  assert.equal(r.operaciones[0].salidaPor, 'objetivo');
  assert.ok(Math.abs(r.operaciones[0].r - 2) < 1e-9);
});

test('las comisiones y el funding se descuentan', () => {
  const vs = plano(10); vs[3] = vela(3, 100, 110.5, 99.5, 110);
  const r = probar(contexto(vs), unaSenal(1, 1, 95, 110), { ...sinCostos, comision: 0.00045, fundingHora: 0.0000125 });
  assert.ok(r.operaciones[0].r < 2 && r.operaciones[0].r > 1.9, String(r.operaciones[0].r));
});

test('nunca pasa del tope de apalancamiento', () => {
  const vs = plano(10); vs[2] = vela(2, 100, 100.2, 99.95, 100.1); vs[3] = vela(3, 100.1, 100.6, 99.95, 100.5);
  // stop a 0,1% → con 1% de riesgo serían 10x; el tope es 2x.
  const r = probar(contexto(vs), unaSenal(1, 1, 99.9, 100.5), sinCostos);
  const op = r.operaciones[0];
  assert.ok(Math.abs(op.pnl - 2 * 500 * 0.005) < 1e-6, String(op.pnl)); // 1.000 de posición × 0,5%
});

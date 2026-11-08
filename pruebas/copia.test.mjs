// Pruebas del motor con casos que se pueden revisar a mano.
// Correr: npm run pruebas
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarFunding, cicloCopia, cicloReferencia, nuevaCuenta, valorCuenta } from '../.compilado/copia.mjs';

// Parámetros sin deslizamiento para que las cuentas sean exactas.
const P = {
  capitalInicial: 500, apalancamientoMax: 2, perdidaMaxDia: 0.05, caidaMaxTotal: 0.3,
  ordenMinima: 10, comisionTaker: 0.00045, deslizMayor: 0, deslizMenor: 0,
  volumenMayor: 1e8, umbralCambio: 0.02, diasPrueba: 90,
};
const T0 = Date.UTC(2026, 10, 6, 17, 0); // 6 nov 2026, 12:00 en Colombia
const MIN = 60_000;
const mercado = (t, precios) => ({
  t, precios,
  contextos: Object.fromEntries(Object.keys(precios).map((m) => [m, { funding: 0.0001, volumenDia: 1e9, oraculo: precios[m], maxApal: 40 }])),
});
const trader = (t, valorCuenta, posiciones) => ({ t, valorCuenta, posiciones });
const cerca = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

test('abre en proporción a su cuenta y cobra comisión', () => {
  const c = nuevaCuenta('T01', '0xabc', P, T0);
  // El trader: 100.000 USD de cuenta, 1 BTC a 50.000 (0,5x). La copia: 500 → 0,005 BTC.
  const r = cicloCopia(c, trader(T0, 100_000, { BTC: 1 }), mercado(T0, { BTC: 50_000 }), P);
  assert.equal(r.operaciones.length, 1);
  cerca(c.posiciones.BTC.tam, 0.005);
  cerca(c.comisiones, 250 * 0.00045);
  cerca(c.valor, 500 - 250 * 0.00045);
  assert.equal(r.operaciones[0].motivo, 'el trader abrió long');
});

test('si el precio sube 10% la copia gana lo mismo en proporción, y al cerrar lo realiza', () => {
  const c = nuevaCuenta('T01', '0xabc', P, T0);
  cicloCopia(c, trader(T0, 100_000, { BTC: 1 }), mercado(T0, { BTC: 50_000 }), P);
  const m2 = mercado(T0 + MIN, { BTC: 55_000 });
  cicloCopia(c, trader(T0 + MIN, 105_000, { BTC: 1 }), m2, P); // el trader no cambió nada
  assert.equal(c.operaciones, 1);
  cerca(valorCuenta(c, m2), 500 - 250 * 0.00045 + 25);
  const r = cicloCopia(c, trader(T0 + 2 * MIN, 105_000, {}), mercado(T0 + 2 * MIN, { BTC: 55_000 }), P);
  assert.equal(r.operaciones[0].motivo, 'el trader cerró');
  assert.deepEqual(c.posiciones, {});
  cerca(r.operaciones[0].pnl, 25);
  cerca(c.efectivo, 500 + 25 - 250 * 0.00045 - 275 * 0.00045);
});

test('nunca pasa del tope de apalancamiento aunque el trader use 10x', () => {
  const c = nuevaCuenta('T01', '0xabc', P, T0);
  // 10.000 de cuenta y 2 BTC a 50.000 = 100.000 → 10x. La copia: 2x de 500 = 1.000.
  cicloCopia(c, trader(T0, 10_000, { BTC: 2 }), mercado(T0, { BTC: 50_000 }), P);
  cerca(c.posiciones.BTC.tam * 50_000, 1000, 1e-6);
  cerca(c.apalancamientoTrader, 10);
});

test('salta las órdenes de menos de 10 USD', () => {
  const c = nuevaCuenta('T01', '0xabc', P, T0);
  // 1.000.000 de cuenta y 0,1 ETH a 4.000 (400 USD) → la copia sería 0,20 USD.
  const r = cicloCopia(c, trader(T0, 1_000_000, { ETH: 0.1 }), mercado(T0, { ETH: 4000 }), P);
  assert.equal(r.operaciones.length, 0);
  assert.equal(c.omitidas, 1);
});

test('cambios menores al 2% en el trader no generan operaciones', () => {
  const c = nuevaCuenta('T01', '0xabc', P, T0);
  cicloCopia(c, trader(T0, 100_000, { BTC: 1 }), mercado(T0, { BTC: 50_000 }), P);
  cicloCopia(c, trader(T0 + MIN, 100_000, { BTC: 1.01 }), mercado(T0 + MIN, { BTC: 50_000 }), P);
  assert.equal(c.operaciones, 1);
  cicloCopia(c, trader(T0 + 2 * MIN, 100_000, { BTC: 1.5 }), mercado(T0 + 2 * MIN, { BTC: 50_000 }), P);
  assert.equal(c.operaciones, 2);
  cerca(c.posiciones.BTC.tam, 0.0075, 1e-4);
});

test('voltear de long a short cierra y abre al otro lado', () => {
  const c = nuevaCuenta('T01', '0xabc', P, T0);
  cicloCopia(c, trader(T0, 100_000, { BTC: 1 }), mercado(T0, { BTC: 50_000 }), P);
  const r = cicloCopia(c, trader(T0 + MIN, 100_000, { BTC: -1 }), mercado(T0 + MIN, { BTC: 49_000 }), P);
  assert.equal(r.operaciones[0].motivo, 'el trader volteó la posición');
  assert.ok(c.posiciones.BTC.tam < 0);
  cerca(r.operaciones[0].pnl, 0.005 * (49_000 - 50_000));
});

test('freno diario: pierde más del 5% en el día → cierra y pausa hasta mañana', () => {
  const c = nuevaCuenta('T01', '0xabc', P, T0);
  cicloCopia(c, trader(T0, 10_000, { BTC: 2 }), mercado(T0, { BTC: 50_000 }), P); // copia a 2x
  // BTC cae 3% → la copia pierde ~6% (2x).
  const r = cicloCopia(c, trader(T0 + MIN, 10_000, { BTC: 2 }), mercado(T0 + MIN, { BTC: 48_500 }), P);
  assert.equal(c.estado, 'pausada');
  assert.deepEqual(c.posiciones, {});
  assert.equal(r.eventos.length, 1);
  // Mismo día: sigue pausada aunque el trader opere.
  cicloCopia(c, trader(T0 + 2 * MIN, 10_000, { BTC: 3 }), mercado(T0 + 2 * MIN, { BTC: 48_500 }), P);
  assert.deepEqual(c.posiciones, {});
  // Día siguiente (hora Colombia): vuelve a copiar lo que tenga abierto.
  const manana = T0 + 24 * 60 * MIN;
  cicloCopia(c, trader(manana, 10_000, { BTC: 2 }), mercado(manana, { BTC: 48_500 }), P);
  assert.equal(c.estado, 'activa');
  assert.ok(c.posiciones.BTC.tam > 0);
});

test('freno total: si cae 30% desde el capital inicial se detiene para siempre', () => {
  const c = nuevaCuenta('T01', '0xabc', { ...P, perdidaMaxDia: 1 }, T0);
  const p = { ...P, perdidaMaxDia: 1 };
  cicloCopia(c, trader(T0, 10_000, { BTC: 2 }), mercado(T0, { BTC: 50_000 }), p);
  cicloCopia(c, trader(T0 + MIN, 10_000, { BTC: 2 }), mercado(T0 + MIN, { BTC: 42_000 }), p); // −16% × 2 = −32%
  assert.equal(c.estado, 'detenida');
  assert.deepEqual(c.posiciones, {});
  const valor = c.valor;
  cicloCopia(c, trader(T0 + 2 * MIN, 10_000, { BTC: 2 }), mercado(T0 + 2 * MIN, { BTC: 60_000 }), p);
  assert.equal(c.valor, valor); // ya no copia nada
});

test('funding: el long paga si la tasa es positiva', () => {
  const c = nuevaCuenta('T01', '0xabc', P, T0);
  const m = mercado(T0, { BTC: 50_000 });
  cicloCopia(c, trader(T0, 100_000, { BTC: 1 }), m, P);
  const antes = c.efectivo;
  const pago = aplicarFunding(c, m);
  cerca(pago, 0.005 * 50_000 * 0.0001);
  cerca(c.efectivo, antes - pago);
});

test('la referencia compra Bitcoin una sola vez y lo guarda', () => {
  const c = nuevaCuenta('BTC', null, P, T0);
  cicloReferencia(c, mercado(T0, { BTC: 50_000 }), P);
  cicloReferencia(c, mercado(T0 + MIN, { BTC: 60_000 }), P);
  assert.equal(c.operaciones, 1);
  assert.ok(c.valor > 595 && c.valor < 600, String(c.valor));
});

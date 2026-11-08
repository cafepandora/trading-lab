// Pruebas del bot de grilla con precios armados a mano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simularGrilla } from '../.compilado/lab.mjs';

const H = 3600_000;
const sinCostos = { capital: 1000, rango: 0.1, niveles: 10, dias: 30, comision: 0, comisionMercado: 0 };

test('si el precio sube y baja dentro del rango, gana un escalón por cada vuelta', () => {
  // Arranca en 100; el escalón de abajo está cerca de 97,9. Baja a 97 y vuelve a 100, 5 veces.
  const velas = [];
  for (let k = 0; k < 5; k++) {
    velas.push({ t: (2 * k) * H, o: 100, h: 100, l: 97, c: 97 });
    velas.push({ t: (2 * k + 1) * H, o: 97, h: 100, l: 97, c: 100 });
  }
  const r = simularGrilla(velas, sinCostos);
  assert.equal(r.vueltas, 5);
  // Cada vuelta gana el paso entre escalones sobre lo que tiene la celda
  // (empieza con 100 USD y reinvierte lo ganado).
  const paso = (1.1 / 0.9) ** (1 / 10);
  assert.ok(Math.abs(r.gananciaVueltas - 100 * (paso ** 5 - 1)) < 1e-6, String(r.gananciaVueltas));
  assert.ok(r.final > 1000);
});

test('si el precio se cae y no vuelve, queda con las monedas compradas más caras', () => {
  const velas = [{ t: 0, o: 100, h: 100, l: 100, c: 100 }];
  for (let k = 1; k <= 20; k++) velas.push({ t: k * H, o: 100 - (k - 1) * 1.5, h: 100 - (k - 1) * 1.5, l: 100 - k * 1.5, c: 100 - k * 1.5 });
  const r = simularGrilla(velas, sinCostos);
  assert.equal(r.vueltas, 0);
  assert.ok(r.resultadoInventario < 0);
  assert.ok(r.final < 1000 * 0.9, String(r.final));
  assert.ok(r.fueraDelRango > 0);
});

test('las comisiones se descuentan en cada compra y venta', () => {
  const velas = [];
  for (let k = 0; k < 5; k++) {
    velas.push({ t: (2 * k) * H, o: 100, h: 100, l: 97, c: 97 });
    velas.push({ t: (2 * k + 1) * H, o: 97, h: 100, l: 97, c: 100 });
  }
  const con = simularGrilla(velas, { ...sinCostos, comision: 0.001, comisionMercado: 0.001 });
  const sin = simularGrilla(velas, sinCostos);
  assert.ok(con.final < sin.final);
});

// Pruebas del bot con dinero real contra un Binance falso (pruebas/binance-falso.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearBinanceFalso } from './binance-falso.mjs';
import { CuentaBinance, activar, cicloBot, estadoInicial, venderTodo, MONEDAS_BOT, ultimaCerradaBot } from '../.compilado/real.mjs';

const H4 = 4 * 3600_000;
const T0 = Date.UTC(2026, 10, 9, 8, 5); // 5 minutos después de un cierre de vela de 4 horas
const REGLAS = Object.fromEntries(MONEDAS_BOT.map((m) => [`${m}USDT`, { paso: m === 'BTC' ? 0.00001 : 0.01, tick: 0.01, minimo: 5 }]));

/** Una estrategia de mentira que obedece a las pruebas. */
function estrategiaPrueba() {
  const control = { comprar: false, stop: 47500, salir: false };
  return {
    control,
    estrategia: {
      id: 'prueba', nombre: 'prueba', grupo: 'Comparación', explicacion: '',
      // Solo da señal en BTC (las velas de BTC están a 50.000; las demás a 1).
      senal: (ctx, i) => (control.comprar && ctx.velas[i].c > 1000 ? { lado: 1, stop: control.stop, objetivo: Infinity, motivo: 'señal de prueba' } : null),
      nuevoStop: (_ctx, _i, _lado, stop) => (control.salir ? Infinity : stop),
    },
  };
}

async function escenario({ usdt = 100, btcPropio = 0 } = {}) {
  const falso = await crearBinanceFalso({ saldos: { USDT: usdt, BTC: btcPropio }, precios: Object.fromEntries(MONEDAS_BOT.map((m) => [`${m}USDT`, m === 'BTC' ? 50000 : 1])) });
  const cuenta = new CuentaBinance({ apiKey: 'llave', secreto: 'secreto' }, falso.url);
  const { control, estrategia } = estrategiaPrueba();
  const reloj = { ahora: T0 };
  const deps = () => ({
    cuenta, estrategia, ahora: reloj.ahora,
    reglas: async () => REGLAS,
    precios: async (ms) => Object.fromEntries(ms.map((m) => [m, falso.estado.precios[`${m}USDT`]])),
    velas: async (m) => {
      const hasta = ultimaCerradaBot(reloj.ahora);
      const p = m === 'BTC' ? falso.estado.precios.BTCUSDT : 1;
      return Array.from({ length: 300 }, (_, k) => ({ t: hasta - (299 - k) * H4, o: p, h: p, l: p, c: p }));
    },
  });
  /** Avanza a la siguiente vela de 4 horas y corre ciclos hasta revisar todas las monedas. */
  async function siguienteVela() {
    reloj.ahora += H4;
    const salida = { eventos: [], operaciones: [] };
    for (let k = 0; k < 8; k++) {
      const r = await cicloBot(e, deps());
      salida.eventos.push(...r.eventos);
      salida.operaciones.push(...r.operaciones);
    }
    return salida;
  }
  const e = estadoInicial();
  return { falso, e, control, deps, siguienteVela, reloj };
}

const pedidos = (falso, filtro) => falso.estado.pedidos.filter((p) => p.ruta === '/api/v3/order' && p.metodo === 'POST' && Object.entries(filtro).every(([k, v]) => p[k] === v));

test('arranca apagado: sin activar no consulta ni opera nada', async () => {
  const s = await escenario();
  s.control.comprar = true;
  await s.siguienteVela();
  assert.equal(s.e.activo, false);
  assert.equal(s.falso.estado.pedidos.length, 0);
  await s.falso.cerrar();
});

test('sin llaves no se puede activar', async () => {
  const e = estadoInicial();
  await assert.rejects(activar(e, { cuenta: null, ahora: T0 }), /llaves/);
});

test('para activarlo hacen falta 50 USDT libres en Spot', async () => {
  const s = await escenario({ usdt: 30 });
  await assert.rejects(activar(s.e, s.deps()), /hacen falta 50/);
  assert.equal(s.e.activo, false);
  await s.falso.cerrar();
});

test('con una señal compra y deja puesto el stop en Binance, redondeado a sus reglas', async () => {
  const s = await escenario();
  await activar(s.e, s.deps());
  s.control.comprar = true;
  await s.siguienteVela();
  const compras = pedidos(s.falso, { side: 'BUY', type: 'MARKET' });
  assert.equal(compras.length, 1);
  // Arriesga 1% de 50 (0,50) con el stop 5% abajo → 10 USDT.
  assert.equal(compras[0].quoteOrderQty, '10.00');
  const stops = pedidos(s.falso, { type: 'STOP_LOSS_LIMIT' });
  assert.equal(stops.length, 1);
  assert.equal(stops[0].stopPrice, '47500.00');
  assert.equal(stops[0].price, '47025.00');
  assert.match(stops[0].quantity, /^0\.\d{5}$/); // paso de 0,00001 BTC
  assert.ok(Math.abs(s.e.caja - 40) < 1e-9);
  assert.ok(s.e.posiciones.BTC.ordenStop);
  await s.falso.cerrar();
});

test('si Binance ejecuta el stop, el bot lo registra y la plata vuelve a su caja', async () => {
  const s = await escenario();
  await activar(s.e, s.deps());
  s.control.comprar = true;
  await s.siguienteVela();
  s.control.comprar = false;
  s.falso.fijarPrecio('BTCUSDT', 47000); // pasa el stop: se vende a 47.025
  const r = await s.siguienteVela();
  assert.equal(s.e.posiciones.BTC, undefined);
  assert.equal(r.operaciones.length, 1);
  assert.equal(r.operaciones[0].por, 'stop');
  assert.ok(r.operaciones[0].resultado < 0);
  // Vendió 0,00019 BTC a 47.025 (menos comisión); el sobrante del redondeo queda como polvo.
  assert.ok(Math.abs(s.e.caja - (40 + 0.00019 * 47025 * 0.999)) < 1e-6, String(s.e.caja));
  assert.ok(s.e.polvo.BTC > 0 && s.e.polvo.BTC < 0.00001);
  await s.falso.cerrar();
});

test('con señal de salida cancela el stop y vende a mercado', async () => {
  const s = await escenario();
  await activar(s.e, s.deps());
  s.control.comprar = true;
  await s.siguienteVela();
  s.control.comprar = false;
  s.falso.fijarPrecio('BTCUSDT', 55000);
  s.control.salir = true;
  const r = await s.siguienteVela();
  assert.equal(s.falso.estado.ordenes.find((o) => o.type === 'STOP_LOSS_LIMIT').status, 'CANCELED');
  assert.equal(pedidos(s.falso, { side: 'SELL', type: 'MARKET' }).length, 1);
  assert.equal(r.operaciones[0].por, 'senal');
  assert.ok(r.operaciones[0].resultado > 0);
  assert.equal(s.falso.estado.saldos.BTC.bloqueado, 0);
  await s.falso.cerrar();
});

test('nunca vende más de lo que compró él mismo (no toca tus otras monedas)', async () => {
  const s = await escenario({ btcPropio: 0.1 });
  await activar(s.e, s.deps());
  s.control.comprar = true;
  await s.siguienteVela();
  const delBot = s.e.posiciones.BTC.cantidad;
  s.control.comprar = false;
  s.control.salir = true;
  await s.siguienteVela();
  const venta = pedidos(s.falso, { side: 'SELL', type: 'MARKET' })[0];
  assert.ok(Number(venta.quantity) <= delBot + 1e-12, `${venta.quantity} > ${delBot}`);
  assert.ok(s.falso.estado.saldos.BTC.libre >= 0.1 - 1e-9); // lo tuyo sigue ahí
  await s.falso.cerrar();
});

test('si lo que vale baja del piso de 40 USD, vende todo y se apaga', async () => {
  const s = await escenario();
  await activar(s.e, s.deps());
  s.control.comprar = true;
  await s.siguienteVela();
  s.control.comprar = false;
  s.e.caja = 25; // como si ya hubiera perdido en otras operaciones
  const r = await s.siguienteVela();
  assert.equal(s.e.activo, false);
  assert.match(s.e.motivo, /bajó de 40 USD/);
  assert.equal(s.e.posiciones.BTC, undefined);
  assert.equal(r.operaciones[0].por, 'piso');
  // Apagado no vuelve a operar aunque haya señal.
  s.control.comprar = true;
  const antes = s.falso.estado.pedidos.length;
  await s.siguienteVela();
  assert.equal(s.falso.estado.pedidos.length, antes);
  await s.falso.cerrar();
});

test('si se cayó justo después de comprar, no vuelve a comprar: recupera la orden', async () => {
  const s = await escenario();
  await activar(s.e, s.deps());
  s.control.comprar = true;
  await s.siguienteVela();
  // Simula que se perdió el estado guardado después de la compra.
  delete s.e.posiciones.BTC;
  s.e.caja = 50;
  s.e.ultimaVela.BTC -= 4 * 3600_000;
  s.reloj.ahora -= 4 * 3600_000;
  await s.siguienteVela();
  assert.equal(pedidos(s.falso, { side: 'BUY', type: 'MARKET' }).length, 1);
  assert.ok(s.e.posiciones.BTC);
  await s.falso.cerrar();
});

test('"detener" desde el panel vende todo y lo apaga', async () => {
  const s = await escenario();
  await activar(s.e, s.deps());
  s.control.comprar = true;
  await s.siguienteVela();
  const r = await venderTodo(s.e, s.deps(), 'manual', 'lo detuviste desde el panel');
  assert.equal(s.e.activo, false);
  assert.equal(Object.keys(s.e.posiciones).length, 0);
  assert.equal(r.operaciones[0].por, 'manual');
  await s.falso.cerrar();
});

test('una llave con el secreto equivocado es rechazada por Binance', async () => {
  const falso = await crearBinanceFalso({ saldos: { USDT: 100 } });
  const mala = new CuentaBinance({ apiKey: 'llave', secreto: 'otro' }, falso.url);
  await assert.rejects(mala.saldos(), /Signature/);
  await falso.cerrar();
});

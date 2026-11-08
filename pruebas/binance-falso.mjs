// Un Binance falso (spot) para probar el bot sin plata real: responde como
// la API real, verifica las firmas, ejecuta compras y ventas a mercado y
// dispara las órdenes de stop cuando el precio baja hasta ellas.
import http from 'node:http';
import crypto from 'node:crypto';

export async function crearBinanceFalso({ apiKey = 'llave', secreto = 'secreto', saldos = {}, precios = {}, comision = 0.001 } = {}) {
  const estado = {
    saldos: Object.fromEntries(Object.entries(saldos).map(([a, v]) => [a, { libre: v, bloqueado: 0 }])),
    precios: { ...precios },
    ordenes: [],
    pedidos: [],
  };
  let siguienteId = 1;
  const saldo = (a) => (estado.saldos[a] ??= { libre: 0, bloqueado: 0 });
  const error = (res, status, code, msg) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ code, msg })); };
  const ok = (res, cuerpo) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(cuerpo)); };
  const vista = (o) => ({ ...o, executedQty: String(o.executedQty), cummulativeQuoteQty: String(o.cummulativeQuoteQty) });

  function dispararStops(symbol) {
    const p = estado.precios[symbol];
    for (const o of estado.ordenes) {
      if (o.symbol !== symbol || o.type !== 'STOP_LOSS_LIMIT' || o.status !== 'NEW' || p > o.stopPrice) continue;
      const base = symbol.replace(/USDT$/, '');
      const bruto = o.origQty * o.price;
      saldo(base).bloqueado -= o.origQty;
      saldo('USDT').libre += bruto * (1 - comision);
      Object.assign(o, { status: 'FILLED', executedQty: o.origQty, cummulativeQuoteQty: bruto });
    }
  }

  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/v3/time') return ok(res, { serverTime: Date.now() });
    // Firma: HMAC-SHA256 del texto de la consulta sin "signature".
    const texto = url.search.slice(1).replace(/&signature=[0-9a-f]+$/, '');
    const firma = url.searchParams.get('signature');
    if (req.headers['x-mbx-apikey'] !== apiKey) return error(res, 401, -2015, 'Invalid API-key, IP, or permissions for action.');
    if (firma !== crypto.createHmac('sha256', secreto).update(texto).digest('hex')) return error(res, 400, -1022, 'Signature for this request is not valid.');
    const q = Object.fromEntries(url.searchParams);
    estado.pedidos.push({ metodo: req.method, ruta: url.pathname, ...q });

    if (url.pathname === '/api/v3/account') {
      return ok(res, { canTrade: true, balances: Object.entries(estado.saldos).map(([asset, s]) => ({ asset, free: String(s.libre), locked: String(s.bloqueado) })) });
    }
    if (url.pathname === '/api/v3/order' && req.method === 'GET') {
      const o = estado.ordenes.find((x) => x.symbol === q.symbol && (q.orderId ? x.orderId === Number(q.orderId) : x.clientOrderId === q.origClientOrderId));
      return o ? ok(res, vista(o)) : error(res, 400, -2013, 'Order does not exist.');
    }
    if (url.pathname === '/api/v3/order' && req.method === 'DELETE') {
      const o = estado.ordenes.find((x) => x.symbol === q.symbol && x.orderId === Number(q.orderId));
      if (!o || o.status !== 'NEW') return error(res, 400, -2011, 'Unknown order sent.');
      o.status = 'CANCELED';
      const base = o.symbol.replace(/USDT$/, '');
      saldo(base).bloqueado -= o.origQty;
      saldo(base).libre += o.origQty;
      return ok(res, vista(o));
    }
    if (url.pathname === '/api/v3/order' && req.method === 'POST') {
      const base = q.symbol.replace(/USDT$/, '');
      const precio = estado.precios[q.symbol];
      const o = { symbol: q.symbol, orderId: siguienteId++, clientOrderId: q.newClientOrderId, side: q.side, type: q.type, status: 'NEW', executedQty: 0, cummulativeQuoteQty: 0 };
      if (q.type === 'MARKET' && q.side === 'BUY') {
        const usdt = Number(q.quoteOrderQty);
        if (saldo('USDT').libre < usdt) return error(res, 400, -2010, 'Account has insufficient balance for requested action.');
        const cantidad = usdt / precio;
        saldo('USDT').libre -= usdt;
        saldo(base).libre += cantidad * (1 - comision);
        Object.assign(o, { status: 'FILLED', executedQty: cantidad, cummulativeQuoteQty: usdt, fills: [{ price: String(precio), qty: String(cantidad), commission: String(cantidad * comision), commissionAsset: base }] });
      } else if (q.type === 'MARKET' && q.side === 'SELL') {
        const cantidad = Number(q.quantity);
        if (saldo(base).libre < cantidad - 1e-12) return error(res, 400, -2010, 'Account has insufficient balance for requested action.');
        saldo(base).libre -= cantidad;
        saldo('USDT').libre += cantidad * precio * (1 - comision);
        Object.assign(o, { status: 'FILLED', executedQty: cantidad, cummulativeQuoteQty: cantidad * precio, fills: [{ price: String(precio), qty: String(cantidad), commission: String(cantidad * precio * comision), commissionAsset: 'USDT' }] });
      } else if (q.type === 'STOP_LOSS_LIMIT' && q.side === 'SELL') {
        const cantidad = Number(q.quantity);
        if (saldo(base).libre < cantidad - 1e-12) return error(res, 400, -2010, 'Account has insufficient balance for requested action.');
        if (cantidad * Number(q.price) < 5) return error(res, 400, -1013, 'Filter failure: NOTIONAL');
        saldo(base).libre -= cantidad;
        saldo(base).bloqueado += cantidad;
        Object.assign(o, { origQty: cantidad, stopPrice: Number(q.stopPrice), price: Number(q.price) });
      } else {
        return error(res, 400, -1100, 'Tipo de orden no soportado por el Binance falso.');
      }
      estado.ordenes.push(o);
      return ok(res, vista(o));
    }
    return error(res, 404, -1, 'no existe');
  });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  servidor.unref(); // que una prueba fallida no deje el proceso colgado
  return {
    url: `http://127.0.0.1:${servidor.address().port}`,
    estado,
    fijarPrecio(symbol, p) { estado.precios[symbol] = p; dispararStops(symbol); },
    cerrar: () => new Promise((r) => { servidor.closeAllConnections(); servidor.close(r); }),
  };
}

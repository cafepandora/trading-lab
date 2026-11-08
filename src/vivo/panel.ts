// Páginas HTML. El panel se pinta en el navegador con /api/estado; la
// gráfica es SVG propio (sin librerías externas).

const ESTILO = `
:root{--fondo:#f6f4ef;--tarjeta:#fff;--texto:#1d1b18;--suave:#5f5a52;--linea:#e2ddd3;
--verde:#1f7a4a;--verde-bg:#e3f2e8;--rojo:#b3361f;--rojo-bg:#f9e4df;--azul:#24527a;--azul-bg:#e2ecf5;
--ambar:#8a5a00;--ambar-bg:#fbf0d9;--btc:#c06a00}
@media (prefers-color-scheme:dark){:root{--fondo:#151412;--tarjeta:#1f1d1a;--texto:#f1ede6;--suave:#b3ab9f;
--linea:#35322d;--verde:#5cc28a;--verde-bg:#16301f;--rojo:#ef8a73;--rojo-bg:#3a1c16;--azul:#8db8e0;--azul-bg:#182838;
--ambar:#e0b45c;--ambar-bg:#33280f;--btc:#f0a14a}}
*{box-sizing:border-box}html,body{margin:0}
body{background:var(--fondo);color:var(--texto);font:17px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:980px;margin:0 auto;padding:16px 16px 48px}
h1{font-size:1.5rem;margin:8px 0 4px}h2{font-size:1.15rem;margin:28px 0 10px}
.chip{display:inline-block;font-size:.8rem;font-weight:700;padding:2px 10px;border-radius:99px;background:var(--ambar-bg);color:var(--ambar);vertical-align:middle;margin-left:6px}
.meta{color:var(--suave);font-size:.95rem}
.tarjeta{background:var(--tarjeta);border:1px solid var(--linea);border-radius:14px;padding:16px;margin:12px 0}
.veredicto{border-width:2px}.veredicto.bien{border-color:var(--verde)}.veredicto.mal{border-color:var(--rojo)}.veredicto.espera{border-color:var(--azul)}
.veredicto strong{font-size:1.1rem}
.barra{height:10px;border-radius:99px;background:var(--linea);overflow:hidden;margin-top:10px}.barra i{display:block;height:100%;background:var(--azul)}
.cuadros{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.cuadro{background:var(--tarjeta);border:1px solid var(--linea);border-radius:14px;padding:14px;border-top:4px solid var(--c,var(--linea))}
.cuadro .n{font-size:1.5rem;font-weight:700}.cuadro .l{color:var(--suave);font-size:.9rem}
.pos{color:var(--verde)}.neg{color:var(--rojo)}
.aviso{background:var(--rojo-bg);color:var(--rojo);border-radius:12px;padding:12px 14px;margin:12px 0;font-weight:600}
.fila{display:grid;grid-template-columns:1fr auto;gap:4px 12px;align-items:center;padding:14px 4px;border-bottom:1px solid var(--linea);cursor:pointer}
.fila:last-child{border-bottom:0}
.fila .nombre{font-weight:700}.fila .det{color:var(--suave);font-size:.92rem;grid-column:1/3}
.fila .res{font-weight:700;font-size:1.15rem;text-align:right}
.extra{grid-column:1/3;background:var(--fondo);border-radius:10px;padding:12px;margin-top:8px;font-size:.93rem;cursor:auto}
.extra table{width:100%;border-collapse:collapse;display:block;overflow-x:auto}.extra td,.extra th{padding:4px 6px;text-align:left;border-bottom:1px solid var(--linea);white-space:nowrap}
.extra th{color:var(--suave);font-weight:600}
a{color:var(--azul)}
button{font:inherit;min-height:44px;padding:8px 16px;border-radius:10px;border:1px solid var(--linea);background:var(--tarjeta);color:var(--texto);cursor:pointer}
button.peligro{border-color:var(--rojo);color:var(--rojo)}
.leyenda{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:.88rem;color:var(--suave);margin-top:6px}
.leyenda i{display:inline-block;width:18px;height:3px;vertical-align:middle;margin-right:6px;border-radius:2px}
svg text{fill:var(--suave);font-size:12px}
ul.eventos{padding-left:18px;margin:0}ul.eventos li{margin:6px 0}
input{font:inherit;padding:10px 12px;border-radius:10px;border:1px solid var(--linea);background:var(--tarjeta);color:var(--texto);width:100%;min-height:44px}
.aviso.bien{background:var(--verde-bg);color:var(--verde)}
.posiciones{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}
.pos-card{background:var(--tarjeta);border:1px solid var(--linea);border-left:5px solid var(--c);border-radius:14px;padding:14px 16px}
.pos-top{display:flex;justify-content:space-between;gap:4px 10px;flex-wrap:wrap;align-items:baseline}
.pos-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;margin:12px 0 4px}
.pos-grid .l{display:block;color:var(--suave);font-size:.85rem}
.pos-grid .v{display:block;font-size:1.2rem;font-weight:700;font-variant-numeric:tabular-nums}
.pos-grid .d{display:block;color:var(--suave);font-size:.85rem}
.rango{position:relative;height:10px;border-radius:99px;background:linear-gradient(90deg,var(--rojo-bg),var(--linea) 50%,var(--verde-bg));margin:14px 6px 4px}
.rango .px{position:absolute;top:-5px;width:6px;height:20px;border-radius:3px;background:var(--texto);transform:translateX(-50%)}
.rango .en{position:absolute;top:-2px;width:2px;height:14px;background:var(--suave);transform:translateX(-50%)}
.rango-l{display:flex;justify-content:space-between;font-size:.8rem;color:var(--suave)}
.pos-res{font-weight:700;margin:10px 0 0}
.precios{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:8px}
.precio{display:flex;justify-content:space-between;align-items:baseline;gap:6px;padding:8px 10px;border:1px solid var(--linea);border-radius:10px;font-variant-numeric:tabular-nums;flex-wrap:wrap}
.precio b{min-width:44px}
@media (max-width:560px){.cuadros{grid-template-columns:1fr 1fr;gap:10px}.cuadro{padding:12px}.cuadro .n{font-size:1.2rem}.posiciones{grid-template-columns:1fr}}
`;

const base = (titulo: string, cuerpo: string) => `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${titulo}</title><style>${ESTILO}</style></head>
<body><main>${cuerpo}</main></body></html>`;

export function paginaFaltaClave() {
  return base('Laboratorio de trading', `<h1>Falta un paso</h1>
<p class="tarjeta">La simulación ya puede estar corriendo, pero el panel está cerrado hasta que pongas una clave:
en Cloudflare → este Worker → <b>Settings → Variables and Secrets</b>, agrega un secreto llamado
<b>CLAVE_PANEL</b> con una palabra larga que solo tú sepas, y vuelve a abrir esta página.</p>`);
}

export function paginaEntrar(error = '') {
  return base('Entrar', `<h1>Laboratorio de trading</h1>
<form class="tarjeta" method="post" action="/entrar">
<label for="clave"><b>Clave del panel</b></label>
<p style="margin:8px 0"><input id="clave" name="clave" type="password" autocomplete="current-password" required autofocus></p>
${error ? `<p class="aviso">${error}</p>` : ''}
<button type="submit">Entrar</button></form>`);
}

export function paginaPanel() {
  return base('Laboratorio de trading', `
<h1>Laboratorio de trading <span class="chip">SIN DINERO REAL</span></h1>
<p class="meta" id="linea">Cargando…</p>
<div id="contenido"></div>
<script>${SCRIPT}</script>`);
}

const SCRIPT = String.raw`
const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const usd = (n) => '$' + Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
const usd2 = (n) => '$' + Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (x, signo = true) => x == null ? '—' : ((signo && x > 0 ? '+' : '') + (x * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + '%');
const rr = (x) => x == null ? '—' : (x > 0 ? '+' : '') + x.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clase = (x) => x == null ? '' : x > 0 ? 'pos' : x < 0 ? 'neg' : '';
const fecha = (t) => new Date(t).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
const hora = (t) => new Date(t).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
// Precios en formato colombiano: $75.830,12 · $52,13 · $0,07149
const precio = (x) => x == null ? '—' : '$' + (x >= 1000 ? x.toLocaleString('es-CO', { maximumFractionDigits: 2 }) : x.toLocaleString('es-CO', { maximumSignificantDigits: 5 }));
const COLORES = { soldados: '#2a6fdb', triple: '#2a9d8f', tendencia: '#8e5cc4', confluencia: '#d1495b', BTC: 'var(--btc)' };
let estado = null, abierta = null;
let vivos = null, tVivos = null, errorVivos = false;

function veredicto(e) {
  const c = e.filas[0];
  const meta = e.ajustes.operacionesParaDecidir;
  const n = c.operaciones;
  const barra = '<div class="barra" aria-hidden="true"><i style="width:' + Math.min(100, n / meta * 100) + '%"></i></div>';
  if (n < meta) return { tipo: 'espera', texto: '<strong>Todavía no hay con qué decidir.</strong> La candidata (' + esc(c.nombre) + ') lleva ' + n + ' de ' + meta +
    ' operaciones cerradas. Es una estrategia que opera poco: en la prueba con 9 años de precios de Binance, con estas monedas, salían unas 30 a 40 al año.' + barra };
  if (c.rPromedio > 0 && c.resultado > 0) return { tipo: 'bien', texto: '<strong>' + esc(c.nombre) + ' sigue ganando en vivo:</strong> ' + rr(c.rPromedio) + ' por cada dólar arriesgado en ' + n +
    ' operaciones (en la prueba con datos pasados: ' + rr(c.pasado?.rPromedio) + '). Si se decide probar con plata real, que sea poca y con las mismas reglas.' + barra };
  return { tipo: 'mal', texto: '<strong>En vivo, ' + esc(c.nombre) + ' no está ganando</strong> (' + rr(c.rPromedio) + ' por cada dólar arriesgado en ' + n + ' operaciones). Lo de la prueba con datos pasados no se sostuvo: no conviene pasar a dinero real.' + barra };
}

function grafica(e) {
  const puntos = e.curva;
  const tiempos = [...new Set(puntos.map((p) => p.t))].sort((a, b) => a - b);
  if (tiempos.length < 3) return '<p class="tarjeta meta">La gráfica aparece en unas horas (se guarda un punto cada hora).</p>';
  const corta = tiempos[tiempos.length - 1] - tiempos[0] < 3 * 86400000;
  const etiqueta = (t) => corta ? new Date(t).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric' }) : fecha(t);
  const series = {};
  for (const p of puntos) (series[p.cuenta] ??= {})[p.t] = p.valor;
  const vals = puntos.map((p) => p.valor).concat([e.ajustes.capital]);
  let min = Math.min(...vals), max = Math.max(...vals);
  const margen = Math.max((max - min) * 0.08, 3); min -= margen; max += margen;
  const W = Math.max(300, Math.min(900, (document.querySelector('main').clientWidth || 900) - 34));
  const H = W < 600 ? 250 : 320, iz = 54, de = 12, ar = 12, ab = 26;
  const x = (t) => tiempos.length < 2 ? iz : iz + (W - iz - de) * (t - tiempos[0]) / (tiempos[tiempos.length - 1] - tiempos[0]);
  const y = (v) => ar + (H - ar - ab) * (1 - (v - min) / (max - min));
  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Valor de cada cuenta en el tiempo">';
  for (let i = 0; i <= 4; i++) {
    const v = min + (max - min) * i / 4;
    svg += '<line x1="' + iz + '" x2="' + (W - de) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="currentColor" opacity=".12"/>';
    svg += '<text x="' + (iz - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + usd(v) + '</text>';
  }
  const b = e.ajustes.capital;
  svg += '<line x1="' + iz + '" x2="' + (W - de) + '" y1="' + y(b) + '" y2="' + y(b) + '" stroke="currentColor" opacity=".45" stroke-dasharray="3 4"/>';
  // En pantallas angostas, solo la primera y la última fecha (si no, se enciman).
  const marcas = W < 600 ? [[tiempos[0], 'start'], [tiempos[tiempos.length - 1], 'end']]
    : [[tiempos[0], 'start'], [tiempos[Math.floor(tiempos.length / 2)], 'middle'], [tiempos[tiempos.length - 1], 'end']];
  marcas.forEach(([t, ancla]) => {
    svg += '<text x="' + x(t) + '" y="' + (H - 6) + '" text-anchor="' + ancla + '">' + etiqueta(t) + '</text>';
  });
  for (const f of e.filas) {
    const s = series[f.id] || {};
    const d = tiempos.filter((t) => s[t] != null).map((t, i) => (i ? 'L' : 'M') + x(t).toFixed(1) + ' ' + y(s[t]).toFixed(1)).join(' ');
    const ancho = f.id === e.filas[0].id || abierta === f.id ? 3 : 1.6;
    if (d) svg += '<path d="' + d + '" fill="none" stroke="' + (COLORES[f.id] || '#888') + '" stroke-width="' + ancho + '"' + (f.tipo === 'referencia' ? ' stroke-dasharray="7 5"' : '') + ' stroke-linejoin="round"/>';
  }
  svg += '</svg>';
  return '<div class="tarjeta">' + svg + '<div class="leyenda">' + e.filas.map((f) => '<span><i style="background:' + (COLORES[f.id] || '#888') + '"></i>' + esc(f.nombre) + '</span>').join('') +
    '<span>- - - Capital inicial (' + usd(b) + ')</span></div></div>';
}

function fila(f) {
  const color = COLORES[f.id] || '#888';
  let h = '<div class="fila" data-id="' + esc(f.id) + '"><span class="nombre" style="color:' + color + '">' + esc(f.nombre) + '</span>' +
    '<span class="res ' + clase(f.resultado) + '">' + usd(f.valor) + ' · ' + pct(f.resultado) + '</span><span class="det">';
  if (f.tipo === 'referencia') h += 'Compró Bitcoin el primer día y lo guarda · peor caída ' + pct(f.caidaMax, false);
  else h += f.operaciones + ' operaciones cerradas' + (f.operaciones ? ' (' + pct(f.aciertos, false) + ' ganadas)' : '') +
    ' · por cada $1 arriesgado: <b class="' + clase(f.rPromedio) + '">' + rr(f.rPromedio) + '</b>' +
    (f.pasado ? ' (en la prueba con datos pasados: ' + rr(f.pasado.rPromedio) + ' en ' + f.pasado.operaciones + ')' : '') +
    ' · ' + f.posiciones.length + (f.posiciones.length === 1 ? ' abierta' : ' abiertas') + ' · peor caída ' + pct(f.caidaMax, false);
  h += '</span>';
  if (abierta === f.id) h += '<div class="extra">' + detalle(f) + '</div>';
  return h + '</div>';
}

function detalle(f) {
  let h = '<p>' + esc(f.explicacion) + '</p>';
  if (f.tipo === 'referencia') return h;
  h += '<p class="meta">Costos hasta hoy: comisiones ' + usd2(f.comisiones) + ' · funding ' + (f.funding >= 0 ? 'pagado ' : 'cobrado ') + usd2(Math.abs(f.funding)) +
    (f.omitidas ? ' · ' + f.omitidas + ' señales sin espacio para operar' : '') + '</p>';
  if (f.posiciones.length) {
    h += '<table><tr><th>Moneda</th><th>Lado</th><th>Entró</th><th>Stop</th><th>Objetivo</th><th>Arriesga</th></tr>' + f.posiciones.map((p) =>
      '<tr><td>' + esc(p.serie) + '</td><td>' + (p.lado === 1 ? 'Compra' : 'Venta en corto') + '</td><td>' + precio(p.entrada) + '<br><span class="meta">' + hora(p.tEntrada) + '</span></td><td>' + precio(p.stop) +
      '</td><td>' + (p.objetivo == null ? 'sigue la tendencia' : precio(p.objetivo)) + '</td><td>' + usd2(p.arriesgado) + '</td></tr>').join('') + '</table>';
  } else h += '<p class="meta">Sin posiciones abiertas.</p>';
  h += '<div id="ops" class="meta">Cargando operaciones…</div>';
  return h;
}

async function cargarOperaciones(id) {
  const r = await fetch('/api/operaciones?cuenta=' + encodeURIComponent(id));
  const ops = r.ok ? await r.json() : [];
  const cont = document.getElementById('ops');
  if (!cont) return;
  cont.innerHTML = ops.length ? '<p><b>Operaciones cerradas</b></p><table><tr><th>Cerró</th><th>Moneda</th><th>Por qué</th><th>Resultado</th></tr>' + ops.slice(0, 30).map((o) =>
    '<tr><td>' + hora(o.tSalida) + '</td><td>' + esc(o.serie) + ' ' + (o.lado === 1 ? 'compra' : 'corto') + '</td><td>' + esc(o.motivo) + ' → ' +
    ({ stop: 'stop', objetivo: 'objetivo', tiempo: 'tiempo', fin: 'cierre' }[o.por] || esc(o.por)) + '</td><td class="' + clase(o.pnl) + '">' + usd2(o.pnl) + ' (' + rr(o.r) + ' R)</td></tr>').join('') + '</table>'
    : 'Todavía no ha cerrado operaciones.';
}

function pintar() {
  const e = estado;
  if (!e.iniciada) { $('#contenido').innerHTML = '<p class="tarjeta">La simulación está arrancando…</p>'; return; }
  const atraso = e.ultimoCiclo ? (e.ahora - e.ultimoCiclo.t) / 60000 : 999;
  $('#linea').textContent = 'Empezó el ' + fecha(e.iniciadaEl) + ' · día ' + Math.floor(e.dias) + ' · precios de Binance · ' + e.monedas.length + ' monedas en velas de 4 horas y diarias · se recarga cada 30 segundos' +
    (e.ultimoCiclo ? ' (último: ' + hora(e.ultimoCiclo.t) + ')' : '');
  let h = '';
  if (atraso > 10) h += '<p class="aviso">La simulación no se actualiza desde hace ' + Math.round(atraso) + ' minutos. Si sigue así, revisa el Worker en Cloudflare.</p>';
  if (e.ultimoCiclo && e.ultimoCiclo.errores.length) h += '<p class="meta">En la última revisión no se pudo leer: ' + esc(e.ultimoCiclo.errores.slice(0, 3).join(' · ')) + '. Se intenta de nuevo solo.</p>';
  const v = veredicto(e);
  h += '<div class="tarjeta veredicto ' + v.tipo + '">' + v.texto + '</div>';
  h += '<h2>Operaciones abiertas</h2><div id="vivo-pos"></div>';
  h += '<h2>Cuánto lleva cada cuenta</h2><div class="cuadros">' + e.filas.map((f) => '<div class="cuadro" style="--c:' + (COLORES[f.id] || '#888') + '"><div class="l">' + esc(f.nombre) + '</div><div class="n ' + clase(f.resultado) + '">' + usd(f.valor) +
    '</div><div class="l">' + pct(f.resultado) + (f.tipo === 'estrategia' ? ' · ' + f.operaciones + ' op.' : '') + '</div></div>').join('') + '</div>';
  h += '<h2>Precios en vivo</h2><div class="tarjeta" id="vivo-px"></div>';
  h += '<h2>Cómo va cada una</h2>' + grafica(e);
  h += '<div class="tarjeta">' + e.filas.map(fila).join('') + '</div>';
  h += '<h2>Cómo leer esto</h2><div class="tarjeta">' +
    '<p>Cada estrategia tiene su propia cuenta de ' + usd(e.ajustes.capital) + ' virtuales y opera las ' + e.monedas.length + ' monedas a la vez. En cada operación arriesga el ' + (e.ajustes.riesgo * 100) +
    '% de lo que vale la cuenta (la distancia entre la entrada y el stop), y entre todas las posiciones nunca pasa de ' + e.ajustes.apalancamientoMax + 'x.</p>' +
    '<p><b>"Por cada $1 arriesgado"</b> es el número que importa: +0,26 quiere decir que, en promedio, cada operación ganó 26 centavos por cada dólar que puso en riesgo. Si es negativo, la estrategia pierde plata.</p>' +
    '<p>Mira las velas cuando se cierran (cada 4 horas y cada día), entra a la apertura de la siguiente, y cobra las comisiones (' + (e.ajustes.comision * 100).toFixed(3) + '% por orden), el deslizamiento y el funding (costos de Binance Futuros). Son las mismas reglas de la prueba con datos pasados, para poder comparar.</p>' +
    '<p><b>Stop (SL) y objetivo (TP):</b> cada operación nace con los dos. Se revisan con el máximo y el mínimo de cada vela cuando cierra: si el precio los tocó, la operación se cierra a ese precio. Si el precio en vivo ya los tocó antes del cierre, la tarjeta lo avisa. "Va ganando / perdiendo" no cuenta las comisiones.</p>' +
    '<p>La que importa es <b>' + esc(e.filas[0].nombre) + '</b>, la que mejor salió en la prueba con 9 años de precios de Binance. Las otras están para comparar: si en vivo se portan como en la prueba, también confirma que el laboratorio mide bien.</p></div>';
  if (e.eventos.length) h += '<h2>Lo que ha pasado</h2><div class="tarjeta"><ul class="eventos">' + e.eventos.map((ev) => '<li><span class="meta">' + hora(ev.t) + '</span> · ' + esc(ev.texto) + '</li>').join('') + '</ul></div>';
  h += '<p style="margin-top:32px;display:flex;gap:10px;flex-wrap:wrap"><button onclick="location.href=\'/salir\'">Salir</button><button class="peligro" onclick="reiniciar()">Empezar de cero</button></p>';
  $('#contenido').innerHTML = h;
  document.querySelectorAll('.fila').forEach((f) => f.addEventListener('click', (ev) => {
    if (ev.target.closest('.extra')) return;
    abierta = abierta === f.dataset.id ? null : f.dataset.id;
    pintar();
    if (abierta) cargarOperaciones(abierta);
  }));
  pintarVivo();
}

// ── Lo que se refresca cada 30 segundos con precios de Binance ──────────

function celda(etiqueta, valor, detalle, clase) {
  return '<div><span class="l">' + etiqueta + '</span><span class="v ' + (clase || '') + '">' + valor + '</span>' + (detalle ? '<span class="d">' + detalle + '</span>' : '') + '</div>';
}

function tarjetaPosicion(p) {
  const actual = vivos && vivos[p.moneda] ? vivos[p.moneda].precio : null;
  const color = COLORES[p.cuenta] || '#888';
  const hasta = (nivel) => (actual ? 'a ' + pct(nivel / actual - 1) + ' del precio' : '');
  let h = '<div class="pos-card" style="--c:' + color + '"><div class="pos-top"><b>' + esc(p.serie) + ' · ' + (p.lado === 1 ? 'Compra (long)' : 'Venta en corto (short)') + '</b>' +
    '<span class="meta" style="color:' + color + '">' + esc(p.nombreCuenta) + '</span></div>' +
    '<p class="meta" style="margin:4px 0 0">Entró ' + hora(p.tEntrada) + ' · ' + esc(p.motivo) + '</p><div class="pos-grid">' +
    celda('Precio ahora', actual ? precio(actual) : '…', actual ? pct(actual / p.entrada - 1) + ' desde la entrada' : '') +
    celda('Entrada', precio(p.entrada), '') +
    celda('Stop (SL)', precio(p.stop), hasta(p.stop), 'neg') +
    celda('Objetivo (TP)', p.objetivo == null ? 'Sin fijo' : precio(p.objetivo), p.objetivo == null ? 'sigue la tendencia' : hasta(p.objetivo), 'pos') + '</div>';
  if (p.objetivo != null && actual) {
    const f = (x) => Math.max(0, Math.min(1, (x - p.stop) / (p.objetivo - p.stop))) * 100;
    h += '<div class="rango" role="img" aria-label="Dónde está el precio entre el stop y el objetivo"><span class="en" style="left:' + f(p.entrada) + '%"></span><span class="px" style="left:' + f(actual) + '%"></span></div>' +
      '<div class="rango-l"><span>SL</span><span>entrada ┃ precio ▮</span><span>TP</span></div>';
  }
  if (actual) {
    const pnl = p.lado * p.tam * (actual - p.entrada);
    h += '<p class="pos-res ' + clase(pnl) + '">' + (pnl >= 0 ? 'Va ganando ' : 'Va perdiendo ') + usd2(Math.abs(pnl)) + ' (' + rr(pnl / p.arriesgado) + ' R) · arriesga ' + usd2(p.arriesgado) + '</p>';
  }
  if (p.tocado) {
    h += '<p class="aviso ' + (p.tocado.por === 'objetivo' ? 'bien' : '') + '" style="margin:10px 0 0">Ya tocó ' + (p.tocado.por === 'stop' ? 'el stop' : 'el objetivo') + ' (' + precio(p.tocado.precio) + ', ' + hora(p.tocado.t) + '). Se cierra oficialmente al cierre de la vela.</p>';
  }
  return h + '</div>';
}

function pintarVivo() {
  if (!estado || !estado.iniciada) return;
  const cont = document.getElementById('vivo-pos');
  if (cont) {
    const candidata = estado.filas[0].id;
    const ps = estado.filas.filter((f) => f.tipo === 'estrategia')
      .flatMap((f) => f.posiciones.map((p) => ({ ...p, cuenta: f.id, nombreCuenta: f.nombre })))
      .sort((a, b) => (b.cuenta === candidata) - (a.cuenta === candidata) || b.tEntrada - a.tEntrada);
    cont.innerHTML = ps.length ? '<div class="posiciones">' + ps.map(tarjetaPosicion).join('') + '</div>'
      : '<p class="tarjeta meta">No hay operaciones abiertas en este momento. Las estrategias miran las velas cuando cierran (cada 4 horas y cada día).</p>';
  }
  const cpx = document.getElementById('vivo-px');
  if (cpx) {
    const lista = estado.monedas.map((m) => {
      const x = vivos && vivos[m];
      return '<div class="precio"><b>' + esc(m) + '</b><span>' + (x ? precio(x.precio) : '…') + '</span>' + (x ? '<span class="' + clase(x.cambio24h) + '">' + pct(x.cambio24h) + '</span>' : '') + '</div>';
    }).join('');
    const linea = errorVivos ? 'No se pudo leer Binance; se vuelve a intentar en 30 segundos.'
      : tVivos ? 'Binance · actualizado a las ' + new Date(tVivos).toLocaleTimeString('es-CO') + ' · se recarga cada 30 segundos · el % es el cambio en 24 horas' : 'Cargando precios…';
    cpx.innerHTML = '<p class="meta" style="margin:0">' + linea + '</p><div class="precios">' + lista + '</div>';
  }
}

async function cargarPrecios() {
  try {
    const r = await fetch('/api/precios');
    if (r.status === 401) { location.href = '/entrar'; return; }
    const j = await r.json();
    if (!r.ok || !j.precios) throw new Error('sin precios');
    vivos = j.precios;
    tVivos = j.t;
    errorVivos = false;
  } catch (e) {
    errorVivos = true;
  }
  pintarVivo();
}

async function reiniciar() {
  if (!confirm('¿Empezar la simulación de cero? Se borra todo lo que lleva.')) return;
  if (!confirm('Seguro: esto no se puede deshacer.')) return;
  await fetch('/api/reiniciar', { method: 'POST' });
  cargar();
}

async function cargar() {
  try {
    const r = await fetch('/api/estado');
    if (r.status === 401) { location.href = '/entrar'; return; }
    estado = await r.json();
    pintar();
    if (abierta) cargarOperaciones(abierta);
  } catch (e) {
    $('#linea').textContent = 'No se pudo cargar (¿sin conexión?). Se vuelve a intentar en 30 segundos.';
  }
}
cargar();
cargarPrecios();
let redimension;
addEventListener('resize', () => { clearTimeout(redimension); redimension = setTimeout(() => estado && pintar(), 250); });
setInterval(() => { if (!document.hidden) { cargar(); cargarPrecios(); } }, 30000);
// Al volver a la pestaña, actualiza de una vez en vez de esperar.
document.addEventListener('visibilitychange', () => { if (!document.hidden) { cargar(); cargarPrecios(); } });
`;

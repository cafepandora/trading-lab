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
.real{border-width:2px;border-color:var(--ambar)}.real.activo{border-color:var(--verde)}.real.apagado{border-color:var(--linea)}
.estado{display:inline-block;font-weight:700;padding:3px 12px;border-radius:99px;font-size:.9rem}
.estado.on{background:var(--verde-bg);color:var(--verde)}.estado.off{background:var(--linea);color:var(--suave)}.estado.alerta{background:var(--rojo-bg);color:var(--rojo)}
.botones{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
button.principal{background:var(--azul);border-color:var(--azul);color:#fff}
.tipo{font-size:.75rem;font-weight:700;padding:1px 8px;border-radius:99px;margin-left:6px;vertical-align:middle}
.tipo.copia{background:var(--azul-bg);color:var(--azul)}.tipo.referencia{background:var(--ambar-bg);color:var(--ambar)}.tipo.espejo{background:var(--verde-bg);color:var(--verde)}
select{font:inherit;min-height:44px;padding:8px 12px;border-radius:10px;border:1px solid var(--linea);background:var(--tarjeta);color:var(--texto);max-width:100%}
ol.pasos{margin:8px 0;padding-left:22px}ol.pasos li{margin:6px 0}
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
<h1>Laboratorio de trading</h1>
<p class="meta" id="linea">Cargando…</p>
<h2>Bot con dinero real</h2>
<div id="real"><p class="tarjeta meta">Cargando…</p></div>
<h2>Simulaciones <span class="chip">SIN DINERO REAL</span></h2>
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
const PALETA = ['#2a6fdb', '#2a9d8f', '#8e5cc4', '#d1495b', '#4f772d', '#1982c4', '#bc4749', '#5e60ce'];
let estado = null, real = null, abierta = null, verPosiciones = null;
let vivos = null, tVivos = null, errorVivos = false;

const colorDe = (f, i) => f.tipo === 'referencia' ? 'var(--btc)' : f.id === 'espejo-real' ? '#1f7a4a' : f.tipo === 'copia' ? '#8e5cc4' : PALETA[i % PALETA.length];
const etiquetaTipo = (f) => f.id === 'espejo-real' ? '<span class="tipo espejo">igual al bot real</span>' : f.tipo === 'copia' ? '<span class="tipo copia">copia de trader</span>' : f.tipo === 'referencia' ? '<span class="tipo referencia">referencia</span>' : '';
const precioVivo = (m) => (vivos && vivos[m] ? vivos[m].precio : null);

// ── Bot con dinero real ─────────────────────────────────────────────────

function pintarReal() {
  const cont = $('#real');
  if (!real) return;
  const e = real.estado, r = real.reglas;
  if (real.error) { cont.innerHTML = '<p class="tarjeta aviso">No se pudo leer el estado del bot: ' + esc(real.error) + '</p>'; return; }
  let h = '';
  const reglas = '<ul class="meta" style="margin:8px 0 0;padding-left:20px">' +
    '<li>Binance <b>spot, solo compras</b>: sin apalancamiento ni ventas en corto. Lo máximo que se puede perder es su presupuesto.</li>' +
    '<li>Estrategia: cruce de medias 20/50 en velas de 4 horas, en ' + (estado ? estado.monedas.length : 14) + ' monedas. Arriesga ' + (r.riesgo * 100) + '% por operación.</li>' +
    '<li>Cada compra deja puesta en Binance una orden de stop. Si lo que vale baja de ' + usd(r.pisoUsd) + ', vende todo y se apaga.</li>' +
    '<li>Solo usa su presupuesto (' + usd(r.capital) + ') y solo vende lo que él mismo compró: no toca el resto de tu cuenta.</li></ul>';
  if (!real.llaves) {
    h = '<div class="tarjeta real apagado"><span class="estado off">Apagado · faltan las llaves</span>' +
      '<p>Para que pueda operar con tu cuenta de Binance:</p><ol class="pasos">' +
      '<li>En Binance: <b>Perfil → Gestión de API → Crear API</b>. Marca solo <b>"Habilitar trading de Spot y Margin"</b>. <b>Deja apagado el permiso de retiros.</b></li>' +
      '<li>En Cloudflare: este Worker → <b>Settings → Variables and Secrets</b>. Agrega dos secretos: <b>BINANCE_API_KEY</b> (la API key) y <b>BINANCE_API_SECRET</b> (la clave secreta). Nunca las pegues en un chat.</li>' +
      '<li>Pasa ' + usd(r.capital) + ' USDT a tu billetera <b>Spot</b>.</li>' +
      '<li>Vuelve aquí: "Probar conexión" y, si todo sale bien, "Activar".</li></ol>' + reglas + '</div>';
    cont.innerHTML = h;
    return;
  }
  const errores = e.ultimoCiclo && e.ultimoCiclo.errores.length ? '<p class="meta">Último minuto con avisos: ' + esc(e.ultimoCiclo.errores.slice(0, 3).join(' · ')) + '</p>' : '';
  if (!e.activo) {
    h = '<div class="tarjeta real apagado"><span class="estado ' + (e.motivo ? 'alerta' : 'off') + '">' + (e.motivo ? 'Apagado' : 'Listo, pero apagado') + '</span>' +
      (e.motivo ? '<p><b>Se apagó porque ' + esc(e.motivo) + '</b></p>' : '<p>Tiene las llaves. No opera hasta que lo actives.</p>') +
      (e.operaciones ? '<p class="meta">Hasta ahora: ' + e.operaciones + ' operaciones, resultado ' + '<b class="' + clase(e.resultado) + '">' + usd2(e.resultado) + '</b>.</p>' : '') +
      reglas + '<div class="botones"><button onclick="probarReal()">Probar conexión</button><button class="principal" onclick="activarReal()">Activar con ' + usd(r.capital) + '</button></div><p id="real-msg" class="meta"></p></div>';
  } else {
    const valor = e.valor, res = valor / e.presupuesto - 1;
    h = '<div class="tarjeta real activo"><span class="estado on">Activo · operando con plata real</span>' +
      '<div class="cuadros" style="margin-top:12px">' +
      '<div class="cuadro"><div class="l">Vale ahora</div><div class="n ' + clase(res) + '">' + usd2(valor) + '</div><div class="l">' + pct(res) + ' desde ' + usd2(e.presupuesto) + '</div></div>' +
      '<div class="cuadro"><div class="l">En caja (USDT)</div><div class="n">' + usd2(e.caja) + '</div><div class="l">se apaga si todo baja de ' + usd(r.pisoUsd) + '</div></div>' +
      '<div class="cuadro"><div class="l">Operaciones cerradas</div><div class="n">' + e.operaciones + '</div><div class="l">' + e.ganadas + ' ganadas · resultado ' + usd2(e.resultado) + '</div></div></div>';
    const ps = Object.values(e.posiciones);
    h += ps.length ? '<div class="posiciones" style="margin-top:12px">' + ps.map((p) => tarjetaPosicion({
      serie: p.moneda + ' 4h', moneda: p.moneda, lado: 1, entrada: p.entrada, tam: p.cantidad, stop: p.stop, objetivo: null,
      arriesgado: p.arriesgado, tEntrada: p.tEntrada, motivo: p.ordenStop ? 'stop puesto en Binance ✓' : 'stop vigilado por el bot', cuenta: 'real', nombreCuenta: 'Dinero real',
    }, '#1f7a4a')).join('') + '</div>' : '<p class="meta">Sin posiciones abiertas: espera una señal al cierre de las velas de 4 horas.</p>';
    h += errores + '<div class="botones"><button onclick="probarReal()">Probar conexión</button><button class="peligro" onclick="detenerReal()">Detener y vender todo</button></div><p id="real-msg" class="meta"></p></div>';
  }
  if (real.eventos.length) h += '<div class="tarjeta"><b>Lo que ha hecho</b><ul class="eventos">' + real.eventos.slice(0, 12).map((ev) => '<li class="' + (ev.tipo === 'error' ? 'neg' : '') + '"><span class="meta">' + hora(ev.t) + '</span> · ' + esc(ev.texto) + '</li>').join('') + '</ul></div>';
  cont.innerHTML = h;
}

async function accionReal(ruta, cuerpo) {
  const msg = document.getElementById('real-msg');
  if (msg) msg.textContent = 'Un momento…';
  try {
    const r = await fetch(ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo || {}) });
    const j = await r.json();
    await cargarReal();
    const m = document.getElementById('real-msg');
    if (m) m.textContent = j.ok === false ? j.error : j.usdt != null ? 'Conexión correcta. Tienes ' + usd2(j.usdt) + ' USDT libres en Spot.' : 'Listo.';
    if (m && j.ok === false) m.className = 'aviso';
  } catch (e) {
    if (msg) msg.textContent = 'No se pudo: ' + e.message;
  }
}
function probarReal() { accionReal('/api/real/probar'); }
function activarReal() {
  const t = prompt('Vas a activar el bot con DINERO REAL (' + usd(real.reglas.capital) + ' de tu cuenta de Binance). Puedes perder parte o todo ese dinero. Para confirmar, escribe ACTIVAR:');
  if (t !== 'ACTIVAR') return;
  accionReal('/api/real/activar', { confirmo: 'ACTIVAR' });
}
function detenerReal() {
  if (!confirm('¿Detener el bot? Vende a mercado todo lo que compró y lo apaga.')) return;
  accionReal('/api/real/detener');
}

// ── Simulaciones ─────────────────────────────────────────────────────────

function ordenadas(e) {
  return [...e.filas].sort((a, b) => b.resultado - a.resultado);
}

function veredicto(e) {
  const c = e.filas.find((f) => f.id === 'espejo-real') || e.filas[0];
  const meta = e.ajustes.operacionesParaDecidir, n = c.operaciones;
  const barra = '<div class="barra" aria-hidden="true"><i style="width:' + Math.min(100, n / meta * 100) + '%"></i></div>';
  const texto = n < meta
    ? '<strong>' + esc(c.nombre) + ':</strong> lleva ' + n + ' de ' + meta + ' operaciones cerradas para poder comparar con confianza. Resultado hasta ahora: <b class="' + clase(c.resultado) + '">' + pct(c.resultado) + '</b> (' + usd2(c.valor) + ' de ' + usd2(c.capital) + ').'
    : '<strong>' + esc(c.nombre) + ':</strong> ' + n + ' operaciones, ' + rr(c.rPromedio) + ' por cada dólar arriesgado, resultado <b class="' + clase(c.resultado) + '">' + pct(c.resultado) + '</b>.';
  return { tipo: n < meta ? 'espera' : c.resultado > 0 ? 'bien' : 'mal', texto: texto + ' Si el bot real se activa, debería parecerse a esta simulación; si se separan mucho, algo en la ejecución real cuesta más de lo previsto.' + barra };
}

function grafica(e) {
  const puntos = e.curva;
  const tiempos = [...new Set(puntos.map((p) => p.t))].sort((a, b) => a - b);
  if (tiempos.length < 3) return '<p class="tarjeta meta">La gráfica aparece en unas horas (se guarda un punto cada hora).</p>';
  const corta = tiempos[tiempos.length - 1] - tiempos[0] < 3 * 86400000;
  const etiqueta = (t) => corta ? new Date(t).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric' }) : fecha(t);
  // Se dibuja en % para comparar cuentas de distinto tamaño (500 y 50 USD).
  const capital = Object.fromEntries(e.filas.map((f) => [f.id, f.capital]));
  const series = {};
  for (const p of puntos) (series[p.cuenta] ??= {})[p.t] = p.valor / (capital[p.cuenta] || 500) - 1;
  const orden = ordenadas(e).filter((f) => f.tipo === 'estrategia' && f.id !== 'espejo-real');
  const visibles = [...e.filas.filter((f) => f.id === 'espejo-real' || f.tipo !== 'estrategia'), ...orden.slice(0, 3), ...(abierta ? e.filas.filter((f) => f.id === abierta) : [])];
  const unicas = [...new Map(visibles.map((f) => [f.id, f])).values()];
  const vals = unicas.flatMap((f) => Object.values(series[f.id] || {})).concat([0]);
  let min = Math.min(...vals), max = Math.max(...vals);
  const margen = Math.max((max - min) * 0.08, 0.005); min -= margen; max += margen;
  const W = Math.max(300, Math.min(900, (document.querySelector('main').clientWidth || 900) - 34));
  const H = W < 600 ? 250 : 320, iz = 54, de = 12, ar = 12, ab = 26;
  const x = (t) => iz + (W - iz - de) * (t - tiempos[0]) / (tiempos[tiempos.length - 1] - tiempos[0]);
  const y = (v) => ar + (H - ar - ab) * (1 - (v - min) / (max - min));
  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Resultado de cada simulación en el tiempo">';
  for (let i = 0; i <= 4; i++) {
    const v = min + (max - min) * i / 4;
    svg += '<line x1="' + iz + '" x2="' + (W - de) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="currentColor" opacity=".12"/>';
    svg += '<text x="' + (iz - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + pct(v) + '</text>';
  }
  svg += '<line x1="' + iz + '" x2="' + (W - de) + '" y1="' + y(0) + '" y2="' + y(0) + '" stroke="currentColor" opacity=".45" stroke-dasharray="3 4"/>';
  const marcas = W < 600 ? [[tiempos[0], 'start'], [tiempos[tiempos.length - 1], 'end']]
    : [[tiempos[0], 'start'], [tiempos[Math.floor(tiempos.length / 2)], 'middle'], [tiempos[tiempos.length - 1], 'end']];
  marcas.forEach(([t, ancla]) => { svg += '<text x="' + x(t) + '" y="' + (H - 6) + '" text-anchor="' + ancla + '">' + etiqueta(t) + '</text>'; });
  unicas.forEach((f, i) => {
    const s = series[f.id] || {};
    const d = tiempos.filter((t) => s[t] != null).map((t, k) => (k ? 'L' : 'M') + x(t).toFixed(1) + ' ' + y(s[t]).toFixed(1)).join(' ');
    const ancho = f.id === 'espejo-real' || f.id === abierta ? 3 : 1.8;
    if (d) svg += '<path d="' + d + '" fill="none" stroke="' + colorDe(f, i) + '" stroke-width="' + ancho + '"' + (f.tipo === 'referencia' ? ' stroke-dasharray="7 5"' : '') + ' stroke-linejoin="round"/>';
  });
  svg += '</svg>';
  return '<div class="tarjeta">' + svg + '<div class="leyenda">' + unicas.map((f, i) => '<span><i style="background:' + colorDe(f, i) + '"></i>' + esc(f.nombre) + '</span>').join('') +
    '</div><p class="meta" style="margin:6px 0 0">Muestra la que imita al bot real, las copias de traders, Bitcoin y las 3 mejores; toca una fila de la tabla para verla aquí.</p></div>';
}

function fila(f, i) {
  let h = '<div class="fila" data-id="' + esc(f.id) + '"><span class="nombre" style="color:' + colorDe(f, i) + '">' + esc(f.nombre) + etiquetaTipo(f) + '</span>' +
    '<span class="res ' + clase(f.resultado) + '">' + usd(f.valor) + ' · ' + pct(f.resultado) + '</span><span class="det">';
  if (f.tipo === 'referencia') h += 'Compró Bitcoin el primer día y lo guarda · peor caída ' + pct(f.caidaMax, false);
  else if (f.tipo === 'copia') h += f.operaciones + ' operaciones · el trader solo: <b class="' + clase(f.resultadoTrader) + '">' + pct(f.resultadoTrader) + '</b> · peor caída ' + pct(f.caidaMax, false) +
    (f.estado && f.estado !== 'activa' ? ' · <b class="neg">' + esc(f.motivoEstado || f.estado) + '</b>' : '') + ' · ' + f.posiciones.length + (f.posiciones.length === 1 ? ' abierta' : ' abiertas');
  else h += f.operaciones + ' operaciones cerradas' + (f.operaciones ? ' (' + pct(f.aciertos, false) + ' ganadas)' : '') +
    ' · por cada $1 arriesgado: <b class="' + clase(f.rPromedio) + '">' + rr(f.rPromedio) + '</b>' +
    (f.pasado ? ' (en la prueba con datos pasados: ' + rr(f.pasado.rPromedio) + ')' : '') +
    ' · ' + f.posiciones.length + (f.posiciones.length === 1 ? ' abierta' : ' abiertas') + ' · peor caída ' + pct(f.caidaMax, false);
  h += '</span>';
  if (abierta === f.id) h += '<div class="extra">' + detalle(f) + '</div>';
  return h + '</div>';
}

function detalle(f) {
  let h = '<p>' + esc(f.explicacion) + '</p>';
  if (f.nota && f.nota !== f.explicacion) h += '<p class="meta">' + esc(f.nota) + '</p>';
  if (f.tipo === 'copia' && f.alElegir) {
    const a = f.alElegir;
    h += '<p class="meta">Billetera: <a href="https://app.hyperliquid.xyz/explorer/address/' + esc(f.direccion) + '" target="_blank" rel="noopener">' + esc(f.direccion) + '</a><br>Al elegirlo (' + esc(a.fecha) + '): ' +
      esc(a.anios) + ' años de historia (lo máximo que muestra Hyperliquid), ganó en el ' + Math.round(a.trimestresEnVerde * 100) + '% de los trimestres, su peor caída fue ' + Math.round(a.caidaMax * 100) + '%, usa ' + esc(a.apalancamiento) + 'x y opera ' + esc((a.monedas || []).join(', ')) + '.</p>';
  }
  if (f.tipo === 'referencia') return h;
  h += '<p class="meta">Costos: comisiones ' + usd2(f.comisiones) + ' · funding ' + (f.funding >= 0 ? 'pagado ' : 'cobrado ') + usd2(Math.abs(f.funding)) + (f.omitidas ? ' · ' + f.omitidas + ' señales sin espacio' : '') + '</p>';
  h += '<div id="ops" class="meta">Cargando operaciones…</div>';
  return h;
}

async function cargarOperaciones(id) {
  const r = await fetch('/api/operaciones?cuenta=' + encodeURIComponent(id));
  const j = r.ok ? await r.json() : [];
  const cont = document.getElementById('ops');
  if (!cont) return;
  if (j.copia) {
    const ops = j.operaciones;
    cont.innerHTML = ops.length ? '<p><b>Últimas operaciones</b></p><table><tr><th>Cuándo</th><th>Qué</th><th>Valor</th><th>Ganó</th></tr>' + ops.slice(0, 30).map((o) =>
      '<tr><td>' + hora(o.t) + '</td><td>' + (o.lado === 'compra' ? 'Compra' : 'Venta') + ' ' + esc(o.moneda) + ' · ' + esc(o.motivo) + '</td><td>' + usd2(o.nocional) + '</td><td class="' + clase(o.pnl) + '">' + (o.pnl ? usd2(o.pnl) : '') + '</td></tr>').join('') + '</table>' : 'Todavía no ha operado.';
    return;
  }
  const ops = j;
  cont.innerHTML = ops.length ? '<p><b>Operaciones cerradas</b></p><table><tr><th>Cerró</th><th>Moneda</th><th>Por qué</th><th>Resultado</th></tr>' + ops.slice(0, 30).map((o) =>
    '<tr><td>' + hora(o.tSalida) + '</td><td>' + esc(o.serie) + ' ' + (o.lado === 1 ? 'compra' : 'corto') + '</td><td>' + esc(o.motivo) + ' → ' +
    ({ stop: 'stop', objetivo: 'objetivo', tiempo: 'tiempo', fin: 'cierre', senal: 'señal de salida' }[o.por] || esc(o.por)) + '</td><td class="' + clase(o.pnl) + '">' + usd2(o.pnl) + ' (' + rr(o.r) + ' R)</td></tr>').join('') + '</table>'
    : 'Todavía no ha cerrado operaciones.';
}

function pintar() {
  const e = estado;
  if (!e.iniciada) { $('#contenido').innerHTML = '<p class="tarjeta">La simulación está arrancando…</p>'; return; }
  const atraso = e.ultimoCiclo ? (e.ahora - e.ultimoCiclo.t) / 60000 : 999;
  const nEst = e.filas.filter((f) => f.tipo === 'estrategia').length, nCop = e.filas.filter((f) => f.tipo === 'copia').length;
  $('#linea').textContent = 'Precios de Binance · se recarga cada 30 segundos · simulaciones desde el ' + fecha(e.iniciadaEl) + ' (día ' + Math.floor(e.dias) + ')' + (e.ultimoCiclo ? ' · último ciclo: ' + hora(e.ultimoCiclo.t) : '');
  let h = '';
  if (atraso > 10) h += '<p class="aviso">Las simulaciones no se actualizan desde hace ' + Math.round(atraso) + ' minutos. Si sigue así, revisa el Worker en Cloudflare.</p>';
  if (e.ultimoCiclo && e.ultimoCiclo.errores.length) h += '<p class="meta">En la última revisión no se pudo leer: ' + esc(e.ultimoCiclo.errores.slice(0, 3).join(' · ')) + '. Se intenta de nuevo solo.</p>';
  const v = veredicto(e);
  h += '<div class="tarjeta veredicto ' + v.tipo + '">' + v.texto + '</div>';
  h += '<p class="meta">' + nEst + ' estrategias' + (nCop ? ', ' + nCop + (nCop === 1 ? ' copia' : ' copias') + ' de traders' : '') + ' y Bitcoin guardado, cada una con su propia cuenta. Ordenadas por resultado; toca una para ver el detalle.</p>';
  h += grafica(e);
  const lista = ordenadas(e);
  h += '<div class="tarjeta">' + lista.map((f) => fila(f, e.filas.indexOf(f))).join('') + '</div>';
  const conPos = lista.filter((f) => f.posiciones.length);
  if (!verPosiciones || !conPos.some((f) => f.id === verPosiciones)) verPosiciones = (conPos.find((f) => f.id === 'espejo-real') || conPos[0] || {}).id || null;
  h += '<h2>Operaciones abiertas</h2>' + (conPos.length ? '<p><label class="meta" for="ver-pos">De la simulación: </label><select id="ver-pos" onchange="verPosiciones=this.value;pintarVivo()">' +
    conPos.map((f) => '<option value="' + esc(f.id) + '"' + (f.id === verPosiciones ? ' selected' : '') + '>' + esc(f.nombre) + ' (' + f.posiciones.length + ')</option>').join('') + '</select></p>' : '') + '<div id="vivo-pos"></div>';
  h += '<h2>Precios en vivo</h2><div class="tarjeta" id="vivo-px"></div>';
  h += '<h2>Cómo leer esto</h2><div class="tarjeta">' +
    '<p>Cada simulación tiene su propia cuenta virtual: ' + usd(e.ajustes.capital) + ' las estrategias y las copias, y ' + usd(50) + ' la que imita al bot real (spot, comisión de 0,1%, sin apalancamiento). Arriesgan el ' + (e.ajustes.riesgo * 100) + '% de lo que valen por operación.</p>' +
    '<p><b>"Por cada $1 arriesgado"</b> es el número que importa: +0,26 quiere decir que, en promedio, cada operación ganó 26 centavos por cada dólar que puso en riesgo. Si es negativo, la estrategia pierde plata.</p>' +
    '<p><b>Stop (SL) y objetivo (TP):</b> se revisan con el máximo y el mínimo de cada vela cuando cierra; si el precio en vivo ya los tocó antes, la tarjeta lo avisa. "Va ganando / perdiendo" no cuenta las comisiones.</p>' +
    '<p><b>Copias de traders:</b> cada 30 segundos miran las posiciones de un trader de Hyperliquid con años ganando y hacen lo mismo en proporción, con tope de 2x y frenos (−5% en un día → pausa hasta mañana; −30% → se detiene). Son solo una guía: que haya ganado antes no asegura nada.</p></div>';
  if (e.eventos.length) h += '<h2>Lo que ha pasado</h2><div class="tarjeta"><ul class="eventos">' + e.eventos.slice(0, 40).map((ev) => '<li><span class="meta">' + hora(ev.t) + '</span> · ' + esc(ev.texto) + '</li>').join('') + '</ul></div>';
  h += '<p style="margin-top:32px;display:flex;gap:10px;flex-wrap:wrap"><button onclick="location.href=\'/salir\'">Salir</button><button class="peligro" onclick="reiniciar()">Empezar de cero las simulaciones</button></p>';
  $('#contenido').innerHTML = h;
  document.querySelectorAll('.fila').forEach((el) => el.addEventListener('click', (ev) => {
    if (ev.target.closest('.extra')) return;
    abierta = abierta === el.dataset.id ? null : el.dataset.id;
    pintar();
    if (abierta) cargarOperaciones(abierta);
  }));
  pintarVivo();
}

// ── Lo que se refresca cada 30 segundos con precios de Binance ──────────

function celda(etiqueta, valor, detalle, clase) {
  return '<div><span class="l">' + etiqueta + '</span><span class="v ' + (clase || '') + '">' + valor + '</span>' + (detalle ? '<span class="d">' + detalle + '</span>' : '') + '</div>';
}

function tarjetaPosicion(p, color) {
  const actual = precioVivo(p.moneda) ?? p.precioActual ?? null;
  const hasta = (nivel) => (actual ? 'a ' + pct(nivel / actual - 1) + ' del precio' : '');
  let h = '<div class="pos-card" style="--c:' + color + '"><div class="pos-top"><b>' + esc(p.serie) + ' · ' + (p.lado === 1 ? 'Compra (long)' : 'Venta en corto (short)') + '</b>' +
    '<span class="meta" style="color:' + color + '">' + esc(p.nombreCuenta) + '</span></div>' +
    '<p class="meta" style="margin:4px 0 0">' + (p.tEntrada ? 'Entró ' + hora(p.tEntrada) + ' · ' : '') + esc(p.motivo) + '</p><div class="pos-grid">' +
    celda('Precio ahora', actual ? precio(actual) : '…', actual ? pct(p.lado * (actual / p.entrada - 1)) + ' a su favor' : '') +
    celda('Entrada', precio(p.entrada), '') +
    celda('Stop (SL)', p.stop == null ? (p.cuenta && p.cuenta.startsWith('trader-') ? 'El del trader' : 'Sale con la señal') : precio(p.stop), p.stop == null ? '' : hasta(p.stop), p.stop == null ? '' : 'neg') +
    celda('Objetivo (TP)', p.objetivo == null ? 'Sin fijo' : precio(p.objetivo), p.objetivo == null ? 'sale con la señal' : hasta(p.objetivo), 'pos') + '</div>';
  if (p.objetivo != null && p.stop != null && actual) {
    const f = (x) => Math.max(0, Math.min(1, (x - p.stop) / (p.objetivo - p.stop))) * 100;
    h += '<div class="rango" role="img" aria-label="Dónde está el precio entre el stop y el objetivo"><span class="en" style="left:' + f(p.entrada) + '%"></span><span class="px" style="left:' + f(actual) + '%"></span></div>' +
      '<div class="rango-l"><span>SL</span><span>entrada ┃ precio ▮</span><span>TP</span></div>';
  }
  if (actual) {
    const pnl = p.lado * p.tam * (actual - p.entrada);
    h += '<p class="pos-res ' + clase(pnl) + '">' + (pnl >= 0 ? 'Va ganando ' : 'Va perdiendo ') + usd2(Math.abs(pnl)) + (p.arriesgado > 0 ? ' (' + rr(pnl / p.arriesgado) + ' R) · arriesga ' + usd2(p.arriesgado) : '') + '</p>';
  }
  if (p.tocado) h += '<p class="aviso ' + (p.tocado.por === 'objetivo' ? 'bien' : '') + '" style="margin:10px 0 0">Ya tocó ' + (p.tocado.por === 'stop' ? 'el stop' : 'el objetivo') + ' (' + precio(p.tocado.precio) + ', ' + hora(p.tocado.t) + '). Se cierra oficialmente al cierre de la vela.</p>';
  return h + '</div>';
}

function pintarVivo() {
  pintarReal();
  if (!estado || !estado.iniciada) return;
  const cont = document.getElementById('vivo-pos');
  if (cont) {
    const f = estado.filas.find((x) => x.id === verPosiciones);
    const i = f ? estado.filas.indexOf(f) : 0;
    cont.innerHTML = f && f.posiciones.length ? '<div class="posiciones">' + f.posiciones.map((p) => tarjetaPosicion({ ...p, cuenta: f.id, nombreCuenta: f.nombre }, colorDe(f, i))).join('') + '</div>'
      : '<p class="tarjeta meta">Ninguna simulación tiene operaciones abiertas en este momento.</p>';
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

async function cargarReal() {
  try {
    const r = await fetch('/api/real/estado');
    if (r.status === 401) { location.href = '/entrar'; return; }
    real = await r.json();
  } catch (e) {
    real = { error: e.message };
  }
  pintarReal();
}

async function reiniciar() {
  if (!confirm('¿Empezar las simulaciones de cero? Se borra lo que llevan. (El bot con dinero real no se toca.)')) return;
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
function todo() { cargar(); cargarPrecios(); cargarReal(); }
todo();
let redimension;
addEventListener('resize', () => { clearTimeout(redimension); redimension = setTimeout(() => estado && pintar(), 250); });
setInterval(() => { if (!document.hidden) todo(); }, 30000);
// Al volver a la pestaña, actualiza de una vez en vez de esperar.
document.addEventListener('visibilitychange', () => { if (!document.hidden) todo(); });
`;

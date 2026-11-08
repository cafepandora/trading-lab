// Worker de Cloudflare: el panel (con clave) y un Durable Object que corre
// la simulación cada 30 segundos con una alarma. El cron cada 10 minutos
// solo revisa que la alarma siga puesta.

import { DurableObject } from 'cloudflare:workers';
import * as binance from '../binance';
import { AlmacenDO } from './almacen';
import { MONEDAS } from './config';
import { paginaEntrar, paginaFaltaClave, paginaPanel } from './panel';
import { VERSION, armarEstado, correrCiclo, iniciar } from './simulacion';

export interface Env {
  SIMULADOR: DurableObjectNamespace<Simulador>;
  CLAVE_PANEL?: string;
}

const INTERVALO = 30_000;

export class Simulador extends DurableObject<Env> {
  private almacen: AlmacenDO;
  private corriendo = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.almacen = new AlmacenDO(ctx.storage);
    ctx.blockConcurrencyWhile(async () => this.almacen.crearTablas());
  }

  /**
   * Arranca la simulación la primera vez (o de cero si cambió algo de fondo,
   * como la fuente de precios) y deja la alarma puesta.
   */
  async asegurar() {
    const config = await this.almacen.leerConfig();
    if (!config || config.version !== VERSION) {
      await iniciar(this.almacen);
      await this.ciclo();
    }
    if ((await this.ctx.storage.getAlarm()) == null) {
      await this.ctx.storage.setAlarm(Date.now() + INTERVALO);
    }
  }

  async alarm() {
    try {
      await this.ciclo();
    } finally {
      await this.ctx.storage.setAlarm(Date.now() + INTERVALO);
    }
  }

  private async ciclo() {
    if (this.corriendo) return null;
    this.corriendo = true;
    try {
      return await correrCiclo(this.almacen);
    } finally {
      this.corriendo = false;
    }
  }

  async estado() {
    await this.asegurar();
    return JSON.stringify(await armarEstado(this.almacen));
  }

  async operacionesDe(cuenta: string) {
    return JSON.stringify(await this.almacen.operaciones(cuenta, 200));
  }

  async reiniciar() {
    await iniciar(this.almacen);
    await this.ciclo();
    await this.ctx.storage.setAlarm(Date.now() + INTERVALO);
  }
}

// ── Clave del panel ──────────────────────────────────────────────────────

const COOKIE = 'lab_sesion';

async function huella(texto: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`trading-lab:${texto}`));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function iguales(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function autorizado(req: Request, env: Env) {
  const galleta = req.headers.get('Cookie') ?? '';
  const valor = galleta.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? '';
  return !!env.CLAVE_PANEL && iguales(valor, await huella(env.CLAVE_PANEL));
}

const CABECERAS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
  'Cache-Control': 'no-store',
};

const html = (cuerpo: string, status = 200) =>
  new Response(cuerpo, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...CABECERAS } });
const json = (cuerpo: string, status = 200) =>
  new Response(cuerpo, { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CABECERAS } });

const simulador = (env: Env) => env.SIMULADOR.get(env.SIMULADOR.idFromName('principal'));

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!env.CLAVE_PANEL) return html(paginaFaltaClave(), 503);

    if (url.pathname === '/entrar') {
      if (req.method === 'POST') {
        const form = await req.formData().catch(() => null);
        const clave = String(form?.get('clave') ?? '');
        if (iguales(await huella(clave), await huella(env.CLAVE_PANEL))) {
          return new Response(null, {
            status: 303,
            headers: {
              Location: '/',
              'Set-Cookie': `${COOKIE}=${await huella(env.CLAVE_PANEL)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${90 * 86400}`,
              ...CABECERAS,
            },
          });
        }
        await new Promise((r) => setTimeout(r, 800)); // frena intentos seguidos
        return html(paginaEntrar('Esa no es la clave.'), 401);
      }
      return html(paginaEntrar());
    }

    if (!(await autorizado(req, env))) {
      if (url.pathname.startsWith('/api/')) return json('{"error":"sin sesión"}', 401);
      return Response.redirect(new URL('/entrar', url).toString(), 303);
    }

    const sim = simulador(env);
    if (url.pathname === '/') return html(paginaPanel());
    if (url.pathname === '/api/estado') return json(await sim.estado());
    if (url.pathname === '/api/precios') {
      // Directo de Binance, sin pasar por la simulación: es lo que el panel
      // muestra cada 30 segundos.
      try {
        return json(JSON.stringify({ t: Date.now(), precios: await binance.precios(MONEDAS) }));
      } catch (e) {
        return json(JSON.stringify({ error: (e as Error).message }), 502);
      }
    }
    if (url.pathname === '/api/operaciones') return json(await sim.operacionesDe((url.searchParams.get('cuenta') ?? '').slice(0, 20)));
    if (url.pathname === '/api/reiniciar' && req.method === 'POST') {
      await sim.reiniciar();
      return json('{"ok":true}');
    }
    if (url.pathname === '/salir') {
      return new Response(null, { status: 303, headers: { Location: '/entrar', 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0`, ...CABECERAS } });
    }
    return html('<p>No existe esta página.</p>', 404);
  },

  async scheduled(_evento: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(simulador(env).asegurar());
  },
} satisfies ExportedHandler<Env>;

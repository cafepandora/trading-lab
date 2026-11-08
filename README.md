# Laboratorio de trading

Dos partes, sin dinero real, con precios de **Binance**:

1. **El laboratorio** (`npm run laboratorio`): prueba estrategias de análisis
   técnico con la historia de precios de Binance (desde 2017), con costos
   reales, y las compara con comprar y guardar y con entrar al azar.
2. **La simulación en vivo** (Cloudflare): opera en papel las estrategias
   elegidas, vela por vela, a medida que el mercado avanza. El panel muestra
   cada operación abierta con su **stop (SL)**, su **objetivo (TP)** y el
   **precio en vivo**, y se recarga cada 30 segundos.

Nada de esto opera, tiene llaves ni toca una cuenta: solo lee datos públicos
de mercado de Binance (`data-api.binance.vision`, mercado spot en USDT).

## Qué encontró el laboratorio (Binance, 2017–2026)

14 monedas (BTC, ETH, SOL, XRP, DOGE, BNB, AVAX, LINK, LTC, ADA, SUI, AAVE,
DOT, NEAR), velas de 4 horas y diarias, desde que cada una está en Binance.
Cada operación arriesga el 1% de la cuenta, con comisión de Binance Futuros
(0,05% por orden), deslizamiento y funding. Detalle en
`resultados/binance-15-monedas.json` (HYPE no entró: en Binance solo tiene
unas semanas de historia).

| Estrategia | Operaciones | Por cada $1 arriesgado | Parte vieja / nueva | ¿El azar haría igual o mejor? |
|---|---|---|---|---|
| Velas: tres soldados / tres cuervos | 248 | +0,26 | +0,25 / +0,27 | ~0% |
| Seguir la tendencia (Donchian 55/20) | 3.639 | +0,25 | +0,34 / +0,04 | ~0% |
| Triple techo / triple suelo | 195 | +0,10 | +0,09 / +0,10 | 6,5% |
| Elliott: entrar en la onda 3 | 2.389 | +0,02 | +0,06 / −0,09 | 0,5% |
| Hombro-cabeza-hombro | 661 | 0,00 | 0,00 / 0,00 | 15% |
| Velas: estrella de la mañana / tarde | 2.458 | −0,01 | 0,00 / −0,04 | 6% |
| Elliott: corrección tras 5 ondas | 730 | −0,05 | −0,10 / +0,07 | 51% |
| Fibonacci 50–61,8% | 4.237 | −0,06 | −0,05 / −0,09 | 62% |
| Velas: envolvente | 13.396 | −0,06 | −0,06 / −0,07 | 78% |
| Todo junto: Fibonacci + vela + tendencia | 2.176 | −0,07 | −0,04 / −0,13 | 66% |
| Fibonacci 61,8–78,6% | 3.875 | −0,07 | −0,06 / −0,10 | 81% |
| Velas: martillo / estrella fugaz | 4.022 | −0,14 | −0,10 / −0,23 | 100% |

- **Tres soldados / tres cuervos** es la más sólida: igual de buena en la
  parte vieja y en la nueva de los datos, y positiva en casi todas las
  monedas. Opera poco: unas 30 a 40 veces al año entre las 14 monedas.
- **Seguir la tendencia** gana en promedio, pero casi todo viene de los
  primeros años (2017–2021); en la parte reciente apenas da algo.
- Fibonacci, la mayoría de las velas y la combinación de todo **pierden
  plata** después de costos.
- Comprar y guardar dio +18% al año en promedio en estas monedas, pero con
  caídas de 77% a 97% en el camino.

Antes se había probado con datos de Hyperliquid (desde 2021):
`resultados/hyperliquid-*.json`. Las conclusiones son las mismas.

## La simulación en vivo

Cuatro cuentas de 500 USD virtuales, cada una con una estrategia, operando
las 14 monedas a la vez (velas de 4 horas y diarias):

- **Tres soldados / tres cuervos**, la candidata;
- triple techo / triple suelo, seguir la tendencia y "todo junto", para comparar;
- más una referencia: **Bitcoin comprado el primer día y guardado**.

Usa exactamente las mismas reglas que el laboratorio (`src/posicion.ts`): las
pruebas comprueban que, procesando las velas de a poco, da las mismas
operaciones que la prueba con datos pasados. Arriesga el 1% de lo que vale la
cuenta por operación, nunca pasa de 2x entre todas las posiciones, salta
órdenes de menos de 10 USD y cobra comisión, deslizamiento y funding.

**El panel**, que se recarga cada 30 segundos:

- **Operaciones abiertas**: cada una con precio de entrada, **stop (SL)**,
  **objetivo (TP)**, **precio en vivo**, a qué distancia está de cada uno,
  una barra de dónde va entre el SL y el TP, y cuánto va ganando o perdiendo.
- **Precios en vivo** de las 14 monedas en Binance, con el cambio de 24 horas.
- Cuánto lleva cada cuenta, la gráfica, y la historia de cada operación.

El SL y el TP se revisan con el máximo y el mínimo de cada vela cuando cierra
(igual que en el laboratorio): si el precio los tocó, la operación se cierra a
ese precio. Si el precio en vivo los toca antes del cierre, la tarjeta lo
avisa en ese momento.

El panel dice cuándo hay suficiente para decidir: 30 operaciones cerradas de
la candidata (alrededor de un año).

### Cómo está hecho

- `src/vivo/index.ts`: Worker de Cloudflare con el panel (clave `CLAVE_PANEL`),
  `/api/precios` (precios de Binance en el momento) y un Durable Object con
  su propia base SQLite (plan gratis).
- Cada 30 segundos una alarma lee los precios, avisa si alguna operación tocó
  su SL o TP, y si cerró alguna vela la procesa (hasta 3 series por ciclo).
  Un cron cada 10 minutos revisa que la alarma siga puesta.
- `src/vivo/config.ts`: monedas, temporalidades y estrategias que corren.
- `src/binance.ts`: lectura de Binance (la usan el laboratorio y la simulación).

## Publicarlo en Cloudflare

1. En Cloudflare: **Workers & Pages → Create → Import a repository**, elige
   este repositorio y dale **Deploy** (sin comando de build; el de deploy es
   `npx wrangler deploy`).
2. En el Worker: **Settings → Variables and Secrets → Add**, tipo *Secret*,
   nombre `CLAVE_PANEL`, con una palabra larga que solo tú sepas.
3. Abre la dirección `…workers.dev` del Worker y entra con esa clave.

La simulación arranca sola y cada push a `main` la vuelve a publicar sin
borrar lo que lleva. Si se cambia algo de fondo (como la fuente de precios),
`VERSION` en `src/vivo/simulacion.ts` sube y la simulación empieza de cero
sola. "Empezar de cero" en el panel también la reinicia.

## Comandos

```
npm install
npm run laboratorio           # prueba todo (BTC, ETH, SOL) con Binance
LAB_MONEDAS=BTC,ETH,XRP npm run laboratorio   # con otras monedas
LAB_FUENTE=hyperliquid npm run laboratorio    # con precios de Hyperliquid
npm run referencia            # pasa resultados/binance-15-monedas.json al panel
npm run pruebas               # que nada mire el futuro y que vivo = laboratorio
npm run en-vivo -- 30         # repite los últimos 30 días con el ciclo en vivo real
npm run tipos                 # revisa los tipos
```

Desde un computador detrás de un proxy, Node necesita `NODE_USE_ENV_PROXY=1`.

## Cómo se prueba (para confiar en los números)

- La señal se mira al cierre de una vela y se entra a la apertura de la
  siguiente; una prueba verifica que ninguna estrategia use datos del futuro.
- Si una vela toca el stop y el objetivo, cuenta el stop (el peor caso).
- **R** = cuántas veces lo arriesgado se ganó o perdió por operación.
- La probabilidad de suerte compara cada estrategia con miles de grupos de
  entradas al azar con su mismo número de operaciones y las mismas salidas.
- Las reglas son las de libro y no se "afinaron" mirando los resultados:
  probar variaciones hasta que una gane en el pasado fabrica estrategias que
  fallan en vivo.
- Se usan precios del mercado spot de Binance (los de futuros casi no se
  separan, y su servidor está bloqueado en algunos países). Las ventas en
  corto que hace la simulación, en la vida real necesitarían Binance Futuros.

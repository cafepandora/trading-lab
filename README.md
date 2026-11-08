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

## El sistema: elegir estrategias y medirlo a ciegas (`npm run sistema`)

35 estrategias (las 12 de arriba más 23 variantes: tres soldados con otros
filtros y objetivos, tendencia con otros canales y solo compras, cruce de
medias, reversión con RSI y bandas de Bollinger — `src/variantes.ts`), en las
14 monedas: **85.972 predicciones** (operaciones simuladas, cada una con
dirección, stop y objetivo).

Reglas fijadas **antes** de ver resultados:

1. Cada 6 meses, desde enero de 2021, mira solo las operaciones que ya
   habían cerrado.
2. Elige hasta 3 estrategias: las de mejor t (ganancia promedio ÷ su
   error), con al menos 50 operaciones y t ≥ 2.
3. Las opera los 6 meses siguientes, que no vio.
4. "Funciona" solo si, en esa parte a ciegas, gana en promedio, t ≥ 2, le
   gana al azar (probabilidad < 5%) y una cuenta de 500 USD arriesgando 0,5%
   por operación (tope 2x, órdenes ≥ 10 USD) no cae más de 25%.

Resultado a ciegas, enero 2021 → noviembre 2026 (`resultados/sistema.json`):

| | |
|---|---|
| Predicciones a ciegas | 12.298 |
| Aciertos | 33,6% (gana pocas, pero más grandes) |
| Por cada $1 arriesgado | +0,11 (t 6,4; el azar no llega ahí) |
| Cuenta de 500 USD, 0,5% por operación, tope 2x | +19,8% al año, pero **cae hasta 71%** |
| Por año (misma cuenta, continua) | 2021 +354% · 2022 +7% · 2023 −27% · 2024 +91% · 2025 −27% · 2026 −42% |
| Frente a escoger 3 estrategias al azar | mejor que el 87% (no alcanza el 95%) |
| **¿Funciona según las reglas?** | **No**: la caída pasa de 25% |

- Casi siempre eligió **seguir la tendencia** (Donchian 20/10 y cruce de
  medias 20/50). Por operación tiene una ventaja real, pero como cuenta es
  demasiado brusca: llega a tener decenas de posiciones abiertas en monedas
  que caen todas juntas.
- Lo que más baja el riesgo es el **tope de todo lo abierto junto**
  (`LAB_TOPE`), no el riesgo por operación: con tope 1x cae hasta 48%; con
  tope 0,5x, +23,8% al año y cae hasta 24,5% (2021 +145% · 2022 +23% ·
  2023 −3% · 2024 +11% · 2025 +8% · 2026 0%). Pero ese tope se eligió
  después de ver los resultados: no es una prueba a ciegas, y casi toda la
  ganancia es de 2021 (de 2022 en adelante, unos 7% al año).
- Cambiar las reglas ahora para que el pasado salga bien ya no sería una
  prueba a ciegas. La única prueba a ciegas que queda es el futuro: la
  simulación en vivo.

> Corrección: una primera versión de esta cuenta procesaba la salida de una
> operación antes que su entrada cuando las dos caían en la misma vela, y
> esas posiciones quedaban abiertas para siempre. Los números de arriba ya
> están corregidos (antes decía +29,8% al año y caída de 54%).

## ¿Y si se hacen muchas operaciones cortas? (`npm run corto-plazo`)

Las mismas estrategias en velas de 5 minutos, 15 minutos, 1 hora y 4 horas
(BTC, ETH, SOL, XRP, DOGE, BNB), con dos escenarios: órdenes a mercado, y el
mejor caso imposible de órdenes límite que siempre se llenan (comisión
0,02%). Detalle en `resultados/corto-plazo.json`.

| Velas | Lo que cuestan comisión y deslizamiento por operación | Entrar al azar | Lo mejor que salió (a mercado) |
|---|---|---|---|
| 5 min | 0,33 a 1,06 R | −0,67 R | Todas pierden; la cuenta se queda en cero en menos de un año |
| 15 min | 0,19 a 0,61 R | −0,35 R | Todas pierden (−33% a −89% al año) |
| 1 hora | 0,08 a 0,31 R | −0,19 R | Cruce de medias, +0,07 R, sin confianza (t 1,1; negativa en lo reciente) |
| 4 horas | 0,03 a 0,15 R | −0,07 R | Tres soldados +0,27 R (cae 3%) · cruce de medias +0,20 R, +14% al año (cae 15%) |

Mientras más corta la vela, más se comen los costos: en 5 minutos cada
operación paga en costos entre un tercio y un R completo, antes de ganar
nada. Y ni siquiera con órdenes límite perfectas aparece una ventaja en
velas de 5 o 15 minutos.

**Bot de grilla** (compra en cada bajón y vende en cada subida dentro de un
rango, como el de Binance; velas de 15 minutos, últimos 2 años, se rearma
cada 30 días): hace miles de "vueltas" ganadoras, pero cuando el precio se
sale del rango por abajo queda con monedas compradas más caras, y eso se come
todo. BTC: entre −7% y +2% al año (guardar BTC: +5%); ETH y SOL: entre −4% y
−40% al año, con caídas de 45% a 69%.

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
npm run sistema               # 35 estrategias + prueba a ciegas (resultados/sistema.json)
LAB_TOPE=0.5 npm run sistema  # lo mismo con otro tope de exposición total (solo para comparar)
npm run corto-plazo           # velas de 5 min a 4 h y bot de grilla (resultados/corto-plazo.json)
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

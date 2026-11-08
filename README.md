# Laboratorio de trading

Tres partes, con precios de **Binance**:

1. **El laboratorio** (`npm run laboratorio`): prueba estrategias de análisis
   técnico con la historia de precios de Binance (desde 2017), con costos
   reales, y las compara con comprar y guardar y con entrar al azar.
2. **Las simulaciones en vivo** (Cloudflare, sin dinero real): 38 cuentas en
   papel operan vela por vela a medida que el mercado avanza: las 35
   estrategias, una copia exacta del bot real, la copia de un trader que
   lleva casi 2 años ganando y Bitcoin guardado. El panel muestra cada
   operación abierta con su **stop (SL)**, su **objetivo (TP)** y el **precio
   en vivo**, y se recarga cada 30 segundos.
3. **El bot con dinero real** (Binance spot, 50 USD): **arranca apagado**. Solo
   opera si pones tus llaves de Binance en Cloudflare y lo activas tú desde el
   panel escribiendo ACTIVAR. Ver "El bot con dinero real" más abajo.

Las partes 1 y 2 no tienen llaves ni tocan ninguna cuenta: solo leen datos
públicos de mercado de Binance (`data-api.binance.vision`, spot en USDT) y de
Hyperliquid (posiciones públicas de los traders que se copian en papel).

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

## Scalping, day trading y swing, con las reglas del bot (`npm run estilos`)

Cada estilo con sus velas y sus estrategias típicas, **solo compras** y con lo
que cobra Binance spot (0,1% por orden más deslizamiento), en la cuenta del
bot (50 USD, 0,5% de riesgo, órdenes de al menos 5 USD). Último año
(noviembre 2025 → noviembre 2026), el único con datos de los tres estilos
(`resultados/estilos.json`):

| Estilo | Velas | Cuánto dura cada operación | Combinaciones que ganan | Por cada $1 arriesgado | Lo que se comen los costos por operación | La cuenta |
|---|---|---|---|---|---|---|
| Scalping | 5 min | menos de 1 hora | 0 de 7 | −1,00 | 0,91 | se queda sin plata para operar (−90%) en todas |
| Day trading | 15 min y 1 hora | menos de 1 día | 0 de 12 | −0,37 | 0,33 | de −1% a −89% |
| Swing trading | 4 horas y diarias | días o semanas | 5 de 16 | 0,00 | 0,06 | de −2% a +9% |

Las operaciones cortas mueven tan poco el precio que la comisión se come casi
todo lo que arriesgan. Y la ventaja de fondo es cero: repitiendo lo mismo sin
ninguna comisión ni deslizamiento, scalping da +0,005 por cada $1 arriesgado
y day trading +0,003, o sea nada. Lo único que hacen es pagar comisiones.

**Trading algorítmico** es todo lo de este repositorio. La fórmula
algorítmica que elige sola entre los tres estilos: cada 3 meses mira solo lo
que ya pasó, elige hasta 3 combinaciones con t ≥ 2 y al menos 30
operaciones, y las opera los 3 meses siguientes, que no vio. De enero de 2024
a hoy, a ciegas, eligió swing las 36 veces (scalping y day trading nunca
pasaron los filtros): 50 USD → 73 USD (+47%), cayendo hasta 42%. El bot de hoy
(swing, cruce 20/50 en 4 horas), en el mismo período: 50 → 90 USD (+80%),
también con caídas de hasta 42%. Por eso el bot sigue siendo de swing; si
algún día un estilo corto empieza a pasar los filtros, `npm run estilos` lo
mostrará.

## ¿Y con el Nasdaq 100 o el S&P 500? (`npm run indices`)

Las mismas estrategias de swing, solo compras, en velas diarias de QQQ
(Nasdaq 100, desde 1999) y SPY (S&P 500, desde 1993), con dividendos y con
costos de un bróker internacional (0,05% por orden). "Todo o nada": cuando la
estrategia compra, todo está en el ETF; si no, en efectivo. Precios de Yahoo
Finance (`resultados/indices.json`).

| Desde 2010 | Al año | Peor caída |
|---|---|---|
| QQQ comprar y guardar | +18,0% | 35% |
| QQQ con la mejor estrategia (cruce 20/50) | +8,7% | 23% |
| SPY comprar y guardar | +13,7% | 34% |
| SPY con la mejor estrategia (Donchian 20/10) | +5,8% | 9% |

En los índices **ninguna estrategia le gana a comprar y guardar**: lo que
pagan es la subida de largo plazo, no la volatilidad, y cada vez que una
estrategia sale del mercado se pierde días buenos. Las estrategias sí caen
menos.

La otra forma de sacarle más es el **apalancamiento** (ETFs 2x y 3x, como
SSO/UPRO o QLD/TQQQ), simulado día a día con la historia de los índices y
sus costos:

| | Al año desde 2010 | Al año desde 2021 | Peor caída desde 2000 |
|---|---|---|---|
| S&P 500 1x / 2x / 3x | +13,5% / +22,5% / +28,3% | +14,3% / +24,6% / +32,1% | 56% / 86% / 98% |
| Nasdaq 100 1x / 2x / 3x | +16,9% / +28,2% / +34,4% | +13,6% / +20,1% / +20,6% | 83% / 99% / 100% |

Desde 2010 el apalancado gana muchísimo, pero quien lo compró en 2000 lo vio
caer 86% a 100%: un 3x del Nasdaq comprado en 2000 hoy valdría 0,3 veces lo
que se puso, 26 años después.

## Las simulaciones en vivo

38 cuentas virtuales, cada una con su propia plata, operando a la vez:

- **Igual que el bot real** (`espejo-real`): la misma estrategia, las mismas
  reglas y los mismos 50 USD que el bot con dinero real. Sirve para comparar
  lo real con lo simulado: si el bot real va peor que esta, el problema está
  en la ejecución (comisiones, redondeos, órdenes que no se llenan), no en la
  estrategia.
- **Las 35 estrategias** del laboratorio, con 500 USD cada una, en las 14
  monedas, velas de 4 horas y diarias.
- **La copia de un trader que lleva años ganando** (ver abajo), con 500 USD.
- **Bitcoin comprado el primer día y guardado**, como referencia.

Usan exactamente las mismas reglas que el laboratorio (`src/posicion.ts`): las
pruebas comprueban que, procesando las velas de a poco, dan las mismas
operaciones que la prueba con datos pasados. Arriesgan el 1% de lo que vale la
cuenta por operación, nunca pasan de 2x entre todas las posiciones, saltan
órdenes de menos de 10 USD y cobran comisión, deslizamiento y funding.

**El panel**, que se recarga cada 30 segundos:

- Arriba, el estado del **bot con dinero real** (apagado, sin llaves o
  activo, con lo que tiene abierto y su stop).
- La tabla de las 38 simulaciones ordenadas por resultado; tocando una se ve
  su detalle y su historia de operaciones.
- **Operaciones abiertas** de la simulación que elijas: cada una con precio de
  entrada, **stop (SL)**, **objetivo (TP)**, **precio en vivo**, a qué
  distancia está de cada uno y cuánto va ganando o perdiendo.
- **Precios en vivo** de las 14 monedas en Binance y la gráfica.

El SL y el TP se revisan con el máximo y el mínimo de cada vela cuando cierra
(igual que en el laboratorio). Las estrategias que salen con una señal en vez
de un objetivo fijo dicen "sin fijo (sale con la señal)".

El panel dice cuándo hay suficiente para decidir: 30 operaciones cerradas.

### Copias de traders (`npm run traders`)

Busca en el ranking público de Hyperliquid cuentas que lleven **años**
ganando, no solo un buen mes. Filtros, fijados antes de mirar:

- al menos 1,75 años de historia (Hyperliquid solo guarda historia desde
  finales de 2024: **nadie puede mostrar más de ~1,9 años**);
- ganó en al menos el 70% de los trimestres y nunca cayó más de 40%;
- sigue activo en el mercado principal, no es un bot (menos de 2.000 órdenes
  al mes), cuenta de al menos 10.000 USD y no usa más de 10x.

De 160 cuentas revisadas (el 8 de noviembre de 2026), **solo una pasó**: casi
1,9 años, 88% de trimestres en verde, caída máxima 29%, opera sobre todo HYPE,
ZEC, TRUMP y WLFI (`src/vivo/traders.json`). La copia en papel sigue sus
posiciones en proporción a 500 USD, con tope de 2x, pausa si pierde 5% en un
día y se detiene si cae 30%. Ojo: entre decenas de miles de cuentas, algunas
se ven así por pura suerte; y lo que hizo en 2 años no garantiza lo que hará.

La copia es una **guía en papel**, no un respaldo: el bot real **no** pasa a
copiar al trader ni sube el riesgo cuando va perdiendo. Subir el riesgo para
recuperar lo perdido es la forma más común de vaciar una cuenta.

### Cómo está hecho

- `src/vivo/index.ts`: Worker de Cloudflare con el panel (clave `CLAVE_PANEL`),
  `/api/precios` (precios de Binance en el momento), `/api/real/*` (el bot
  real) y dos Durable Objects con su propia base SQLite (plan gratis).
- Las simulaciones: cada 30 segundos una alarma lee los precios, avisa si
  alguna operación tocó su SL o TP, procesa hasta 2 velas cerradas por ciclo,
  lee las posiciones de los traders copiados y guarda solo si algo cambió (o
  cada 10 minutos), para no gastar escrituras.
- Un cron cada 10 minutos revisa que las dos alarmas sigan puestas.
- `src/vivo/config.ts`: monedas, simulaciones y las reglas del bot real.
- `src/vivo/copia/`: el motor de las copias de traders (`pruebas/copia.test.mjs`).
- `src/vivo/real/`: el bot con dinero real (`pruebas/bot.test.mjs`).
- `src/binance.ts`: lectura pública de Binance.

## El bot con dinero real

**Arranca apagado.** No hace nada hasta que pones las llaves y lo activas.

Reglas (`BOT_REAL` en `src/vivo/config.ts`):

- **Estrategia**: cruce de medias 20/50 en velas de 4 horas, **solo compras**
  (spot, sin apalancamiento ni ventas en corto), en las 14 monedas. En el
  laboratorio, en 4 horas, fue de lo poco que ganó después de costos; pero
  repitiendo el último mes con el ciclo real perdió entre 6% y 7%. **Puede
  perder.**
- **Plata**: usa solo 50 USD, llevados en su propia caja. Nunca vende monedas
  que no compró él (lo que ya tengas en la cuenta no lo toca).
- **Riesgo**: 0,5% de lo que vale (unos 0,25 USD) por operación; entre todo lo
  abierto, nunca más de lo que tiene. Con 50 USD, Binance no deja órdenes de
  menos de 5 USD, así que al principio solo toma las señales con el stop
  cerca (a menos de ~4,6%); a medida que la cuenta crece, toma más. Por qué
  0,5% y no más: ver "¿Qué tan seguido gana el bot?".
- **Stop en Binance**: cada compra deja puesta una orden de stop en Binance,
  así protege aunque el bot se caiga. Sale cuando toca el stop o cuando la
  señal se da vuelta.
- **Freno**: si lo que vale baja de 20 USD (perder el 60% de los 50), vende
  todo y se apaga solo.
- **Detener**: el botón del panel vende todo y lo apaga en el momento.
- Cada compra lleva un número único: si se cae justo después de comprar, al
  volver encuentra la orden y no compra dos veces.

### ¿Qué tan seguido gana el bot? (`npm run probabilidades`)

Repite las reglas exactas del bot (incluida la orden mínima de Binance y el
freno) prendiéndolo con 50 USD **cada semana** desde 2018, y mira cómo
termina. Lo hace con varios tamaños de riesgo por operación
(`resultados/probabilidades.json`). Arrancando cualquier semana desde 2021:

| Riesgo por operación | Gana a 12 meses | Típico a 12 meses | Gana a 24 meses | Típico a 24 meses | Peor caída de una cuenta desde 2021 |
|---|---|---|---|---|---|
| **0,5% (el del bot)** | **76%** | **+13,5%** | **98%** | **+71,8%** | **50%** |
| 0,75% | 56% | +21,9% | 88% | +36,8% | 64% |
| 1% | 53% | +4,9% | 56% | +6,5% | 69% |
| 2% | 32% | −24,4% | 34% | −29,5% | 87% |
| 3% | 27% | −23,0% | 33% | −36,9% | 90% |

**Arriesgar más no multiplica más**: las 14 monedas suben y bajan juntas, y
con posiciones grandes una mala racha abre un hueco que tarda años en
llenarse. Desde 2021, 0,5% fue el que más creció en 2 años y casi nunca
terminó en rojo, y su peor caída (52% desde 2018) cabe en el freno de 60%.
0,75% gana más en los años muy buenos (2020–2021), pero cae hasta 64%. Con
0,25% casi no opera: con 50 USD sus órdenes quedan bajo el mínimo de Binance.

Con 0,5%, año por año (cuenta nueva cada 1 de enero): 2018 −5% · 2019 +18% ·
2020 +172% · 2021 −3% · 2022 +2% · 2023 +43% · 2024 +116% · 2025 −1% ·
2026 +11%. Al principio casi siempre se ve plano o un poco en rojo: a 3
meses gana menos de la mitad de las veces.

Ojo: la estrategia y el tamaño se eligieron mirando estos mismos datos, así
que lo que venga probablemente sea peor. La prueba limpia es la simulación
"Igual que el bot real" del panel.

### Cómo activarlo

1. En Binance: **Perfil → Gestión de API → Crear API**. Permisos: solo
   **Habilitar trading spot y de margen** (deja **apagado** el de retiros) y,
   si puedes, restríngela a una IP. Esa llave no puede sacar plata de la
   cuenta.
2. En Cloudflare, en el Worker: **Settings → Variables and Secrets → Add**,
   tipo *Secret*: `BINANCE_API_KEY` y `BINANCE_API_SECRET`. **Nunca las pegues
   en un chat, un correo ni en este repositorio.**
3. Pasa 50 USDT a tu billetera **Spot** de Binance.
4. En el panel: **Probar conexión** (revisa la firma y el saldo sin operar) y
   después **Activar** (pide escribir ACTIVAR). Empieza en la siguiente vela de
   4 horas.

El bot corre en su propio Durable Object, creado en Sudamérica, porque Binance
bloquea servidores de algunos países (Estados Unidos, entre otros). Si "Probar
conexión" responde un error 451 o de región, es eso.

## Publicarlo en Cloudflare

1. En Cloudflare: **Workers & Pages → Create → Import a repository**, elige
   este repositorio y dale **Deploy** (sin comando de build; el de deploy es
   `npx wrangler deploy`).
2. En el Worker: **Settings → Variables and Secrets → Add**, tipo *Secret*,
   nombre `CLAVE_PANEL`, con una palabra larga que solo tú sepas.
3. Abre la dirección `…workers.dev` del Worker y entra con esa clave.

Las simulaciones arrancan solas y cada push a `main` las vuelve a publicar sin
borrar lo que llevan (el bot real tampoco pierde su estado). Si se cambia algo de fondo (como la fuente de precios),
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
npm run traders               # busca traders que lleven años ganando (src/vivo/traders.json)
npm run probabilidades        # qué tan seguido gana el bot y con qué riesgo (resultados/probabilidades.json)
npm run estilos               # scalping, day trading, swing y la fórmula que elige entre ellos (resultados/estilos.json)
npm run indices               # las estrategias en el Nasdaq 100 y el S&P 500, y apalancados 2x/3x (resultados/indices.json)
npm run pruebas               # que nada mire el futuro, vivo = laboratorio, copias y bot real
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
  corto que hace la simulación, en la vida real necesitarían Binance Futuros;
  por eso el bot real solo compra.
- El bot real se prueba contra un Binance falso (`pruebas/binance-falso.mjs`)
  que verifica las firmas, ejecuta las órdenes y dispara los stops: compra y
  stop redondeados a las reglas de Binance, stop ejecutado, salida por señal,
  que no venda lo tuyo, el freno de 20 USD, recuperarse si se cae a mitad de
  una compra, "detener" y una llave mala.

# Laboratorio de trading

Dos partes, sin dinero real:

1. **El laboratorio** (`npm run laboratorio`): prueba estrategias de análisis
   técnico con precios reales de Hyperliquid de los últimos años, con costos
   reales, y las compara con comprar y guardar y con entrar al azar.
2. **La simulación en vivo** (Cloudflare): opera en papel las estrategias
   elegidas, vela por vela, a medida que el mercado avanza, y lo muestra en un
   panel con clave.

Nada de esto opera, tiene llaves ni toca una cuenta: solo lee datos públicos.

## Qué encontró el laboratorio

15 monedas (BTC, ETH, SOL, XRP, DOGE, BNB, AVAX, LINK, LTC, ADA, SUI, AAVE,
DOT, NEAR, HYPE), velas de 4 horas desde 2024 y diarias desde 2021. Cada
operación arriesga el 1% de la cuenta. Detalle en `resultados/15-monedas.json`.

| Estrategia | Operaciones | Por cada $1 arriesgado | ¿El azar haría igual o mejor? |
|---|---|---|---|
| Velas: tres soldados / tres cuervos | 83 | +0,26 | 1,9% |
| Triple techo / triple suelo | 81 | +0,09 | 15% |
| Seguir la tendencia (Donchian 55/20) | 1.492 | +0,07 | 0,1% |
| Elliott: corrección tras 5 ondas | 251 | +0,03 | 19% |
| Hombro-cabeza-hombro | 274 | −0,04 | 44% |
| Velas: estrella de la mañana / tarde | 1.029 | −0,05 | 49% |
| Elliott: entrar en la onda 3 | 921 | −0,05 | 54% |
| Velas: envolvente | 4.763 | −0,06 | 72% |
| Fibonacci 50–61,8% | 1.665 | −0,08 | 84% |
| Fibonacci 61,8–78,6% | 1.529 | −0,11 | 96% |
| Todo junto: Fibonacci + vela + tendencia | 874 | −0,13 | 96% |
| Velas: martillo / estrella fugaz | 1.515 | −0,15 | 99,9% |

- Solo **tres soldados / tres cuervos** queda por debajo del 5% de
  probabilidad de suerte, y es positiva en la parte vieja y en la nueva de los
  datos. Pero son pocas operaciones (unas 20 al año con estas monedas) y casi
  la mitad de la ganancia en las monedas nuevas viene de una sola serie
  (SUI a 4 horas). Es una candidata, no una certeza.
- **Seguir la tendencia** le gana al azar pero apenas da algo por encima de
  cero, y en la parte más reciente de los datos no gana.
- Fibonacci, Elliott (onda 3), la mayoría de las velas y la combinación de
  todo **pierden plata** después de costos.

## La simulación en vivo

Cuatro cuentas de 500 USD virtuales, cada una con una estrategia, operando
las 15 monedas a la vez (velas de 4 horas y diarias):

- **Tres soldados / tres cuervos**, la candidata;
- triple techo / triple suelo, seguir la tendencia y "todo junto", para comparar;
- más una referencia: **Bitcoin comprado el primer día y guardado**.

Usa exactamente las mismas reglas que el laboratorio (`src/posicion.ts`): las
pruebas comprueban que, procesando las velas de a poco, da las mismas
operaciones que la prueba con datos pasados. Arriesga el 1% de lo que vale la
cuenta por operación, nunca pasa de 2x entre todas las posiciones, salta
órdenes de menos de 10 USD (mínimo de Hyperliquid) y cobra comisión,
deslizamiento y funding.

El panel dice cuándo hay suficiente para decidir: 30 operaciones cerradas de
la candidata. Como opera poco, eso puede tardar más de un año.

### Cómo está hecho

- `src/vivo/index.ts`: Worker de Cloudflare con el panel (clave `CLAVE_PANEL`)
  y un Durable Object con su propia base SQLite (plan gratis).
- Cada minuto una alarma revisa si cerró alguna vela y procesa hasta 3 series
  por ciclo; un cron cada 10 minutos revisa que la alarma siga puesta.
- `src/vivo/config.ts`: monedas, temporalidades y estrategias que corren.

## Publicarlo en Cloudflare

1. En Cloudflare: **Workers & Pages → Create → Import a repository**, elige
   este repositorio y dale **Deploy** (sin comando de build; el de deploy es
   `npx wrangler deploy`).
2. En el Worker: **Settings → Variables and Secrets → Add**, tipo *Secret*,
   nombre `CLAVE_PANEL`, con una palabra larga que solo tú sepas.
3. Abre la dirección `…workers.dev` del Worker y entra con esa clave.

La simulación arranca sola y cada push a `main` la vuelve a publicar sin
borrar lo que lleva. "Empezar de cero" en el panel la reinicia (hace falta si
se cambian las estrategias o las monedas en `src/vivo/config.ts`).

## Comandos

```
npm install
npm run laboratorio           # prueba todo (BTC, ETH, SOL); guarda resultados.json
LAB_MONEDAS=BTC,ETH,XRP npm run laboratorio   # con otras monedas
npm run referencia            # pasa resultados/15-monedas.json al panel
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

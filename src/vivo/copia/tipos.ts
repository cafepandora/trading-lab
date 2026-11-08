// Tipos y parámetros de la simulación. Todo en dólares (USDC) salvo `tam`,
// que es la cantidad de la moneda (positiva = compra / "long", negativa =
// venta en corto / "short").

export interface Parametros {
  /** Plata virtual con la que arranca CADA copia. */
  capitalInicial: number;
  /** Tope de apalancamiento de la copia (posiciones abiertas ÷ lo que vale la cuenta). */
  apalancamientoMax: number;
  /** Si en el día (hora Colombia) la copia pierde más que esto, se cierra todo hasta mañana. */
  perdidaMaxDia: number;
  /** Si la copia cae más que esto desde el capital inicial, se detiene para siempre. */
  caidaMaxTotal: number;
  /** Hyperliquid no acepta órdenes de menos de 10 USD. */
  ordenMinima: number;
  /** Comisión de Hyperliquid por orden a mercado (nivel base). */
  comisionTaker: number;
  /** Deslizamiento (precio peor que el del medio) en monedas con mucho volumen… */
  deslizMayor: number;
  /** …y en las demás. */
  deslizMenor: number;
  /** Volumen diario (USD) desde el que una moneda cuenta como "con mucho volumen". */
  volumenMayor: number;
  /** Cambio relativo en la posición del trader que hace que la copia también opere. */
  umbralCambio: number;
  /** Días que dura la prueba antes de decidir. */
  diasPrueba: number;
}

export const PARAMETROS: Parametros = {
  capitalInicial: 500,
  apalancamientoMax: 2,
  perdidaMaxDia: 0.05,
  caidaMaxTotal: 0.3,
  ordenMinima: 10,
  comisionTaker: 0.00045,
  deslizMayor: 0.0005,
  deslizMenor: 0.002,
  volumenMayor: 100_000_000,
  umbralCambio: 0.02,
  diasPrueba: 90,
};

export interface Posicion {
  tam: number;
  entrada: number;
}

export type EstadoCuenta = 'activa' | 'pausada' | 'detenida';

export interface Cuenta {
  id: string;
  /** Billetera que se copia; null en la cuenta de referencia (solo Bitcoin). */
  direccion: string | null;
  tipo: 'copia' | 'referencia';
  efectivo: number;
  posiciones: Record<string, Posicion>;
  /** Última posición del trader que la copia ya siguió, por moneda. */
  vistoTrader: Record<string, number>;
  estado: EstadoCuenta;
  motivoEstado: string | null;
  inicioDia: { dia: string; valor: number };
  pico: number;
  caidaMax: number;
  comisiones: number;
  funding: number;
  deslizamiento: number;
  operaciones: number;
  omitidas: number;
  /** Valor de la cuenta en el último ciclo (para el panel). */
  valor: number;
  ultimaActualizacion: number;
  /** Ganancia acumulada del trader (futuros) al empezar y ahora, para comparar. */
  traderInicial: ResumenTrader | null;
  traderActual: ResumenTrader | null;
  /** Apalancamiento del trader en el último ciclo. */
  apalancamientoTrader: number;
  errores: number;
  ultimoError: string | null;
}

export interface ResumenTrader {
  t: number;
  pnl: number;
  valor: number;
}

export interface ContextoMoneda {
  funding: number;
  volumenDia: number;
  oraculo: number;
  maxApal: number;
}

export interface Mercado {
  t: number;
  precios: Record<string, number>;
  contextos: Record<string, ContextoMoneda>;
}

export interface EstadoTrader {
  t: number;
  valorCuenta: number;
  /** Tamaño con signo por moneda (solo las que tiene abiertas). */
  posiciones: Record<string, number>;
}

export interface Operacion {
  t: number;
  cuenta: string;
  moneda: string;
  lado: 'compra' | 'venta';
  tam: number;
  precio: number;
  nocional: number;
  comision: number;
  pnl: number;
  motivo: string;
}

export interface Evento {
  t: number;
  cuenta: string;
  texto: string;
}

export interface Billetera {
  etiqueta: string;
  direccion: string;
  alElegir?: Record<string, unknown>;
}

// Indicadores básicos. Regla de oro: el valor en la vela i solo usa velas
// hasta la i (nada del futuro), para que la prueba no haga trampa.

export interface Vela {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

export function ema(valores: number[], n: number): number[] {
  const k = 2 / (n + 1);
  const out: number[] = [];
  valores.forEach((v, i) => out.push(i === 0 ? v : v * k + out[i - 1] * (1 - k)));
  return out;
}

/** Rango verdadero promedio (Wilder, 14): cuánto se mueve el precio por vela. */
export function atr(velas: Vela[], n = 14): number[] {
  const out: number[] = [];
  velas.forEach((v, i) => {
    const prev = i ? velas[i - 1].c : v.o;
    const tr = Math.max(v.h - v.l, Math.abs(v.h - prev), Math.abs(v.l - prev));
    out.push(i === 0 ? tr : (out[i - 1] * (n - 1) + tr) / n);
  });
  return out;
}

export interface Pivote {
  /** Vela donde está el pico o el valle. */
  i: number;
  precio: number;
  tipo: 'alto' | 'bajo';
  /** Vela en la que se supo que era un pico/valle (el precio ya se alejó). */
  confirmado: number;
}

/**
 * Zigzag: picos y valles que importan. Un pico queda confirmado solo cuando
 * el precio ya bajó `k` veces el ATR desde ahí (y al revés para un valle);
 * antes de eso no se sabe, y las estrategias no lo pueden usar.
 */
export function zigzag(velas: Vela[], rangos: number[], k: number): Pivote[] {
  const piv: Pivote[] = [];
  let estado: 'sube' | 'baja' | null = null;
  let iMax = 0;
  let iMin = 0;
  for (let j = 1; j < velas.length; j++) {
    const umbral = k * rangos[j];
    if (estado !== 'baja' && velas[j].h >= velas[iMax].h) iMax = j;
    if (estado !== 'sube' && velas[j].l <= velas[iMin].l) iMin = j;
    if (estado !== 'baja' && velas[iMax].h - velas[j].l >= umbral && j > iMax) {
      if (estado === null && iMin < iMax) piv.push({ i: iMin, precio: velas[iMin].l, tipo: 'bajo', confirmado: j });
      piv.push({ i: iMax, precio: velas[iMax].h, tipo: 'alto', confirmado: j });
      estado = 'baja';
      iMin = j;
    } else if (estado !== 'sube' && velas[j].h - velas[iMin].l >= umbral && j > iMin) {
      if (estado === null && iMax < iMin) piv.push({ i: iMax, precio: velas[iMax].h, tipo: 'alto', confirmado: j });
      piv.push({ i: iMin, precio: velas[iMin].l, tipo: 'bajo', confirmado: j });
      estado = 'sube';
      iMax = j;
    }
  }
  return piv;
}

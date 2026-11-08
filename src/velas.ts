// Patrones de velas japonesas, con las definiciones de libro.
// Cada función mira la vela i (y las anteriores) y dice 1 (alcista),
// -1 (bajista) o 0 (no hay patrón).

import type { Vela } from './indicadores';

const cuerpo = (v: Vela) => Math.abs(v.c - v.o);
const rango = (v: Vela) => v.h - v.l || 1e-12;
const sombraArriba = (v: Vela) => v.h - Math.max(v.o, v.c);
const sombraAbajo = (v: Vela) => Math.min(v.o, v.c) - v.l;
const verde = (v: Vela) => v.c > v.o;
const roja = (v: Vela) => v.c < v.o;

/** Envolvente: el cuerpo de hoy tapa por completo el de ayer, en sentido contrario. */
export function envolvente(vs: Vela[], i: number): number {
  if (i < 1) return 0;
  const a = vs[i - 1], b = vs[i];
  if (cuerpo(b) < cuerpo(a) || cuerpo(b) < 0.3 * rango(b)) return 0;
  if (roja(a) && verde(b) && b.o <= a.c && b.c >= a.o) return 1;
  if (verde(a) && roja(b) && b.o >= a.c && b.c <= a.o) return -1;
  return 0;
}

/**
 * Martillo (alcista): sombra de abajo de al menos 2 veces el cuerpo, casi
 * sin sombra arriba, y en el punto más bajo de las últimas 5 velas.
 * Estrella fugaz (bajista): lo mismo al revés.
 */
export function martilloOEstrellaFugaz(vs: Vela[], i: number): number {
  if (i < 5) return 0;
  const v = vs[i];
  const cu = Math.max(cuerpo(v), 0.05 * rango(v));
  const previas = vs.slice(i - 4, i);
  if (sombraAbajo(v) >= 2 * cu && sombraArriba(v) <= cu && previas.every((p) => p.l >= v.l)) return 1;
  if (sombraArriba(v) >= 2 * cu && sombraAbajo(v) <= cu && previas.every((p) => p.h <= v.h)) return -1;
  return 0;
}

/**
 * Estrella de la mañana (alcista): vela roja grande, una vela pequeña de duda,
 * y una verde que cierra por encima de la mitad de la roja.
 * Estrella de la tarde (bajista): al revés.
 */
export function estrella(vs: Vela[], i: number, atrI: number): number {
  if (i < 2) return 0;
  const a = vs[i - 2], b = vs[i - 1], c = vs[i];
  if (cuerpo(a) < 0.6 * atrI || cuerpo(b) > 0.35 * cuerpo(a) || cuerpo(c) < 0.3 * atrI) return 0;
  const mitad = (a.o + a.c) / 2;
  if (roja(a) && verde(c) && c.c > mitad && Math.max(b.o, b.c) <= a.o) return 1;
  if (verde(a) && roja(c) && c.c < mitad && Math.min(b.o, b.c) >= a.o) return -1;
  return 0;
}

/** Tres soldados blancos (alcista) / tres cuervos negros (bajista). */
export function tresSoldadosOCuervos(vs: Vela[], i: number, atrI: number): number {
  if (i < 2) return 0;
  const tres = [vs[i - 2], vs[i - 1], vs[i]];
  const fuertes = tres.every((v) => cuerpo(v) >= 0.4 * atrI);
  if (!fuertes) return 0;
  const subida = tres.every((v, k) => verde(v) && sombraArriba(v) <= 0.35 * cuerpo(v)
    && (k === 0 || (v.c > tres[k - 1].c && v.o >= tres[k - 1].o && v.o <= tres[k - 1].c)));
  if (subida) return 1;
  const bajada = tres.every((v, k) => roja(v) && sombraAbajo(v) <= 0.35 * cuerpo(v)
    && (k === 0 || (v.c < tres[k - 1].c && v.o <= tres[k - 1].o && v.o >= tres[k - 1].c)));
  return bajada ? -1 : 0;
}

/** Cualquier patrón de giro de los de arriba (para combinar con Fibonacci). */
export function patronDeGiro(vs: Vela[], i: number, atrI: number): number {
  return envolvente(vs, i) || martilloOEstrellaFugaz(vs, i) || estrella(vs, i, atrI);
}

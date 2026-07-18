import { DISCRIMINATION_RATE_STEPS } from '../types/models.js';

export type RateLadderAdvanceResult =
  | { kind: 'advance'; rate: number; index: number }
  | { kind: 'finished'; rate: number };

/**
 * Build mirrored rate sequence: [a,b,c] → [a,b,c,b,a]; single rate stays [a].
 */
export function buildLadderSequence(rates: number[]): number[] {
  if (rates.length === 0) return [1];
  if (rates.length === 1) return [rates[0]];
  const forward = [...rates];
  const backward = rates.slice(0, -1).reverse();
  return [...forward, ...backward];
}

export function snapDiscriminationRate(value: number): number {
  const steps: readonly number[] = DISCRIMINATION_RATE_STEPS;
  let best = steps[0];
  let bestDist = Math.abs(value - best);
  for (const step of steps) {
    const dist = Math.abs(value - step);
    if (dist < bestDist) {
      best = step;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Stateful ladder: each main-track `ended` advances to the next rate.
 * After the last step, reports finished and resets index to 0 for the next session.
 */
export class RateLadder {
  private sequence: number[] = [1];
  private index = 0;

  constructor(rates: number[] = [1]) {
    this.setRates(rates);
  }

  setRates(rates: number[]): void {
    this.sequence = buildLadderSequence(rates.map(snapDiscriminationRate));
    this.index = Math.min(this.index, Math.max(0, this.sequence.length - 1));
  }

  reset(): void {
    this.index = 0;
  }

  getIndex(): number {
    return this.index;
  }

  getCurrentRate(): number {
    return this.sequence[this.index] ?? 1;
  }

  getSequence(): readonly number[] {
    return this.sequence;
  }

  /** Call when the main track ends. */
  onMainEnded(): RateLadderAdvanceResult {
    if (this.index >= this.sequence.length - 1) {
      const rate = this.getCurrentRate();
      this.index = 0;
      return { kind: 'finished', rate };
    }
    this.index += 1;
    return { kind: 'advance', rate: this.getCurrentRate(), index: this.index };
  }
}

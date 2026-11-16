// "One Euro" filter: smooths jittery input without making it feel laggy.
//   - hand nearly still  -> heavy smoothing (the dot stops shaking)
//   - hand moving fast   -> light smoothing (the dot keeps up)
// Reference: Casiez, Roussel, Vogel, "1 Euro Filter" (CHI 2012).

const alpha = (cutoffHz, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoffHz) / dt);

export class OneEuroFilter {
  /**
   * minCutoff: smoothing when still (lower = steadier, but laggier)
   * beta:      how quickly smoothing relaxes as speed rises (higher = less lag when moving)
   * dCutoff:   smoothing applied to the speed estimate itself
   */
  constructor({ minCutoff = 1, beta = 0, dCutoff = 1 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }

  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = 0;
  }

  /** x: new value, tMs: its timestamp in milliseconds. Returns the smoothed value. */
  filter(x, tMs) {
    if (this.xPrev === null) {
      this.xPrev = x;
      this.tPrev = tMs;
      return x;
    }
    const dt = Math.max(1e-3, (tMs - this.tPrev) / 1000);
    const dx = (x - this.xPrev) / dt;
    const aD = alpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = alpha(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat;
    this.dxPrev = dxHat;
    this.tPrev = tMs;
    return xHat;
  }
}

/**
 * Settings chosen by measurement for a fingertip pointer: shake drops ~70-80%
 * while the added delay is ~26 ms (imperceptible) and quick flicks are not slowed.
 */
export const POINTER_FILTER = { minCutoff: 0.6, beta: 6, dCutoff: 1 };

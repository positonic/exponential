import { describe, expect, it } from 'vitest';

import {
  MIN_FILL_MS,
  fillDurationMs,
  isTooFastSubmission,
} from '../timeTrap';

describe('timeTrap', () => {
  describe('fillDurationMs', () => {
    it('passes through a valid non-negative number', () => {
      expect(fillDurationMs(4200)).toBe(4200);
      expect(fillDurationMs(0)).toBe(0);
    });

    it('coerces missing or malformed values to 0', () => {
      expect(fillDurationMs(undefined)).toBe(0);
      expect(fillDurationMs(null)).toBe(0);
      expect(fillDurationMs('4200')).toBe(0);
      expect(fillDurationMs(-100)).toBe(0);
      expect(fillDurationMs(Number.NaN)).toBe(0);
      expect(fillDurationMs(Infinity)).toBe(0);
    });
  });

  describe('isTooFastSubmission', () => {
    it('rejects sub-threshold fills', () => {
      expect(isTooFastSubmission(0)).toBe(true);
      expect(isTooFastSubmission(MIN_FILL_MS - 1)).toBe(true);
    });

    it('accepts fills at or beyond the threshold', () => {
      expect(isTooFastSubmission(MIN_FILL_MS)).toBe(false);
      expect(isTooFastSubmission(10_000)).toBe(false);
    });

    it('treats missing/malformed timing as too fast', () => {
      expect(isTooFastSubmission(undefined)).toBe(true);
      expect(isTooFastSubmission('soon')).toBe(true);
    });

    it('honours a custom threshold', () => {
      expect(isTooFastSubmission(1500, 1000)).toBe(false);
      expect(isTooFastSubmission(800, 1000)).toBe(true);
    });
  });
});

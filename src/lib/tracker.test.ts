import { describe, expect, it } from 'vitest';
import { SortTracker } from './tracker';

describe('SortTracker', () => {
  it('assigns stable ids across frames for overlapping boxes', () => {
    const tracker = new SortTracker({ minHits: 1, maxAgeMs: 750, iouThreshold: 0.3 });
    const t0 = tracker.update(
      [{ className: 'person', confidence: 0.9, bbox: [10, 10, 50, 80] }],
      0,
    );
    expect(t0).toHaveLength(1);
    const id = t0[0].trackId;

    const t1 = tracker.update(
      [{ className: 'person', confidence: 0.88, bbox: [12, 12, 52, 82] }],
      100,
    );
    expect(t1).toHaveLength(1);
    expect(t1[0].trackId).toBe(id);
  });

  it('hides tracks until minHits', () => {
    const tracker = new SortTracker({ minHits: 2, maxAgeMs: 750, iouThreshold: 0.3 });
    const t0 = tracker.update(
      [{ className: 'car', confidence: 0.8, bbox: [100, 100, 200, 180] }],
      0,
    );
    expect(t0).toHaveLength(0);
    const t1 = tracker.update(
      [{ className: 'car', confidence: 0.8, bbox: [102, 100, 202, 180] }],
      50,
    );
    expect(t1).toHaveLength(1);
  });

  it('drops tracks after maxAgeMs without matches', () => {
    const tracker = new SortTracker({ minHits: 1, maxAgeMs: 750, iouThreshold: 0.3 });
    tracker.update([{ className: 'person', confidence: 0.9, bbox: [10, 10, 50, 80] }], 0);
    const still = tracker.update([], 700);
    expect(still).toHaveLength(1);
    const gone = tracker.update([], 800);
    expect(gone).toHaveLength(0);
  });

  it('reset clears ids', () => {
    const tracker = new SortTracker({ minHits: 1 });
    const a = tracker.update(
      [{ className: 'person', confidence: 0.9, bbox: [10, 10, 50, 80] }],
      0,
    );
    tracker.reset();
    const b = tracker.update(
      [{ className: 'person', confidence: 0.9, bbox: [10, 10, 50, 80] }],
      10,
    );
    expect(b[0].trackId).not.toBe(a[0].trackId);
  });
});

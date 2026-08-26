import { describe, expect, it } from 'vitest';
import { tracksIndicatePresence } from './presence';

describe('tracksIndicatePresence', () => {
  it('is true for person or car', () => {
    expect(tracksIndicatePresence([{ trackId: 1, class: 'person', bbox: [0, 0, 1, 1], confidence: 0.9 }]).present).toBe(true);
    expect(tracksIndicatePresence([{ trackId: 1, class: 'car', bbox: [0, 0, 1, 1], confidence: 0.9 }]).present).toBe(true);
  });
  it('is false for empty or other classes', () => {
    expect(tracksIndicatePresence([]).present).toBe(false);
    expect(tracksIndicatePresence([{ trackId: 1, class: 'dog', bbox: [0, 0, 1, 1], confidence: 0.9 }]).present).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { isCorsCaptureError } from './clientAnalytics';

describe('isCorsCaptureError', () => {
  it.each([
    new DOMException('The operation is insecure.', 'SecurityError'),
    new Error('The canvas has been tainted by cross-origin data'),
    new Error('Failed to execute createImageBitmap: Cross-origin image'),
    'CORS policy blocked frame capture',
  ])('recognizes CORS-like capture failures', (error) => {
    expect(isCorsCaptureError(error)).toBe(true);
  });

  it('does not classify unrelated capture failures as CORS', () => {
    expect(isCorsCaptureError(new Error('Video frame is not available'))).toBe(false);
  });
});

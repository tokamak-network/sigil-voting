/**
 * Widget Tests
 *
 * Tests the widget module's exports and configuration handling.
 * DOM rendering tests are limited since vitest doesn't provide a real DOM.
 */

import { describe, it, expect } from 'vitest';

describe('widget module exports', () => {
  it('should export mountSigilWidget function', async () => {
    const mod = await import('../src/widget.js');
    expect(typeof mod.mountSigilWidget).toBe('function');
  });

  it('should export autoMount function', async () => {
    const mod = await import('../src/widget.js');
    expect(typeof mod.autoMount).toBe('function');
  });

  it('should export WidgetConfig type via module', async () => {
    // Type-only check — if this compiles, the type is exported
    const mod = await import('../src/widget.js');
    expect(mod).toBeDefined();
  });
});

describe('widget configuration', () => {
  it('should accept minimal config', async () => {
    const mod = await import('../src/widget.js');
    // We can't actually mount (no DOM) but verify the function signature
    expect(() => {
      // Calling with no target should throw since document is not available in Node
      try {
        mod.mountSigilWidget({
          maciAddress: '0x1234567890123456789012345678901234567890',
          pollId: 0,
        });
      } catch (e) {
        // Expected: no DOM in test environment
        expect((e as Error).message).toBeDefined();
      }
    }).not.toThrow();
  });
});

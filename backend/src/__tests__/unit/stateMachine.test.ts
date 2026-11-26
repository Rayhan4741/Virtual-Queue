import { describe, it, expect } from 'vitest';
import { isValidTransition } from '../../services/tokenEngine.js';

describe('Token Lifecycle State Machine', () => {
  it('permits valid proposal-defined transitions', () => {
    expect(isValidTransition('WAITING', 'CHECKED_IN')).toBe(true);
    expect(isValidTransition('WAITING', 'CANCELLED')).toBe(true);
    expect(isValidTransition('CHECKED_IN', 'CALLED')).toBe(true);
    expect(isValidTransition('CALLED', 'SERVING')).toBe(true);
    expect(isValidTransition('CALLED', 'NO_SHOW')).toBe(true);
    expect(isValidTransition('SERVING', 'COMPLETED')).toBe(true);
    expect(isValidTransition('SERVING', 'SKIPPED')).toBe(true);
    expect(isValidTransition('NO_SHOW', 'CHECKED_IN')).toBe(true); // Late Pass
  });

  it('rejects arbitrary or terminal-state transitions', () => {
    expect(isValidTransition('WAITING', 'COMPLETED')).toBe(false);
    expect(isValidTransition('COMPLETED', 'SERVING')).toBe(false);
    expect(isValidTransition('CANCELLED', 'CHECKED_IN')).toBe(false);
    expect(isValidTransition('SKIPPED', 'CALLED')).toBe(false);
    expect(isValidTransition('NO_SHOW', 'SERVING')).toBe(false);
  });
});

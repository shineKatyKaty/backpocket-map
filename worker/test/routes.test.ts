import { describe, it, expect } from 'vitest';
import { validateRoutesRequest } from '../src/routes';

describe('validateRoutesRequest', () => {
  const ok = {
    origin: { lat: 35.0, lng: 135.0 },
    destinations: [{ id: '1:2', lat: 35.1, lng: 135.1 }],
    mode: 'WALK',
  };

  it('正しいリクエストを受理', () => {
    expect(validateRoutesRequest(ok)?.mode).toBe('WALK');
  });
  it('mode 既定は WALK', () => {
    const { mode, ...noMode } = ok;
    void mode;
    expect(validateRoutesRequest(noMode)?.mode).toBe('WALK');
  });
  it('不正な mode は拒否', () => {
    expect(validateRoutesRequest({ ...ok, mode: 'FLY' })).toBeNull();
  });
  it('origin 欠落は拒否', () => {
    expect(validateRoutesRequest({ destinations: ok.destinations })).toBeNull();
  });
  it('destinations 空は拒否', () => {
    expect(validateRoutesRequest({ ...ok, destinations: [] })).toBeNull();
  });
  it('destination の型不正は拒否', () => {
    expect(validateRoutesRequest({ ...ok, destinations: [{ id: 'x', lat: 'a', lng: 1 }] })).toBeNull();
  });
});

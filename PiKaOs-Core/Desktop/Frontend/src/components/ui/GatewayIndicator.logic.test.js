import { describe, it, expect } from 'vitest';
import { indicatorState } from './GatewayIndicator.logic.js';

describe('indicatorState', () => {
  it('renders nothing while the gateway is off or status is unknown', () => {
    expect(indicatorState(null)).toBeNull();
    expect(indicatorState({ enabled: false, connections: 0 })).toBeNull();
  });
  it('waiting while enabled with no connections', () => {
    expect(indicatorState({ enabled: true, connections: 0 }))
      .toEqual({ key: 'mcpgw.status.waiting', params: {}, live: false });
  });
  it('connected count once clients attach', () => {
    expect(indicatorState({ enabled: true, connections: 2 }))
      .toEqual({ key: 'mcpgw.status.connected', params: { n: 2 }, live: true });
  });
});

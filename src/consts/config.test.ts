import { resolveWsUrl } from './config';

describe('resolveWsUrl', () => {
  it('derives the live endpoint from the GraphQL URL', () => {
    expect(resolveWsUrl(undefined, 'https://api.example/graphql?x=1')).toBe(
      'wss://api.example/messages',
    );
    expect(resolveWsUrl('', 'https://api.example/graphql')).toBe('wss://api.example/messages');
    expect(resolveWsUrl(undefined, 'http://api.example/graphql')).toBe('ws://api.example/messages');
  });

  it('accepts websocket overrides', () => {
    expect(resolveWsUrl('wss://live.example/messages', 'https://api.example/graphql')).toBe(
      'wss://live.example/messages',
    );
  });

  it('rejects malformed and unsupported overrides', () => {
    expect(resolveWsUrl('not a url', 'https://api.example/graphql')).toBeNull();
    expect(resolveWsUrl('https://live.example/messages', 'https://api.example/graphql')).toBeNull();
    expect(
      resolveWsUrl('wss://live.example/messages#fragment', 'https://api.example/graphql'),
    ).toBeNull();
  });
});

import { toBase64 } from '@hyperlane-xyz/utils';

import {
  getMessageDetailPath,
  parseMessageLookupData,
  serializeMessageLookupData,
} from './messageLookup';

const lookupData = {
  originDomainId: 1,
  origin: { hash: `0x${'ab'.repeat(32)}` },
};
const forgedMessage = {
  ...lookupData,
  msgId: `0x${'cd'.repeat(32)}`,
  body: '0x1234',
  recipient: `0x${'12'.repeat(20)}`,
  status: 'delivered',
  destination: { blockNumber: 123 },
  origin: { ...lookupData.origin, blockNumber: 456, mailbox: 'attacker mailbox' },
};

it('extracts only lookup hints from legacy full-message links', () => {
  expect(parseMessageLookupData(toBase64(forgedMessage))).toEqual(lookupData);
});

it('serializes only lookup hints into new links', () => {
  const encoded = serializeMessageLookupData(forgedMessage);
  expect(JSON.parse(atob(encoded!))).toEqual(lookupData);
  expect(parseMessageLookupData(encoded)).toEqual(lookupData);
});

it('generates PI links whose query string carries only encoded lookup hints', () => {
  const path = getMessageDetailPath({
    ...forgedMessage,
    isPiMsg: true,
    origin: { ...forgedMessage.origin, timestamp: 1 },
  });
  const url = new URL(path, 'https://explorer.invalid');
  expect(url.pathname).toBe(`/message/${forgedMessage.msgId}`);
  expect(JSON.parse(atob(url.searchParams.get('data')!))).toEqual(lookupData);
  expect(path).toBe(
    `/message/${forgedMessage.msgId}?data=${encodeURIComponent(toBase64(lookupData)!)}`,
  );
});

it('keeps indexed message links free of lookup hints', () => {
  expect(
    getMessageDetailPath({
      ...forgedMessage,
      isPiMsg: false,
      origin: { ...forgedMessage.origin, timestamp: 1 },
    }),
  ).toBe(`/message/${forgedMessage.msgId}`);
});

it.each([
  null,
  [],
  {},
  { ...lookupData, originDomainId: -1 },
  { ...lookupData, originDomainId: 1.5 },
  { ...lookupData, originDomainId: 0x100000000 },
  { ...lookupData, originDomainId: '1' },
  { ...lookupData, origin: { hash: '../token/0xbad' } },
  { ...lookupData, origin: { hash: '0x1234' } },
  { ...lookupData, origin: null },
])('ignores malformed lookup data: %j', (value) => {
  expect(parseMessageLookupData(btoa(JSON.stringify(value)))).toBeUndefined();
});

it('ignores missing or undecodable data', () => {
  expect(parseMessageLookupData()).toBeUndefined();
  expect(parseMessageLookupData('not base64')).toBeUndefined();
  expect(parseMessageLookupData(btoa('not JSON'))).toBeUndefined();
});

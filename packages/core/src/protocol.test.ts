import { describe, expect, it } from 'vitest';
import { parseClientMsg, parseServerMsg, PROTOCOL_VERSION } from './protocol';

describe('protocol', () => {
  it('принимает корректные сообщения клиента', () => {
    expect(
      parseClientMsg(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, name: 'Женя' })),
    ).toEqual({ t: 'hello', v: PROTOCOL_VERSION, name: 'Женя' });
    expect(parseClientMsg('{"t":"input","seq":3,"input":{"dir":"up"}}')).not.toBeNull();
  });

  it('отклоняет мусор', () => {
    expect(parseClientMsg('не json')).toBeNull();
    expect(parseClientMsg('{"t":"nope"}')).toBeNull();
    expect(parseClientMsg('{"t":"hello","v":1,"name":""}')).toBeNull();
    expect(parseClientMsg('{"t":"input","seq":-1,"input":null}')).toBeNull();
  });

  it('разбирает сообщения сервера', () => {
    const msg = { t: 'end', result: { winner: 'p1' }, match: { p1: 1, p2: 0 }, matchWinner: null };
    expect(parseServerMsg(JSON.stringify(msg))).toEqual(msg);
    expect(parseServerMsg('{"t":"welcome","v":1,"you":"p3"}')).toBeNull();
  });
});

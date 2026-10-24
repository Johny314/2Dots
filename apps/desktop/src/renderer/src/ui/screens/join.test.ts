import { describe, expect, it } from 'vitest';
import { parseAddress } from './join';

describe('parseAddress', () => {
  it('IP с портом и без', () => {
    expect(parseAddress(' 192.168.1.5 ')).toEqual({ host: '192.168.1.5', port: 47777 });
    expect(parseAddress('127.0.0.1:40123')).toEqual({ host: '127.0.0.1', port: 40123 });
    expect(parseAddress('macbook.local')).toEqual({ host: 'macbook.local', port: 47777 });
  });

  it('отвергает некорректные адреса', () => {
    for (const bad of ['', 'abc def', '300.1.1.1', '1.2.3', '1.2.3.4:0', '1.2.3.4:70000']) {
      expect(parseAddress(bad), bad).toBeNull();
    }
  });
});

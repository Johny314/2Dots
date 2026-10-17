import { describe, expect, it } from 'vitest';
import { mazeGame } from './index';

describe('maze (заглушка фазы 0)', () => {
  it('игроки стартуют в противоположных углах', () => {
    const cfg = mazeGame.defaultConfig();
    const s = mazeGame.init(1, ['p1', 'p2'], cfg);
    expect([s.players.p1.x, s.players.p1.y]).toEqual([0, 0]);
    expect([s.players.p2.x, s.players.p2.y]).toEqual([cfg.width - 1, cfg.height - 1]);
  });

  it('проверяет ввод', () => {
    expect(mazeGame.parseInput({ dir: 'up' })).toEqual({ dir: 'up' });
    expect(mazeGame.parseInput({ dir: null })).toEqual({ dir: null });
    expect(mazeGame.parseInput({ dir: 'north' })).toBeNull();
    expect(mazeGame.parseInput(5)).toBeNull();
  });

  it('состояние сериализуется в JSON без потерь', () => {
    const s = mazeGame.init(9, ['p1', 'p2'], mazeGame.defaultConfig());
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it('таймаут даёт ничью', () => {
    const cfg = { ...mazeGame.defaultConfig(), timeLimitMs: 100 };
    const s = mazeGame.init(1, ['p1', 'p2'], cfg);
    for (let i = 0; i < 10 && !mazeGame.result(s); i++) mazeGame.tick(s, 1000 / 30);
    expect(mazeGame.result(s)).toMatchObject({ winner: 'draw', reason: 'timeout' });
  });
});

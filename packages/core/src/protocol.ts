import { z } from 'zod';

/**
 * 2 — настройки мини-игры в лобби (сообщение config, поле lobby.config).
 * 3 — мини-игры «Территория», «Трон», «Ключ и дверь»: старый клиент их не знает.
 */
export const PROTOCOL_VERSION = 3;

// Переподключения нет: обрыв во время раунда → 'aborted' оставшемуся, раунд не засчитан,
// слот освобождается, вернувшийся игрок подключается заново через hello.
export const DEFAULT_PORT = 47777;
export const MDNS_SERVICE_TYPE = '2dots';

export const PlayerIdSchema = z.enum(['p1', 'p2']);

// ---------- клиент → сервер ----------

export const ClientMsgSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('hello'), v: z.number().int(), name: z.string().trim().min(1).max(24) }),
  z.object({ t: z.literal('ready'), ready: z.boolean() }),
  /** Только хост (p1). */
  z.object({ t: z.literal('select'), gameId: z.string().min(1) }),
  /** Только хост (p1): настройки текущей мини-игры; валидирует сама мини-игра через parseConfig. */
  z.object({ t: z.literal('config'), config: z.unknown() }),
  /** input валидирует сама мини-игра через parseInput. */
  z.object({ t: z.literal('input'), seq: z.number().int().nonnegative(), input: z.unknown() }),
  z.object({ t: z.literal('rematch') }),
]);
export type ClientMsg = z.infer<typeof ClientMsgSchema>;

// ---------- сервер → клиент ----------

export const LobbyPlayerSchema = z.object({
  id: PlayerIdSchema,
  name: z.string(),
  ready: z.boolean(),
  connected: z.boolean(),
});
export type LobbyPlayer = z.infer<typeof LobbyPlayerSchema>;

export const ErrorCodeSchema = z.enum([
  'version',
  'full',
  'bad_msg',
  'not_host',
  'unknown_game',
  'bad_config',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ServerMsgSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('welcome'), v: z.number().int(), you: PlayerIdSchema }),
  z.object({
    t: z.literal('lobby'),
    players: z.array(LobbyPlayerSchema),
    gameId: z.string(),
    /** Настройки текущей мини-игры, с которыми начнётся следующий раунд. */
    config: z.unknown(),
    /** Счёт текущего матча. */
    match: z.record(PlayerIdSchema, z.number().int()),
  }),
  z.object({
    t: z.literal('start'),
    gameId: z.string(),
    seed: z.number().int(),
    config: z.unknown(),
    countdownMs: z.number().int().nonnegative(),
  }),
  z.object({ t: z.literal('state'), tick: z.number().int(), state: z.unknown() }),
  z.object({
    t: z.literal('end'),
    result: z.unknown(),
    match: z.record(PlayerIdSchema, z.number().int()),
    /** Победитель матча, если матч завершён. */
    matchWinner: PlayerIdSchema.nullable(),
  }),
  /** Раунд прерван (игрок отключился) — оба возвращаются в лобби, раунд не засчитывается. */
  z.object({ t: z.literal('aborted'), reason: z.enum(['disconnect']) }),
  z.object({ t: z.literal('error'), code: ErrorCodeSchema, message: z.string() }),
]);
export type ServerMsg = z.infer<typeof ServerMsgSchema>;

function parseWith<T>(schema: z.ZodType<T>, raw: string): T | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = schema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export const parseClientMsg = (raw: string): ClientMsg | null => parseWith(ClientMsgSchema, raw);
export const parseServerMsg = (raw: string): ServerMsg | null => parseWith(ServerMsgSchema, raw);

/** Побед для выигрыша матча (best of 5). */
export const MATCH_WINS = 3;

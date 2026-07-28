/**
 * Casting time and duration as structured values instead of free text, with a
 * parser tolerant enough to read every phrasing the SRD and a GM's typing use.
 *
 * Spells live in the library, which carries no version field, so there is no
 * migration step to convert an old entry: the parsers accept either the
 * structured object or the original string, and anything they cannot read
 * becomes `{ kind: 'special', text }` so the GM's words survive intact. The
 * formatters turn a value back into the printed phrasing, which is what the
 * detail modal shows.
 */

/** @typedef {import('../types/spell.js').CastingTime} CastingTime */
/** @typedef {import('../types/spell.js').SpellDuration} SpellDuration */

/** @type {CastingTime['kind'][]} */
export const CASTING_TIME_KINDS = ['action', 'bonus', 'reaction', 'minutes', 'hours', 'special'];

/** The casting-time kinds that carry a number of units. @type {CastingTime['kind'][]} */
export const TIMED_CASTING_KINDS = ['minutes', 'hours'];

/** @type {SpellDuration['kind'][]} */
export const DURATION_KINDS = [
  'instantaneous',
  'rounds',
  'minutes',
  'hours',
  'days',
  'until-dispelled',
  'special',
];

/** The duration kinds that carry a number of units. @type {SpellDuration['kind'][]} */
export const TIMED_DURATION_KINDS = ['rounds', 'minutes', 'hours', 'days'];

/** One round is six seconds, so a minute of game time is ten rounds. */
const ROUNDS_PER_MINUTE = 10;

/** @param {unknown} value @returns {number} a positive whole amount, defaulting to 1. */
function amountOf(value) {
  const amount = Math.floor(Number(value));
  return Number.isFinite(amount) && amount > 0 ? amount : 1;
}

/** @param {unknown} value @returns {string} */
function textOf(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Read a casting time from either a structured value or a printed string.
 * Recognized strings are the SRD's own: `1 action`, `1 bonus action`,
 * `1 reaction, which you take when ...` (the trigger clause is kept),
 * `10 minutes`, `1 hour`. Anything else is preserved as `special`.
 * @param {unknown} value
 * @returns {CastingTime}
 */
export function parseCastingTime(value) {
  if (value && typeof value === 'object') {
    const raw = /** @type {Record<string, unknown>} */ (value);
    const kind = /** @type {CastingTime['kind']} */ (raw.kind);
    if (CASTING_TIME_KINDS.includes(kind)) {
      if (TIMED_CASTING_KINDS.includes(kind)) return { kind, amount: amountOf(raw.amount) };
      if (kind === 'reaction') {
        const trigger = textOf(raw.trigger);
        return trigger ? { kind, trigger } : { kind };
      }
      if (kind === 'special') return { kind, text: textOf(raw.text) };
      return { kind };
    }
    return { kind: 'special', text: '' };
  }

  const text = textOf(value);
  const lower = text.toLowerCase();
  if (/^(?:1\s+)?action$/.test(lower)) return { kind: 'action' };
  if (/^(?:1\s+)?bonus\s+action$/.test(lower)) return { kind: 'bonus' };

  const reaction = /^(?:1\s+)?reaction\b[,\s]*(.*)$/.exec(lower);
  if (reaction) {
    // Keep the trigger clause in its original casing: it is a sentence a GM (or
    // the SRD) wrote, not a value to canonicalize.
    const trigger = text.slice(text.length - reaction[1].length).trim();
    return trigger ? { kind: 'reaction', trigger } : { kind: 'reaction' };
  }

  const timed = /^(\d+)\s*(minute|hour)s?$/.exec(lower);
  if (timed) return { kind: timed[2] === 'hour' ? 'hours' : 'minutes', amount: amountOf(timed[1]) };

  return { kind: 'special', text };
}

/**
 * Read a duration from either a structured value or a printed string. A
 * `Concentration, ` prefix is stripped, since concentration is already its own
 * boolean on the spell, and both it and a bare `Up to ` set `upTo`.
 * @param {unknown} value
 * @returns {SpellDuration}
 */
export function parseDuration(value) {
  if (value && typeof value === 'object') {
    const raw = /** @type {Record<string, unknown>} */ (value);
    const kind = /** @type {SpellDuration['kind']} */ (raw.kind);
    if (DURATION_KINDS.includes(kind)) {
      if (TIMED_DURATION_KINDS.includes(kind)) {
        return { kind, amount: amountOf(raw.amount), ...(raw.upTo ? { upTo: true } : {}) };
      }
      if (kind === 'special') return { kind, text: textOf(raw.text) };
      return { kind };
    }
    return { kind: 'special', text: '' };
  }

  const original = textOf(value);
  let text = original;
  let upTo = false;
  const concentration = /^concentration\s*,\s*/i.exec(text);
  if (concentration) {
    text = text.slice(concentration[0].length);
    upTo = true;
  }
  const prefix = /^up\s+to\s+/i.exec(text);
  if (prefix) {
    text = text.slice(prefix[0].length);
    upTo = true;
  }

  const lower = text.toLowerCase();
  if (lower === 'instantaneous') return { kind: 'instantaneous' };
  if (lower === 'until dispelled' || lower === 'until-dispelled')
    return { kind: 'until-dispelled' };

  const timed = /^(\d+)\s*(round|minute|hour|day)s?$/.exec(lower);
  if (timed) {
    /** @type {Record<string, SpellDuration['kind']>} */
    const kinds = { round: 'rounds', minute: 'minutes', hour: 'hours', day: 'days' };
    return { kind: kinds[timed[2]], amount: amountOf(timed[1]), ...(upTo ? { upTo: true } : {}) };
  }

  // Unreadable text keeps the whole original, prefix included, so nothing a GM
  // typed is lost by a partial parse.
  return { kind: 'special', text: original };
}

/** @param {number} amount @param {string} unit @returns {string} e.g. '1 minute', '10 minutes'. */
function plural(amount, unit) {
  return `${amount} ${unit}${amount === 1 ? '' : 's'}`;
}

/**
 * The printed phrasing of a casting time — the same string the entry carried
 * before it was structured.
 * @param {CastingTime} value
 * @returns {string}
 */
export function formatCastingTime(value) {
  switch (value.kind) {
    case 'action':
      return '1 action';
    case 'bonus':
      return '1 bonus action';
    case 'reaction':
      return value.trigger ? `1 reaction, ${value.trigger}` : '1 reaction';
    case 'minutes':
      return plural(value.amount ?? 1, 'minute');
    case 'hours':
      return plural(value.amount ?? 1, 'hour');
    default:
      return value.text || 'Special';
  }
}

/**
 * The printed phrasing of a duration. Pass the spell's `concentration` flag to
 * get the SRD's `Concentration, up to 1 minute` phrasing back; without it a
 * duration that may be ended early reads `Up to 1 minute`.
 * @param {SpellDuration} value
 * @param {{ concentration?: boolean }} [options]
 * @returns {string}
 */
export function formatDuration(value, { concentration = false } = {}) {
  /** @type {Record<string, string>} */
  const units = { rounds: 'round', minutes: 'minute', hours: 'hour', days: 'day' };
  const unit = units[value.kind];
  if (unit) {
    const base = plural(value.amount ?? 1, unit);
    if (concentration) return `Concentration, up to ${base}`;
    return value.upTo ? `Up to ${base}` : base;
  }
  if (value.kind === 'instantaneous') return 'Instantaneous';
  if (value.kind === 'until-dispelled') return 'Until dispelled';
  return value.text || 'Special';
}

/**
 * How many combat rounds a duration lasts, for the round counter on a condition
 * a spell imposes. Null means no counter — an instantaneous or open-ended
 * duration, or one measured in days, which no fight runs long enough to tick
 * down and which the GM ends by hand.
 * @param {SpellDuration} value
 * @returns {number | null}
 */
export function durationInRounds(value) {
  const amount = value.amount ?? 1;
  if (value.kind === 'rounds') return amount;
  if (value.kind === 'minutes') return amount * ROUNDS_PER_MINUTE;
  if (value.kind === 'hours') return amount * 60 * ROUNDS_PER_MINUTE;
  return null;
}

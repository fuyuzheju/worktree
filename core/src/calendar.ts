import type { Block, BlockOccurrence, BlockRule, CalendarOperation, Timestamp } from './types';
import { expandRule, ruleMatchesDay, validateRule } from './schedule';

/**
 * The calendar: blocks, block rules and per-occurrence exceptions, derived by
 * replaying CalendarOperations in order. Occurrences are expanded from rules
 * on demand — they are never stored.
 *
 * Invariant: a skip set holds days only while the rule exists and the day is
 * an occurrence of it (see apply, and docs/data_structure.md).
 */
export class Calendar {
  private blocks = new Map<string, Block>();
  private rules = new Map<string, BlockRule>();
  private skips = new Map<string, Set<number>>();

  /** Deep, state-equivalent copy (used by validation probes). */
  clone(): Calendar {
    const copy = new Calendar();
    for (const [id, b] of this.blocks) copy.blocks.set(id, { ...b });
    for (const [id, r] of this.rules) {
      copy.rules.set(id, {
        ...r,
        startDate: { ...r.startDate },
        timeOfDay: { ...r.timeOfDay },
        byDay: r.byDay?.slice(),
        byMonthDay: r.byMonthDay?.slice(),
        byMonth: r.byMonth?.slice(),
      });
    }
    for (const [id, days] of this.skips) copy.skips.set(id, new Set(days));
    return copy;
  }

  apply(op: CalendarOperation): void {
    switch (op.kind) {
      case 'add_block': {
        if (this.blocks.has(op.id)) throw new Error(`duplicate block id: ${op.id}`);
        this.validateName(op.name);
        this.validatePeriod(op.start, op.end);
        if (op.nodeId !== undefined) this.ensureNodeUnlinked(op.nodeId);
        this.blocks.set(op.id, {
          id: op.id,
          name: op.name,
          start: op.start,
          end: op.end,
          note: op.note ?? '',
          status: false,
          nodeId: op.nodeId,
        });
        break;
      }
      case 'remove_block':
        // Idempotent, so concurrent removes commute.
        this.blocks.delete(op.id);
        break;
      case 'edit_block': {
        if (
          op.name === undefined &&
          op.start === undefined &&
          op.end === undefined &&
          op.note === undefined &&
          op.nodeId === undefined
        ) {
          throw new Error('edit_block patch is empty');
        }
        const block = this.mustGet(op.id);
        if (op.name !== undefined) this.validateName(op.name);
        this.validatePeriod(op.start ?? block.start, op.end ?? block.end);
        if (op.nodeId !== undefined && op.nodeId !== null) this.ensureNodeUnlinked(op.nodeId, op.id);
        if (op.name !== undefined) block.name = op.name;
        if (op.start !== undefined) block.start = op.start;
        if (op.end !== undefined) block.end = op.end;
        if (op.note !== undefined) block.note = op.note;
        if (op.nodeId !== undefined) block.nodeId = op.nodeId ?? undefined;
        break;
      }
      case 'complete_block':
        this.mustGet(op.id).status = true;
        break;
      case 'uncomplete_block':
        this.mustGet(op.id).status = false;
        break;
      case 'add_block_rule': {
        if (this.rules.has(op.id)) throw new Error(`duplicate rule id: ${op.id}`);
        const rule: BlockRule = {
          id: op.id,
          name: op.name,
          note: op.note ?? '',
          freq: op.freq,
          interval: op.interval,
          startDate: op.startDate,
          timeOfDay: op.timeOfDay,
          duration: op.duration,
          byDay: op.byDay,
          byMonthDay: op.byMonthDay,
          byMonth: op.byMonth,
          bySetPos: op.bySetPos,
          until: op.until,
          tzOffset: op.tzOffset,
          active: true,
        };
        validateRule(rule);
        this.rules.set(op.id, rule);
        break;
      }
      case 'edit_block_rule': {
        if (isRulePatchEmpty(op)) throw new Error('edit_block_rule patch is empty');
        const rule = this.mustGetRule(op.id);
        const merged: BlockRule = {
          ...rule,
          name: op.name ?? rule.name,
          note: op.note ?? rule.note,
          freq: op.freq ?? rule.freq,
          interval: op.interval ?? rule.interval,
          startDate: op.startDate ?? rule.startDate,
          timeOfDay: op.timeOfDay ?? rule.timeOfDay,
          duration: op.duration ?? rule.duration,
          byDay: op.byDay === undefined ? rule.byDay : op.byDay ?? undefined,
          byMonthDay: op.byMonthDay === undefined ? rule.byMonthDay : op.byMonthDay ?? undefined,
          byMonth: op.byMonth === undefined ? rule.byMonth : op.byMonth ?? undefined,
          bySetPos: op.bySetPos === undefined ? rule.bySetPos : op.bySetPos ?? undefined,
          until: op.until === undefined ? rule.until : op.until ?? undefined,
          active: op.active ?? rule.active,
        };
        if (op.freq !== undefined) {
          // Changing the frequency means re-stating the pattern: selectors the
          // patch does not supply are dropped (a weekly `byDay` is meaningless
          // on a monthly rule).
          merged.byDay = op.byDay === undefined ? undefined : op.byDay ?? undefined;
          merged.byMonthDay = op.byMonthDay === undefined ? undefined : op.byMonthDay ?? undefined;
          merged.byMonth = op.byMonth === undefined ? undefined : op.byMonth ?? undefined;
          merged.bySetPos = op.bySetPos === undefined ? undefined : op.bySetPos ?? undefined;
        }
        validateRule(merged);
        this.rules.set(op.id, merged);
        // A patch touching the day set can orphan the rule's skips, so they go
        // with it; a time-only tweak keeps them (skips are day-keyed).
        if (touchesDaySet(op)) this.skips.delete(op.id);
        break;
      }
      case 'remove_block_rule':
        // Idempotent, so concurrent removes commute; the skips go with the rule.
        this.rules.delete(op.id);
        this.skips.delete(op.id);
        break;
      case 'skip_occurrence': {
        this.ensureOccurrence(op.ruleId, op.day);
        const days = this.skips.get(op.ruleId) ?? new Set<number>();
        days.add(op.day);
        this.skips.set(op.ruleId, days);
        break;
      }
      case 'unskip_occurrence':
        this.ensureOccurrence(op.ruleId, op.day);
        this.skips.get(op.ruleId)?.delete(op.day);
        break;
      default: {
        const unknown: never = op;
        throw new Error(`unknown calendar op kind: ${JSON.stringify(unknown)}`);
      }
    }
  }

  getBlocks(): Block[] {
    return [...this.blocks.values()];
  }

  blockCount(): number {
    return this.blocks.size;
  }

  getRules(): BlockRule[] {
    return [...this.rules.values()];
  }

  ruleCount(): number {
    return this.rules.size;
  }

  /** The rule's skipped days (occurrence keys), ascending. */
  getSkips(ruleId: string): number[] {
    const days = this.skips.get(ruleId);
    return days === undefined ? [] : [...days].sort((a, b) => a - b);
  }

  /** All rules' occurrences overlapping `[from, to)`, sorted by (occStart, ruleId). */
  expand(from: Timestamp, to: Timestamp): BlockOccurrence[] {
    const occurrences: BlockOccurrence[] = [];
    for (const rule of this.rules.values()) {
      occurrences.push(...expandRule(rule, this.skips.get(rule.id), from, to));
    }
    occurrences.sort(
      (a, b) => a.occStart - b.occStart || (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0),
    );
    return occurrences;
  }

  /** Derived status change (completion propagation). */
  setStatus(id: string, status: boolean): void {
    this.mustGet(id).status = status;
  }

  /** Derived status change: every block linked to `nodeId` (at most one exists). */
  setStatusForNode(nodeId: string, status: boolean): void {
    for (const b of this.blocks.values()) {
      if (b.nodeId === nodeId) b.status = status;
    }
  }

  /** Derived link cleanup: blocks whose node no longer exists become standalone. */
  unlinkMissingNodes(exists: (nodeId: string) => boolean): void {
    for (const b of this.blocks.values()) {
      if (b.nodeId !== undefined && !exists(b.nodeId)) b.nodeId = undefined;
    }
  }

  private mustGet(id: string): Block {
    const block = this.blocks.get(id);
    if (!block) throw new Error(`unknown block id: ${id}`);
    return block;
  }

  private mustGetRule(id: string): BlockRule {
    const rule = this.rules.get(id);
    if (!rule) throw new Error(`unknown rule id: ${id}`);
    return rule;
  }

  /** Skips may only target a day the live rule actually fires on — no orphans. */
  private ensureOccurrence(ruleId: string, day: number): void {
    const rule = this.mustGetRule(ruleId);
    if (!ruleMatchesDay(rule, day)) throw new Error(`day is not an occurrence: ${ruleId} ${day}`);
  }

  private validateName(name: string): void {
    if (name === '') throw new Error('block name must not be empty');
  }

  private validatePeriod(start: Timestamp, end: Timestamp): void {
    if (start >= end) throw new Error(`block start must be before end: ${start} >= ${end}`);
  }

  /** At most one block may link a node; `excludeId` exempts the block itself (edit relink). */
  private ensureNodeUnlinked(nodeId: string, excludeId?: string): void {
    for (const b of this.blocks.values()) {
      if (b.id !== excludeId && b.nodeId === nodeId) {
        throw new Error(`node already linked to a block: ${nodeId}`);
      }
    }
  }
}

type RulePatch = Extract<CalendarOperation, { kind: 'edit_block_rule' }>;

function isRulePatchEmpty(op: RulePatch): boolean {
  return (
    op.name === undefined &&
    op.note === undefined &&
    op.freq === undefined &&
    op.interval === undefined &&
    op.startDate === undefined &&
    op.timeOfDay === undefined &&
    op.duration === undefined &&
    op.byDay === undefined &&
    op.byMonthDay === undefined &&
    op.byMonth === undefined &&
    op.bySetPos === undefined &&
    op.until === undefined &&
    op.active === undefined
  );
}

/** Whether the patch changes the set of days the rule fires on. */
function touchesDaySet(op: RulePatch): boolean {
  return (
    op.freq !== undefined ||
    op.interval !== undefined ||
    op.startDate !== undefined ||
    op.byDay !== undefined ||
    op.byMonthDay !== undefined ||
    op.byMonth !== undefined ||
    op.bySetPos !== undefined ||
    op.until !== undefined
  );
}

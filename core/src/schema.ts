import { z } from 'zod';
import type { Operation } from './types';

/** Runtime validation for ops read back from storage (Prisma JSON columns). */
const timestamp = z.number().int().nonnegative();
const id = z.string().min(1);

const timestampField = timestamp.optional();
const intArray = z.array(z.number().int());
const civilDate = z.object({ year: z.number().int(), month: z.number().int(), day: z.number().int() });
const civilTime = z.object({ hour: z.number().int(), minute: z.number().int() });
const ruleFreq = z.enum(['daily', 'weekly', 'monthly', 'yearly']);

const treeOperation = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('add'),
    parentId: id,
    id,
    name: z.string(),
    weight: z.number(),
    note: z.string().optional(),
    deadline: timestamp.optional(),
    createdAt: timestamp.optional(),
    timestamp: timestampField,
  }),
  z.object({ kind: z.literal('remove'), id, timestamp: timestampField }),
  z.object({ kind: z.literal('rename'), id, name: z.string(), timestamp: timestampField }),
  z.object({ kind: z.literal('move'), id, parentId: id, weight: z.number(), timestamp: timestampField }),
  z.object({
    kind: z.literal('copy'),
    id,
    parentId: id,
    newId: id,
    weight: z.number(),
    name: z.string().optional(),
    timestamp: timestampField,
  }),
  z.object({ kind: z.literal('complete'), id, timestamp: timestampField }),
  z.object({ kind: z.literal('uncomplete'), id, timestamp: timestampField }),
  z.object({
    kind: z.literal('add_reminder'),
    nodeId: id,
    rmdId: id,
    name: z.string().optional(),
    deadline: timestamp,
    repeat: timestamp.optional(),
    auto: z.boolean().optional(),
    timestamp: timestampField,
  }),
  z.object({ kind: z.literal('remove_reminder'), rmdId: id, timestamp: timestampField }),
  z.object({
    kind: z.literal('edit_reminder'),
    rmdId: id,
    name: z.string().optional(),
    deadline: timestamp.optional(),
    repeat: timestamp.nullable().optional(),
    active: z.boolean().optional(),
    timestamp: timestampField,
  }),
  z.object({
    kind: z.literal('edit_node'),
    id,
    note: z.string().optional(),
    deadline: timestamp.nullable().optional(),
    timestamp: timestampField,
  }),
]);

const calendarOperation = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('add_block'),
    id,
    name: z.string(),
    start: timestamp,
    end: timestamp,
    note: z.string().optional(),
    nodeId: id.optional(),
    timestamp: timestampField,
  }),
  z.object({ kind: z.literal('remove_block'), id, timestamp: timestampField }),
  z.object({
    kind: z.literal('edit_block'),
    id,
    name: z.string().optional(),
    start: timestamp.optional(),
    end: timestamp.optional(),
    note: z.string().optional(),
    nodeId: id.nullable().optional(),
    timestamp: timestampField,
  }),
  z.object({ kind: z.literal('complete_block'), id, timestamp: timestampField }),
  z.object({ kind: z.literal('uncomplete_block'), id, timestamp: timestampField }),
  z.object({
    kind: z.literal('add_block_rule'),
    id,
    name: z.string(),
    freq: ruleFreq,
    interval: z.number().int(),
    startDate: civilDate,
    timeOfDay: civilTime,
    duration: timestamp,
    byDay: intArray.optional(),
    byMonthDay: intArray.optional(),
    byMonth: intArray.optional(),
    bySetPos: z.number().int().optional(),
    until: timestamp.optional(),
    tzOffset: z.number().int(),
    note: z.string().optional(),
    timestamp: timestampField,
  }),
  z.object({
    kind: z.literal('edit_block_rule'),
    id,
    name: z.string().optional(),
    note: z.string().optional(),
    freq: ruleFreq.optional(),
    interval: z.number().int().optional(),
    startDate: civilDate.optional(),
    timeOfDay: civilTime.optional(),
    duration: timestamp.optional(),
    byDay: intArray.nullable().optional(),
    byMonthDay: intArray.nullable().optional(),
    byMonth: intArray.nullable().optional(),
    bySetPos: z.number().int().nullable().optional(),
    until: timestamp.nullable().optional(),
    active: z.boolean().optional(),
    timestamp: timestampField,
  }),
  z.object({ kind: z.literal('remove_block_rule'), id, timestamp: timestampField }),
  z.object({ kind: z.literal('skip_occurrence'), ruleId: id, day: z.number().int(), timestamp: timestampField }),
  z.object({ kind: z.literal('unskip_occurrence'), ruleId: id, day: z.number().int(), timestamp: timestampField }),
]);

export const operationSchema: z.ZodType<Operation> = z.discriminatedUnion('kind', [
  ...treeOperation.options,
  ...calendarOperation.options,
]);

import { z } from 'zod';
import type { Operation } from './types';

/** Runtime validation for ops read back from storage (Prisma JSON columns). */
const timestamp = z.number().int().nonnegative();
const id = z.string().min(1);

const timestampField = timestamp.optional();

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
]);

export const operationSchema: z.ZodType<Operation> = z.discriminatedUnion('kind', [
  ...treeOperation.options,
  ...calendarOperation.options,
]);

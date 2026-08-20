import { PrismaClient } from '@prisma/client';
import { config } from './config';

process.env.DATABASE_URL ??= config.databaseUrl;

export const prisma = new PrismaClient();

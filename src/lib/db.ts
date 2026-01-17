/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaClient } from '@/generated/prisma/client';

const globalForPrisma = globalThis as unknown as {
    prisma: InstanceType<typeof PrismaClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? new (PrismaClient as any)();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

import { PrismaClient } from '@prisma/client';

// Lazy initialization - Prisma client is only created when first accessed
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

function createPrismaClient() {
    return new PrismaClient();
}

// Export a getter function instead of the client directly
// This prevents connection during module import (build time)
export function getPrisma(): PrismaClient {
    if (!globalForPrisma.prisma) {
        globalForPrisma.prisma = createPrismaClient();
    }
    return globalForPrisma.prisma;
}

// For backwards compatibility, also export prisma as a getter
export const prisma = new Proxy({} as PrismaClient, {
    get(_, prop) {
        return getPrisma()[prop as keyof PrismaClient];
    },
});

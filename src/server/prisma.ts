type PrismaLike = {
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
};

const globalForPrisma = globalThis as unknown as { prisma?: PrismaLike };

export async function getPrismaClient(): Promise<PrismaLike> {
  if (!globalForPrisma.prisma) {
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const generated = await import("@/generated/prisma/client");
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/framory?schema=public"
    });
    globalForPrisma.prisma = new generated.PrismaClient({ adapter });
  }
  return globalForPrisma.prisma;
}

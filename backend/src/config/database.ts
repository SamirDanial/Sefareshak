import { PrismaClient } from "@prisma/client";
import { withAuditExtension } from "../prisma/auditExtension";

class DatabaseSingleton {
  private static instance: DatabaseSingleton;
  private prisma: PrismaClient;

  private constructor() {
    const base = new PrismaClient({
      log:
        process.env.NODE_ENV === "development"
          ? ["info", "warn", "error"]
          : ["error"],
    });

    this.prisma = withAuditExtension(base);
  }

  public static getInstance(): DatabaseSingleton {
    if (!DatabaseSingleton.instance) {
      DatabaseSingleton.instance = new DatabaseSingleton();
    }
    return DatabaseSingleton.instance;
  }

  public getPrisma(): PrismaClient {
    return this.prisma;
  }

  public async connect(): Promise<void> {
    try {
      await this.prisma.$connect();
      console.log("✅ Database connected successfully");
    } catch (error) {
      console.error("❌ Database connection failed:", error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      console.log("✅ Database disconnected successfully");
    } catch (error) {
      console.error("❌ Database disconnection failed:", error);
      throw error;
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      console.error("❌ Database health check failed:", error);
      return false;
    }
  }
}

export default DatabaseSingleton;

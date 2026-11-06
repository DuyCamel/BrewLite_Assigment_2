// TV3 — Pool/env và transaction helper dùng chung. TV1/TV4/TV5/TV6 gọi qua model; không viết SQL nghiệp vụ trong controller/view.
// TV1 phối hợp cấu hình DB trong Docker local; TV6 cấu hình kết nối production, không đổi contract transaction khi chưa thống nhất nhóm.
import "./environment.js";
import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Pool, PoolClient, QueryResultRow } from "pg";
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool = new Pool({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? "brewlite",
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME ?? "brewlite",
    connectionTimeoutMillis: 3000,
    max: 10,
  });
  query<T extends QueryResultRow>(sql: string, parameters: unknown[] = []) {
    return this.pool.query<T>(sql, parameters);
  }
  async ping() {
    await this.query("SELECT 1");
  }
  // Dùng chung một client cho toàn bộ transaction: Orders/Inventory/Payments truyền client xuống model.
  async withTransaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async onModuleDestroy() {
    await this.pool.end();
  }
}

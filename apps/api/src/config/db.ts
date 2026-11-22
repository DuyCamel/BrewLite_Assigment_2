// TV3 — Pool/env và transaction helper dùng chung. TV1/TV4/TV5/TV6 gọi qua model; không viết SQL nghiệp vụ trong controller/view.
// TV1 phối hợp cấu hình DB trong Docker local; TV6 cấu hình kết nối production, không đổi contract transaction khi chưa thống nhất nhóm.
import { databasePoolConfig } from "./environment.js";
import { Injectable, OnModuleDestroy, ServiceUnavailableException } from "@nestjs/common";
import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly settings = databasePoolConfig();
  private readonly pool = new Pool({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? "brewlite",
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME ?? "brewlite",
    connectionTimeoutMillis: this.settings.acquireTimeoutMs,
    max: this.settings.max,
  });
  private async acquireClient(): Promise<PoolClient> {
    if (this.pool.waitingCount >= this.settings.maxWaiting) {
      throw this.unavailable();
    }
    try {
      return await this.pool.connect();
    } catch {
      throw this.unavailable();
    }
  }
  private unavailable() {
    return new ServiceUnavailableException({
      statusCode: 503,
      code: "DATABASE_BUSY",
      message: "Hệ thống đang bận hoặc database chưa sẵn sàng. Vui lòng thử lại sau.",
    });
  }
  private async runQuery<T extends QueryResultRow>(
    client: PoolClient,
    sql: string,
    parameters: unknown[],
  ): Promise<QueryResult<T>> {
    return new Promise((resolve, reject) => {
      let released = false;
      const release = (error?: Error) => {
        if (released) return;
        released = true;
        client.release(error);
      };
      const onError = (error: Error) => {
        release(error);
        reject(error);
      };
      client.once("error", onError);
      try {
        void client.query<T>(sql, parameters).then(
          (result) => {
            client.removeListener("error", onError);
            release();
            resolve(result);
          },
          (error: Error) => {
            client.removeListener("error", onError);
            release(error);
            reject(error);
          },
        );
      } catch (error) {
        client.removeListener("error", onError);
        release(error instanceof Error ? error : undefined);
        reject(error);
      }
    });
  }
  async query<T extends QueryResultRow>(sql: string, parameters: unknown[] = []) {
    const client = await this.acquireClient();
    return this.runQuery<T>(client, sql, parameters);
  }
  async ping() {
    await this.query("SELECT 1");
  }
  // Dùng chung một client cho toàn bộ transaction: Orders/Inventory/Payments truyền client xuống model.
  async withTransaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.acquireClient();
    let discardClient = false;
    let clientError: Error | undefined;
    const onClientError = (error: Error) => {
      discardClient = true;
      clientError = error;
    };
    client.on("error", onClientError);
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      if (clientError) throw clientError;
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        discardClient = true;
      }
      throw error;
    } finally {
      client.removeListener("error", onClientError);
      client.release(discardClient ? clientError ?? true : undefined);
    }
  }
  async onModuleDestroy() {
    await this.pool.end();
  }
}

import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../config/db.js";
import type {
  PoolClient,
  PaymentInput,
  PaymentResult,
} from "../types/contracts.js";

export interface PaymentAttemptRecord {
  id: string;
  order_id: string;
  user_id: string;
  idempotency_key: string;
  payload_hash: string;
  amount: number;
  method: PaymentInput["method"];
  status: "PROCESSING" | "SUCCEEDED" | "FAILED";
}

@Injectable()
export class PaymentModel {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async findByKey(
    key: string,
    transaction?: PoolClient,
  ): Promise<PaymentAttemptRecord | null> {
    const sql = `SELECT p.*, o.user_id
         FROM payments p
         JOIN orders o ON o.id = p.order_id
        WHERE p.idempotency_key = $1
        LIMIT 1`;
    const result = transaction
      ? await transaction.query<PaymentAttemptRecord>(sql, [key])
      : await this.db.query<PaymentAttemptRecord>(sql, [key]);
    return result.rows[0] || null;
  }

  async insertAttempt(
    input: PaymentInput,
    amount: number,
    key: string,
    payloadHash: string,
    transaction: PoolClient,
  ): Promise<string> {
    const result = await transaction.query(
      `INSERT INTO payments (id, order_id, amount, method, idempotency_key, payload_hash, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'PROCESSING')
       RETURNING id`,
      [randomUUID(), input.orderId, amount, input.method, key, payloadHash],
    );
    return result.rows[0].id;
  }

  async findById(paymentId: string): Promise<PaymentAttemptRecord | null> {
    const result = await this.db.query<PaymentAttemptRecord>(
      `SELECT p.*, o.user_id
         FROM payments p
         JOIN orders o ON o.id = p.order_id
        WHERE p.id = $1
        LIMIT 1`,
      [paymentId],
    );
    return result.rows[0] || null;
  }

  async updateResult(
    paymentId: string,
    result: Exclude<PaymentResult, "UNKNOWN">,
    transaction: PoolClient,
  ): Promise<boolean> {
    const updated = await transaction.query(
      `UPDATE payments
          SET status = $1, resolved_at = NOW()
        WHERE id = $2 AND status = 'PROCESSING'`,
      [result, paymentId],
    );
    return updated.rowCount === 1;
  }
}

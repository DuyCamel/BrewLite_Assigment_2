import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { SepayWebhookPayload } from "./sepay.types.js";

export interface ProviderTransaction {
  paymentId: string;
  orderId: string;
  payload: SepayWebhookPayload | null;
}

@Injectable()
export class SepayModel {
  async findProviderTransaction(
    providerTransactionId: string,
    transaction: PoolClient,
  ): Promise<ProviderTransaction | null> {
    const result = await transaction.query<ProviderTransaction>(
      `SELECT id AS "paymentId", order_id AS "orderId", provider_payload AS payload
       FROM payments
       WHERE provider = 'SEPAY' AND provider_transaction_id = $1`,
      [providerTransactionId],
    );
    return result.rows[0] ?? null;
  }

  async findOrderForUpdate(orderId: string, transaction: PoolClient) {
    const result = await transaction.query<{
      id: string;
      status: string;
      total: number;
      userId: string;
      isUnexpired: boolean;
      qrAttempts: number;
    }>(
      `SELECT id, status, total, user_id AS "userId", qr_attempts AS "qrAttempts",
               (expires_at > now() AND qr_expires_at > now()) AS "isUnexpired"
       FROM orders
        WHERE id = $1 OR payment_code = $1
       FOR UPDATE`,
      [orderId],
    );
    return result.rows[0] ?? null;
  }

  async insertProcessingPayment(
    orderId: string,
    paymentId: string,
    idempotencyKey: string,
    payloadHash: string,
    amount: number,
    providerTransactionId: string,
    providerReference: string | null,
    payload: unknown,
    transaction: PoolClient,
  ): Promise<void> {
    await transaction.query(
      `INSERT INTO payments
         (id, order_id, idempotency_key, payload_hash, amount, method,
          status, provider, provider_transaction_id, provider_reference,
          provider_payload)
        VALUES ($1, $2, $3, $4, $5, 'SEPAY', 'PROCESSING', 'SEPAY', $6, $7, $8::jsonb)`,
      [
        paymentId,
        orderId,
        idempotencyKey,
        payloadHash,
        amount,
        providerTransactionId,
        providerReference,
        JSON.stringify(payload),
      ],
    );
  }

  async findProcessingPayment(orderId: string, transaction: PoolClient) {
    const result = await transaction.query<{ id: string; method: string }>(
      "SELECT id, method FROM payments WHERE order_id = $1 AND status = 'PROCESSING'",
      [orderId],
    );
    return result.rows[0] ?? null;
  }

  async settleSession(
    paymentId: string,
    providerTransactionId: string,
    providerReference: string | null,
    payload: SepayWebhookPayload,
    transaction: PoolClient,
  ): Promise<void> {
    await transaction.query(
      `UPDATE payments SET status = 'SUCCEEDED', resolved_at = now(),
         provider = 'SEPAY', provider_transaction_id = $2, provider_reference = $3,
         provider_payload = $4::jsonb, webhook_received_at = now()
       WHERE id = $1 AND status = 'PROCESSING' AND method = 'SEPAY'`,
      [
        paymentId,
        providerTransactionId,
        providerReference,
        JSON.stringify(payload),
      ],
    );
  }

  async markPaymentSucceeded(
    paymentId: string,
    transaction: PoolClient,
  ): Promise<void> {
    await transaction.query(
      `UPDATE payments
       SET status = 'SUCCEEDED',
           resolved_at = now(),
           webhook_received_at = now()
       WHERE id = $1 AND status = 'PROCESSING'`,
      [paymentId],
    );
  }

  async markOrderPaid(orderId: string, transaction: PoolClient): Promise<void> {
    await transaction.query(
      `UPDATE orders
       SET status = 'PAID'
       WHERE id = $1 AND status = 'PENDING'`,
      [orderId],
    );
  }

  async insertEarn(
    userId: string,
    orderId: string,
    points: number,
    transaction: PoolClient,
  ): Promise<void> {
    await transaction.query(
      `INSERT INTO loyalty_transactions (id, user_id, order_id, type, points)
       VALUES ($1, $2, $3, 'EARN', $4)`,
      [randomUUID(), userId, orderId, points],
    );
  }
}

// TV6 — Quy tắc trạng thái đơn, KHỚP trigger guard_order_change trong 002_integrity.sql.
// Đổi bảng chuyển ở đây thì phải có migration 004 tương ứng (và ngược lại).
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { CustomerOrderModel } from "../models/customer-order.model.js";
import type { OrderStatus, PoolClient } from "../types/contracts.js";

export const ORDER_TRANSITIONS: Readonly<
  Record<OrderStatus, readonly OrderStatus[]>
> = {
  PENDING: ["PAID", "PAYMENT_FAILED", "CANCELLED"],
  PAYMENT_FAILED: ["PENDING", "CANCELLED"],
  PAID: ["PREPARING"],
  PREPARING: ["READY"],
  READY: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

const PAID_STATES: readonly OrderStatus[] = [
  "PAID",
  "PREPARING",
  "READY",
  "COMPLETED",
];

@Injectable()
export class OrderStateService {
  constructor(
    @Inject(CustomerOrderModel) private readonly orders: CustomerOrderModel,
  ) {}

  allowedNext(from: OrderStatus): readonly OrderStatus[] {
    return ORDER_TRANSITIONS[from] ?? [];
  }

  /** Chuyển về cùng trạng thái cũng không hợp lệ (thường là dấu hiệu tranh chấp). */
  canTransition(from: OrderStatus, to: OrderStatus): boolean {
    return this.allowedNext(from).includes(to);
  }

  /** Ném 409 nếu cạnh chuyển không có trong bảng. */
  assertTransition(from: OrderStatus, to: OrderStatus): void {
    if (!this.canTransition(from, to)) {
      throw new ConflictException(`Không thể chuyển đơn từ ${from} sang ${to}`);
    }
  }

  /** Đã thanh toán thành công (kể cả các bước chuẩn bị/giao). */
  isPaid(status: OrderStatus): boolean {
    return PAID_STATES.includes(status);
  }

  /**
   * Gợi ý cho UI: được hủy khi PENDING/PAYMENT_FAILED và không còn payment PROCESSING.
   * Quyết định thật nằm ở TV4 (POST /orders/:id/cancel).
   */
  canCancel(status: OrderStatus, hasProcessingPayment: boolean): boolean {
    return !hasProcessingPayment && this.canTransition(status, "CANCELLED");
  }

  /** Gợi ý cho UI: chỉ đơn PAYMENT_FAILED mới có nút thử lại (luồng TV5/TV4). */
  canRetryPayment(status: OrderStatus): boolean {
    return status === "PAYMENT_FAILED";
  }

  /**
   * Đổi trạng thái trong transaction ĐANG MỞ của người gọi (TV4/TV5 truyền PoolClient).
   * Khóa dòng đơn → kiểm tra cạnh → UPDATE có điều kiện.
   *
   * Lưu ý: hàm này KHÔNG thay việc kèm theo của từng cạnh; DB kiểm tra lúc COMMIT:
   *  - → PAID: phải có đúng 1 Payment SUCCEEDED và đúng 1 EARN (TV5) trong cùng transaction.
   *  - → CANCELLED / PAYMENT_FAILED: phải có stock_released = true (TV4) và không còn
   *    Payment PROCESSING; PAYMENT_FAILED cần attempt FAILED.
   * Không tự commit/rollback, không đụng tồn kho hay điểm.
   */
  async transitionOrder(
    client: PoolClient,
    orderId: string,
    to: OrderStatus,
  ): Promise<OrderStatus> {
    const from = await this.orders.lockStatus(client, orderId);
    if (!from) throw new NotFoundException("Không tìm thấy đơn hàng");
    this.assertTransition(from, to);
    const changed = await this.orders.updateStatus(client, orderId, from, to);
    if (!changed) {
      throw new ConflictException("Trạng thái đơn vừa thay đổi, hãy tải lại");
    }
    return from;
  }
}

import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { dataSource } from "../config/environment.js";
import { OrdersService } from "./orders.service.js";

const INTERVAL_MS = 5_000; // kiểm tra mỗi 5 giây để hoàn tồn sớm sau QR thứ hai

@Injectable()
export class OrderExpiryJob implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(@Inject(OrdersService) private readonly ordersService: OrdersService) {}

  onModuleInit() {
    if (dataSource() === "sample") {
      return; // chế độ sample không có DB
    }
    this.timer = setInterval(() => void this.run(), INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer !== null) {
      clearInterval(this.timer);
    }
  }

  private async run() {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.ordersService.expirePendingOrders();
    } catch (error) {
      console.error("Job hết hạn đơn lỗi", error);
    } finally {
      this.running = false;
    }
  }
}

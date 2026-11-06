import { SYSTEM_ROUTES } from "../../routes/system.routes.js";
// TV6 — Kiểm tra API và DB; lỗi DB trả 503, không báo healthy giả.
import {
  Inject,
  Controller,
  Get,
  ServiceUnavailableException,
} from "@nestjs/common";
import { DatabaseService } from "../../config/db.js";
import { dataSource } from "../../config/environment.js";
@Controller(SYSTEM_ROUTES.health.base)
export class HealthController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  @Get(SYSTEM_ROUTES.health.check) async checkHealth() {
    if (dataSource() === "sample")
      return { status: "ok", dataSource: "sample", database: "not-checked" };
    try {
      await this.db.ping();
      return { status: "ok", dataSource: "postgres", database: "up" };
    } catch {
      throw new ServiceUnavailableException("Database chưa sẵn sàng");
    }
  }
}

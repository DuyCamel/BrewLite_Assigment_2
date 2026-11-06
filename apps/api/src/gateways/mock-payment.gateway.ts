import { Injectable } from "@nestjs/common";

type GatewayResult = "SUCCESS" | "FAILED" | "TIMEOUT";

// TV5 — Cổng mô phỏng, KHÔNG tích hợp tiền thật.
@Injectable()
export class MockPaymentGateway {
  // Lưu kết quả cuối in-memory; TIMEOUT chỉ là kết quả phía client, không phải kết quả gateway.
  private readonly mockStore = new Map<string, "SUCCESS" | "FAILED">();
  private readonly inFlight = new Map<string, Promise<GatewayResult>>();

  async charge(
    orderId: string,
    amount: number,
    method: "WALLET" | "CARD",
    key: string,
  ): Promise<"SUCCESS" | "FAILED" | "TIMEOUT"> {
    if (this.mockStore.has(key)) {
      return this.mockStore.get(key)!;
    }
    const activeCharge = this.inFlight.get(key);
    if (activeCharge) return activeCharge;
    const charge = this.processCharge(key);
    this.inFlight.set(key, charge);
    try {
      return await charge;
    } finally {
      if (this.inFlight.get(key) === charge) this.inFlight.delete(key);
    }
  }

  private async processCharge(key: string): Promise<GatewayResult> {
    // Giả lập network delay 1.5s
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Timeout mô phỏng gateway đã xử lý nhưng phản hồi không về kịp; reconcile lấy kết quả cuối.
    const rand = Math.random();
    const timedOut = rand > 0.9;
    const result = rand > 0.8 && !timedOut ? "FAILED" : "SUCCESS";
    this.mockStore.set(key, result);
    return timedOut ? "TIMEOUT" : result;
  }

  async lookupByKey(
    key: string,
  ): Promise<"SUCCESS" | "FAILED" | "TIMEOUT" | "NOT_FOUND"> {
    return this.mockStore.get(key) || "NOT_FOUND";
  }
}
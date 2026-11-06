export interface SepayWebhookPayload {
  id: number;
  gateway: string;
  transactionDate: string;
  accountNumber: string;
  subAccount?: string | null;
  code?: string | null;
  content: string;
  transferType: "in" | "out";
  description?: string | null;
  transferAmount: number;
  accumulated?: number | null;
  referenceCode?: string | null;
}

export interface SepayWebhookResult {
  accepted: true;
  duplicate: boolean;
  paymentId: string;
  orderId: string;
  status: "PAID";
}

export interface Promotion {
  id: string;
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  active: boolean;
  starts_at: Date;
  ends_at: Date;
  minimum_amount: number;
}

import "server-only";
export interface PaymentProvider {
  readonly name: string;
  create(input: {
    orderId: string;
    amount: number;
    currency: "PKR";
  }): Promise<{ status: "unpaid"; reference: string }>;
}
export const cashOnDelivery: PaymentProvider = {
  name: "cod",
  async create({ orderId }) {
    return { status: "unpaid", reference: orderId };
  },
};
// COD is persisted atomically by the checkout function. No online provider is enabled.
// A future provider must verify signed webhooks and unique provider event IDs before
// recording payments; merely returning from a checkout URL must never mark payment paid.

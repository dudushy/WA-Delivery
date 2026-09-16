import { z } from 'zod';

export const pricingCategorySchema = z.enum(['marketing', 'utility', 'authentication']);
export type PricingCategory = z.infer<typeof pricingCategorySchema>;

export const estimateInputSchema = z.object({
  recipients: z.number().int().min(1).max(1_000_000),
  category: pricingCategorySchema,
  market: z.literal('BR'),
});

export const BRAZIL_RATE_CARD = {
  market: 'BR' as const,
  currency: 'BRL',
  effectiveFrom: '2026-07-01',
  sourceUrl: 'https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing',
  rates: {
    marketing: 0.3217,
    utility: 0.035,
    authentication: 0.035,
  } satisfies Record<PricingCategory, number>,
};

export function estimateCost(recipients: number, category: PricingCategory) {
  const unitPrice = BRAZIL_RATE_CARD.rates[category];
  const estimatedTotal = Number((recipients * unitPrice).toFixed(2));
  return {
    recipients,
    category,
    market: BRAZIL_RATE_CARD.market,
    currency: BRAZIL_RATE_CARD.currency,
    unitPrice,
    estimatedTotal,
    effectiveFrom: BRAZIL_RATE_CARD.effectiveFrom,
    sourceUrl: BRAZIL_RATE_CARD.sourceUrl,
    disclaimer: 'Estimativa para mensagens entregues. O valor final depende da classificação aprovada pela Meta, do país do destinatário, de descontos por volume e de alterações da tabela.',
  };
}

import { z } from 'zod';

/** All money is integer paise. Format to ₹ (en-IN) only at the UI edge. */
export const Paise = z.number().int();
export const PositivePaise = z.number().int().positive();
export const NonNegativePaise = z.number().int().nonnegative();
/** Rates in basis points: 1600 = 16.00% */
export const Bps = z.number().int().nonnegative();

export const Id = z.string().min(1);
export const IsoDateTime = z.iso.datetime({ offset: true });
export const IsoDate = z.iso.date();

export const ErrorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;

export const Ok = z.object({ ok: z.literal(true) });

export const ServiceName = z.enum(['cred', 'admin', 'shop', 'ecosystem', 'cred-api', 'ecosystem-api']);
export type ServiceName = z.infer<typeof ServiceName>;

export const ServiceStatus = z.object({
  service: ServiceName,
  ok: z.boolean(),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  demoMode: z.boolean(),
  db: z.enum(['ok', 'error', 'none']),
  simDate: IsoDate.nullable(),
  time: IsoDateTime,
});
export type ServiceStatus = z.infer<typeof ServiceStatus>;

export const Masked = z.string().regex(/^[X•*\d\s-]+$/);

export const Pagination = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

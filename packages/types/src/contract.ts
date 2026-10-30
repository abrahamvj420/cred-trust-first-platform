import type { z } from 'zod';

/**
 * Every HTTP endpoint is declared here first. Services register routes only
 * through a contract, so an endpoint cannot exist without its schema.
 */
export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/**
 * - member:  Bearer session token issued by cred-api
 * - admin:   CRED internal console
 * - partner: CRED calling ecosystem-api (x-partner-key)
 * - merchant: ShopKart calling the gateway (x-merchant-key)
 * - page:    an ecosystem-branded page acting for the person on it (OTP, PIN, consent)
 * - webhook: HMAC-signed partner event
 * - demo:    /sim/* and control room only; refused unless DEMO_MODE=true
 * - none:    public
 */
export type EndpointAuth = 'member' | 'admin' | 'partner' | 'merchant' | 'page' | 'webhook' | 'demo' | 'none';

export interface Endpoint<
  P extends z.ZodType = z.ZodType,
  Q extends z.ZodType = z.ZodType,
  B extends z.ZodType = z.ZodType,
  R extends z.ZodType = z.ZodType,
> {
  method: HttpMethod;
  path: string;
  auth: EndpointAuth;
  summary: string;
  params?: P;
  query?: Q;
  body?: B;
  response: R;
  /** Server-sent events stream; response describes one event. */
  stream?: boolean;
}

/** Declares an endpoint, keeping its exact shape so handlers get precise types. */
export function endpoint<const E extends Endpoint>(e: E): E {
  return e;
}

type Infer<T> = T extends z.ZodType ? z.infer<T> : never;
export type EndpointParams<E> = E extends { params: infer P } ? Infer<P> : Record<string, never>;
export type EndpointQuery<E> = E extends { query: infer Q } ? Infer<Q> : Record<string, never>;
export type EndpointBody<E> = E extends { body: infer B } ? Infer<B> : undefined;
/** Body as a caller writes it (before defaults). */
export type EndpointBodyInput<E> = E extends { body: infer B extends z.ZodType } ? z.input<B> : undefined;
export type EndpointQueryInput<E> = E extends { query: infer Q extends z.ZodType } ? z.input<Q> : undefined;
/** Parsed (output) type of the response. */
export type EndpointResponse<E> = E extends { response: infer R } ? Infer<R> : never;
/** What a handler may return: the schema's input type (defaults applied on parse). */
export type EndpointResponseInput<E> = E extends { response: infer R extends z.ZodType } ? z.input<R> : never;
export type IsStream<E> = E extends { stream: true } ? true : false;

/** Flattens a nested contract map into a list, for route-coverage checks. */
export function listEndpoints(tree: object): Endpoint[] {
  const out: Endpoint[] = [];
  for (const value of Object.values(tree)) {
    if (value && typeof value === 'object' && 'method' in value && 'path' in value && 'response' in value) {
      out.push(value as Endpoint);
    } else if (value && typeof value === 'object') {
      out.push(...listEndpoints(value));
    }
  }
  return out;
}

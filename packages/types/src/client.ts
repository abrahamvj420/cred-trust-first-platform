import type { Endpoint, EndpointBodyInput, EndpointParams, EndpointQueryInput, EndpointResponse } from './contract';
import { ErrorResponse } from './common';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export interface CallInput<E> {
  params?: EndpointParams<E>;
  query?: EndpointQueryInput<E>;
  body?: EndpointBodyInput<E>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export function buildPath(path: string, params: Record<string, unknown> = {}): string {
  return path.replace(/:(\w+)/g, (_, name: string) => {
    const v = params[name];
    if (v === undefined || v === null) throw new Error(`Missing path param ${name} for ${path}`);
    return encodeURIComponent(String(v));
  });
}

/**
 * Typed call to a contract endpoint. Validates the response against the
 * contract, so a caller never sees data the contract doesn't promise.
 */
export async function call<E extends Endpoint>(baseUrl: string, endpoint: E, input: CallInput<E> = {}): Promise<EndpointResponse<E>> {
  let url = baseUrl.replace(/\/$/, '') + buildPath(endpoint.path, input.params as Record<string, unknown>);
  if (input.query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(input.query as Record<string, unknown>)) if (v !== undefined && v !== null) qs.set(k, String(v));
    if ([...qs].length) url += `?${qs}`;
  }
  const hasBody = input.body !== undefined;
  const res = await fetch(url, {
    method: endpoint.method,
    headers: { ...(hasBody ? { 'content-type': 'application/json' } : {}), ...input.headers },
    body: hasBody ? JSON.stringify(input.body) : undefined,
    cache: 'no-store',
    signal: input.signal,
  });
  const text = await res.text();
  const json: unknown = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const err = ErrorResponse.safeParse(json);
    if (err.success) throw new ApiError(res.status, err.data.error.code, err.data.error.message, err.data.error.details);
    throw new ApiError(res.status, 'http_error', `${endpoint.method} ${endpoint.path} failed with ${res.status}`);
  }
  return endpoint.response.parse(json) as EndpointResponse<E>;
}

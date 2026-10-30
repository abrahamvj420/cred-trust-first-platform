import { call, type CallInput, type Endpoint, type EndpointResponse } from '@cred/types';

/** Ecosystem pages talk only to ecosystem-api. */
export const ecosystem = <E extends Endpoint>(endpoint: E, input?: CallInput<E>): Promise<EndpointResponse<E>> =>
  call(process.env.NEXT_PUBLIC_ECOSYSTEM_API_URL ?? 'http://localhost:4100', endpoint, input);

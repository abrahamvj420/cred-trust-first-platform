import { call, type CallInput, type Endpoint, type EndpointResponse } from '@cred/types';

export const CRED_API = process.env.NEXT_PUBLIC_CRED_API_URL ?? 'http://localhost:4000';

/** The console calls only cred-api (plus the documented control-room exception). */
export const credAdmin = <E extends Endpoint>(endpoint: E, input?: CallInput<E>): Promise<EndpointResponse<E>> => call(CRED_API, endpoint, input);

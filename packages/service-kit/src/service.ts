import cors from '@fastify/cors';
import {
  ApiError,
  type Endpoint,
  type EndpointAuth,
  type EndpointBody,
  type EndpointParams,
  type EndpointQuery,
  type EndpointResponseInput,
  type IsStream,
  listEndpoints, localUrl, PORTS, type ServiceName, type ServiceStatus } from '@cred/types';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { isDemoMode } from './env';
import { HttpError } from './errors';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string;
  }
}

export interface HandlerInput<E extends Endpoint, A> {
  params: EndpointParams<E>;
  query: EndpointQuery<E>;
  body: EndpointBody<E>;
  auth: A;
  req: FastifyRequest;
  reply: FastifyReply;
}

export type Handler<E extends Endpoint, A = unknown> = (
  input: HandlerInput<E, A>,
) => Promise<IsStream<E> extends true ? void : EndpointResponseInput<E>>;

/** Resolves the caller for each auth kind; throw HttpError to reject. */
export type Authenticators = Partial<Record<EndpointAuth, (req: FastifyRequest) => Promise<unknown> | unknown>>;

export interface ServiceOptions {
  name: Extract<ServiceName, 'cred-api' | 'ecosystem-api'>;
  version: string;
  checkDb: () => Promise<boolean>;
  simDate: () => Promise<string | null>;
  authenticators: Authenticators;
}

const APP_ORIGINS = (['cred', 'admin', 'shop', 'ecosystem'] as const).map(localUrl);

export function createService(opts: ServiceOptions) {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info', transport: undefined } });
  const startedAt = Date.now();
  const registered = new Set<string>();

  app.register(cors, { origin: APP_ORIGINS, credentials: true, methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] });

  // Keep the raw body: webhook signatures are computed over the exact bytes.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    req.rawBody = body as string;
    if (!body) return done(null, undefined);
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(new HttpError(400, 'invalid_json', 'Body is not valid JSON'), undefined);
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    // A partner refused (4xx): pass its reason through. A partner failure (5xx/unreachable) is a 502.
    if (err instanceof ApiError) {
      if (err.status >= 400 && err.status < 500) {
        return reply.status(err.status).send({ error: { code: err.code, message: err.message } });
      }
      req.log.error(err);
      return reply.status(502).send({ error: { code: 'partner_unavailable', message: 'A partner service is unavailable. Please try again.' } });
    }
    if (err instanceof z.ZodError) {
      return reply.status(400).send({ error: { code: 'validation_failed', message: 'Request failed validation', details: z.treeifyError(err) } });
    }
    req.log.error(err);
    return reply.status(500).send({ error: { code: 'internal', message: 'Something went wrong' } });
  });

  app.setNotFoundHandler((req, reply) =>
    reply.status(404).send({ error: { code: 'no_such_endpoint', message: `${req.method} ${req.url} is not in the contract` } }),
  );

  /**
   * The only way to add a route: from a contract in @cred/types. Inputs are
   * parsed with the contract's schemas and outputs are validated before sending.
   */
  function route<E extends Endpoint, A = unknown>(endpoint: E, handler: Handler<E, A>): void {
    const key = `${endpoint.method} ${endpoint.path}`;
    if (registered.has(key)) throw new Error(`Route registered twice: ${key}`);
    registered.add(key);

    app.route({
      method: endpoint.method,
      url: endpoint.path,
      handler: async (req, reply) => {
        if (endpoint.auth === 'demo' && !isDemoMode()) {
          throw new HttpError(403, 'demo_mode_off', '/sim endpoints are only available when DEMO_MODE=true');
        }
        const authFn = opts.authenticators[endpoint.auth];
        if (!authFn && endpoint.auth !== 'none' && endpoint.auth !== 'demo') {
          throw new Error(`No authenticator for auth kind "${endpoint.auth}" (${key})`);
        }
        const auth = authFn ? await authFn(req) : undefined;
        const input = {
          params: endpoint.params ? endpoint.params.parse(req.params) : {},
          query: endpoint.query ? endpoint.query.parse(req.query) : {},
          body: endpoint.body ? endpoint.body.parse(req.body) : undefined,
          auth,
          req,
          reply,
        } as HandlerInput<E, A>;

        const result = await handler(input);
        if (endpoint.stream) return reply;
        const checked = endpoint.response.safeParse(result);
        if (!checked.success) {
          req.log.error({ issues: checked.error.issues, endpoint: key }, 'response failed contract validation');
          throw new HttpError(500, 'contract_violation', `Response for ${key} does not match its contract`);
        }
        return checked.data;
      },
    });
  }

  /**
   * Registers every endpoint in a contract tree. Endpoints without a handler
   * yet answer 501, so the full API surface exists and matches the contract.
   */
  function implement(tree: object, handlers: Map<Endpoint, Handler<any, any>>): void {
    for (const e of listEndpoints(tree)) {
      const h = handlers.get(e);
      route(
        e,
        h ??
          (async () => {
            throw new HttpError(501, 'not_implemented', `${e.method} ${e.path} is defined but not implemented yet`);
          }),
      );
    }
  }

  async function status(): Promise<ServiceStatus> {
    let db: ServiceStatus['db'] = 'error';
    try {
      db = (await opts.checkDb()) ? 'ok' : 'error';
    } catch {
      db = 'error';
    }
    return {
      service: opts.name,
      ok: db === 'ok',
      version: opts.version,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      demoMode: isDemoMode(),
      db,
      simDate: await opts.simDate().catch(() => null),
      time: new Date().toISOString(),
    };
  }

  async function listen(): Promise<void> {
    await app.listen({ port: Number(process.env.PORT ?? PORTS[opts.name]), host: '127.0.0.1' });
  }

  return { app: app as FastifyInstance, route, implement, status, listen };
}

/** Helper for building the handler map with types preserved per endpoint. */
export function handlers() {
  const map = new Map<Endpoint, Handler<any, any>>();
  return {
    on<E extends Endpoint, A = unknown>(endpoint: E, handler: Handler<E, A>) {
      map.set(endpoint, handler);
      return this;
    },
    map,
  };
}

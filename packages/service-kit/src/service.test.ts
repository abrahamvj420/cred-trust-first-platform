import { endpoint } from '@cred/types';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createService, handlers } from './service';

const echo = endpoint({
  method: 'POST',
  path: '/echo/:id',
  auth: 'none',
  summary: 'test',
  params: z.object({ id: z.string() }),
  body: z.object({ n: z.number().int() }),
  response: z.object({ id: z.string(), doubled: z.number() }),
});
const liar = endpoint({ method: 'GET', path: '/liar', auth: 'none', summary: 'test', response: z.object({ ok: z.literal(true) }) });
const sim = endpoint({ method: 'POST', path: '/sim/x', auth: 'demo', summary: 'test', response: z.object({ ok: z.literal(true) }) });
const todo = endpoint({ method: 'GET', path: '/todo', auth: 'none', summary: 'test', response: z.object({}) });

function make() {
  const svc = createService({ name: 'cred-api', version: 't', checkDb: async () => true, simDate: async () => null, authenticators: {} });
  svc.implement(
    { echo, liar, sim, todo },
    handlers()
      .on(echo, async ({ params, body }) => ({ id: params.id, doubled: body.n * 2 }))
      .on(liar, async () => ({ ok: false }) as never)
      .on(sim, async () => ({ ok: true as const })).map,
  );
  return svc.app;
}

const env = process.env.DEMO_MODE;
afterEach(() => {
  process.env.DEMO_MODE = env;
});

describe('service-kit', () => {
  it('validates input and returns typed output', async () => {
    const res = await make().inject({ method: 'POST', url: '/echo/a', payload: { n: 21 } });
    expect(res.json()).toEqual({ id: 'a', doubled: 42 });
  });
  it('rejects invalid input with 400', async () => {
    const res = await make().inject({ method: 'POST', url: '/echo/a', payload: { n: 'x' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('validation_failed');
  });
  it('refuses responses that break the contract', async () => {
    const res = await make().inject({ method: 'GET', url: '/liar' });
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('contract_violation');
  });
  it('answers 501 for contract endpoints without a handler', async () => {
    expect((await make().inject({ method: 'GET', url: '/todo' })).statusCode).toBe(501);
  });
  it('answers 404 for routes outside the contract', async () => {
    expect((await make().inject({ method: 'GET', url: '/nope' })).statusCode).toBe(404);
  });
  it('blocks /sim unless DEMO_MODE=true', async () => {
    process.env.DEMO_MODE = 'false';
    expect((await make().inject({ method: 'POST', url: '/sim/x' })).statusCode).toBe(403);
    process.env.DEMO_MODE = 'true';
    expect((await make().inject({ method: 'POST', url: '/sim/x' })).statusCode).toBe(200);
  });
});

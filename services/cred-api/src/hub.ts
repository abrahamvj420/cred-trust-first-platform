import { randomUUID } from 'node:crypto';
import { localUrl, AdminStreamEvent, MemberStreamEvent } from '@cred/types';
import type { FastifyReply } from '@cred/service-kit';
import type { ServerResponse } from 'node:http';

type Without<T> = T extends unknown ? Omit<T, 'id' | 'at'> : never;
const ALLOWED = new Set((['cred', 'admin', 'shop', 'ecosystem'] as const).map(localUrl));

/** Server-sent events to member apps (per member) and the admin console. */
export class Hub {
  private members = new Map<string, Set<ServerResponse>>();
  private admins = new Set<ServerResponse>();

  private open(reply: FastifyReply, set: Set<ServerResponse>): void {
    const origin = reply.request.headers.origin;
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
      ...(origin && ALLOWED.has(origin) ? { 'access-control-allow-origin': origin, vary: 'origin' } : {}),
    });
    res.write(': connected\n\n');
    set.add(res);
    const beat = setInterval(() => res.write(': heartbeat\n\n'), 15_000);
    res.on('close', () => {
      clearInterval(beat);
      set.delete(res);
    });
  }

  openMember(memberId: string, reply: FastifyReply): void {
    const set = this.members.get(memberId) ?? new Set();
    this.members.set(memberId, set);
    this.open(reply, set);
  }

  openAdmin(reply: FastifyReply): void {
    this.open(reply, this.admins);
  }

  private write(set: Iterable<ServerResponse>, payload: unknown): void {
    const frame = `data: ${JSON.stringify(payload)}\n\n`;
    for (const res of set) res.write(frame);
  }

  member(memberId: string, event: Without<MemberStreamEvent>): void {
    const full = MemberStreamEvent.parse({ ...event, id: randomUUID(), at: new Date().toISOString() });
    this.write(this.members.get(memberId) ?? [], full);
  }

  admin(event: Without<AdminStreamEvent>): void {
    this.write(this.admins, AdminStreamEvent.parse({ ...event, id: randomUUID(), at: new Date().toISOString() }));
  }
}

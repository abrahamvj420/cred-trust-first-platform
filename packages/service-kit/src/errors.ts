export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, 'not_found', `${what} not found`);
export const unauthorized = (msg = 'Not signed in') => new HttpError(401, 'unauthorized', msg);
export const forbidden = (msg: string) => new HttpError(403, 'forbidden', msg);
export const conflict = (code: string, msg: string) => new HttpError(409, code, msg);

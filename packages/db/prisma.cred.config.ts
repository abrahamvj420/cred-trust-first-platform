import path from 'node:path';
import { defineConfig } from 'prisma/config';

const here = import.meta.dirname ?? process.cwd();

export default defineConfig({
  schema: path.join(here, 'prisma/cred/schema.prisma'),
  datasource: {
    url: process.env.CRED_DATABASE_URL ?? 'file:' + path.join(here, 'data/cred.db'),
  },
});

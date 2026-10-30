import path from 'node:path';
import { defineConfig } from 'prisma/config';

const here = import.meta.dirname ?? process.cwd();

export default defineConfig({
  schema: path.join(here, 'prisma/ecosystem/schema.prisma'),
  datasource: {
    url: process.env.ECOSYSTEM_DATABASE_URL ?? 'file:' + path.join(here, 'data/ecosystem.db'),
  },
});

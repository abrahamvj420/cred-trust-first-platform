/**
 * Enforces the CLAUDE.md non-negotiables that a type checker can't:
 * who may import what, contract-only routes, the /sim exception, and
 * theme-only styling. Run by `pnpm test` (and `pnpm check:boundaries`).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const SKIP = new Set(['node_modules', '.next', '.turbo', 'generated', 'dist']);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|css|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

interface Rule {
  name: string;
  files: string[];
  pattern: RegExp | ((line: string) => boolean);
  allow?: (rel: string) => boolean;
}

const files = (dir: string) => walk(path.join(root, dir));
const isSource = (f: string) => /\.(ts|tsx)$/.test(f);
const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black';

const rules: Rule[] = [
  {
    name: 'Front-ends call only their API: no database or engine imports in apps',
    files: files('apps').filter(isSource),
    pattern: /from ['"]@cred\/(db|engine)(\/[^'"]*)?['"]/,
  },
  {
    name: 'CRED never reads the ecosystem database',
    files: files('services/cred-api').filter(isSource),
    pattern: /from ['"]@cred\/db\/ecosystem['"]/,
  },
  {
    name: 'The ecosystem has no access to CRED’s database or engine',
    files: files('services/ecosystem-api').filter(isSource),
    pattern: /from ['"]@cred\/(db\/cred|engine)['"]/,
  },
  {
    name: 'Routes come only from contracts (use svc.implement / svc.route)',
    files: [...files('services/cred-api'), ...files('services/ecosystem-api')].filter(isSource),
    pattern: /\b(app|fastify|server)\.(get|post|put|patch|delete|route)\(/,
  },
  {
    name: 'Only the admin control room may call /sim (DEMO_MODE exception)',
    files: files('apps').filter(isSource),
    pattern: /['"`]\/sim\//,
    allow: (rel) => /^apps\/admin\/app\/(demo|api\/demo)\//.test(rel),
  },
  {
    name: 'Apps use only their brand theme: no hex colours',
    files: files('apps'),
    pattern: /#[0-9a-fA-F]{3,8}\b/,
  },
  {
    name: 'Apps use only their brand theme: no Tailwind palette or arbitrary colours',
    files: files('apps').filter(isSource),
    pattern: new RegExp(`\\b(bg|text|border|ring|fill|stroke|from|to|via|outline|divide)-(${PALETTE})(-\\d{2,3})?\\b|\\b(bg|text|border)-\\[(#|rgb|hsl)`),
  },
  {
    // Member copy is supportive: these stay in admin's reason codes (engine copy is unit-tested too).
    name: 'Member app text never says "stress", "risk" or "blocked"',
    files: files('apps/cred').filter(isSource),
    pattern: (line) => {
      const banned = /stress|risk|blocked/i;
      // String literals, matched left to right so neighbouring strings pair up correctly
      const literals = line.match(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g) ?? [];
      // JSX text between tags
      const jsxText = line.match(/>[^<>{}]+</g) ?? [];
      return [...literals, ...jsxText].some((t) => banned.test(t));
    },
  },
  {
    name: 'Apps use only their brand theme: no ad-hoc fonts',
    files: files('apps'),
    pattern: /font-family\s*:|fontFamily\s*:/,
  },
];

let failures = 0;
for (const rule of rules) {
  const hits: string[] = [];
  for (const file of rule.files) {
    const rel = path.relative(root, file);
    if (rule.allow?.(rel)) continue;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        const hit = typeof rule.pattern === 'function' ? rule.pattern(line) : rule.pattern.test(line);
        if (hit) hits.push(`  ${rel}:${i + 1}  ${line.trim()}`);
      });
  }
  if (hits.length) {
    failures += hits.length;
    console.error(`✗ ${rule.name}\n${hits.join('\n')}`);
  } else {
    console.log(`✓ ${rule.name}`);
  }
}

if (failures) {
  console.error(`\n${failures} boundary violation(s).`);
  process.exit(1);
}

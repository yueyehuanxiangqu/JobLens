import { readFileSync } from 'node:fs';
import { zhCN } from '../src/i18n/catalog.js';

const files = [
  'src/sidepanel/app.js',
  'src/background/service-worker.js',
  'src/background/match-engine.js',
  'src/shared/diagnostics.js',
  'src/shared/provider-profiles.js',
];

for (const file of files) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const literals = [...source.matchAll(/'((?:\\.|[^'\\])*)'/g)].map(match => match[1]);
  const missing = [...new Set(literals)]
    .filter(value => /[A-Za-z]{3}/.test(value) && /\s/.test(value) && !/[<>={}\/\\]/.test(value))
    .filter(value => !zhCN[value]);
  process.stdout.write(`\n${file}\n${missing.join('\n')}\n`);
}

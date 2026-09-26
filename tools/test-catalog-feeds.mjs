import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installCatalogFeeds, pinnedFeedsConfig } from './install-catalog-feeds.mjs';

const inputs = { schema: 1, sourceCommit: 'a'.repeat(40), feeds: [
  { name: 'first', method: 'src-git', options: ['--force'], url: 'https://example.invalid/feed.git', commit: 'b'.repeat(40) },
  { name: 'second', method: 'src-git-full', options: [], url: 'https://example.invalid/other.git', commit: 'c'.repeat(40) },
] };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const config = pinnedFeedsConfig(inputs, inputs.sourceCommit, hash(inputs));
assert.equal(config, `src-git --force first https://example.invalid/feed.git^${'b'.repeat(40)}\nsrc-git-full second https://example.invalid/other.git^${'c'.repeat(40)}\n`);
assert.throws(() => pinnedFeedsConfig(inputs, 'd'.repeat(40), hash(inputs)), /identity/);
assert.throws(() => pinnedFeedsConfig(null, inputs.sourceCommit, ''), /identity/);
for (const change of [
  value => { value.feeds[0].name = '../escape'; },
  value => { value.feeds[1].name = 'first'; },
  value => { value.feeds[0].commit = 'master'; },
  value => { value.feeds[0].url = 'https://user:password@example.invalid/feed'; },
  value => { value.feeds[0].url += ';master'; },
  value => { value.feeds[0].options = ['--force;echo']; },
]) {
  const value = structuredClone(inputs); change(value);
  assert.throws(() => pinnedFeedsConfig(value, value.sourceCommit, hash(value)));
}
const directory = mkdtempSync(join(tmpdir(), 'catalog-feeds-test-'));
try {
  const calls = [];
  const run = (command, args) => {
    calls.push([command, ...args]);
    if (command === 'git') return args[0] === 'rev-parse' ? inputs.sourceCommit :
      inputs.feeds.find(feed => args[1] === `feeds/${feed.name}`).commit;
    return '';
  };
  const receipt = { buildInputs: inputs, inputsHash: hash(inputs) };
  installCatalogFeeds(directory, receipt, run);
  assert.equal(readFileSync(join(directory, 'feeds.conf'), 'utf8'), config);
  assert.deepEqual(calls.filter(call => call[0] === 'perl'), [
    ['perl', './scripts/feeds', 'update', '-a'], ['perl', './scripts/feeds', 'install', '-a'],
  ]);
  let installed = false;
  assert.throws(() => installCatalogFeeds(directory, receipt, (command, args) => {
    if (args.includes('install')) installed = true;
    return command === 'git' && args[0] === 'rev-parse' ? inputs.sourceCommit : 'e'.repeat(40);
  }), /checkout mismatch/);
  assert.equal(installed, false);
} finally { rmSync(directory, { recursive: true, force: true }); }
console.log('Exact Catalog feeds identity, ordered upstream install and mismatch tests passed');

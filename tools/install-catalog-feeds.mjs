#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function pinnedFeedsConfig(inputs, expectedCommit, expectedHash) {
  if (inputs?.schema !== 1 || !/^[a-f0-9]{40}$/.test(inputs.sourceCommit || '') ||
      inputs.sourceCommit !== expectedCommit || !Array.isArray(inputs.feeds) ||
      createHash('sha256').update(JSON.stringify(inputs)).digest('hex') !== expectedHash) {
    throw new Error('Catalog feed input identity is missing or invalid; re-import the configuration with a complete current snapshot');
  }
  const seen = new Set();
  return inputs.feeds.map((feed) => {
    if (!/^\w+$/.test(feed.name || '') || seen.has(feed.name) ||
        !['src-git', 'src-git-full'].includes(feed.method) ||
        !/^[a-f0-9]{40}$/.test(feed.commit || '') || !Array.isArray(feed.options) ||
        feed.options.some((option) => !/^--[\w-]+(?:=[\w.-]+)?$/.test(option))) {
      throw new Error('Catalog has an invalid pinned feed declaration');
    }
    seen.add(feed.name);
    const url = new URL(feed.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        /[\s'"`\\;^]/.test(feed.url)) throw new Error(`Unsafe Catalog feed URL: ${feed.name}`);
    return [feed.method, ...feed.options, feed.name, `${feed.url}^${feed.commit}`].join(' ');
  }).join('\n') + '\n';
}

export function installCatalogFeeds(tree, receipt, run = (command, args, options) =>
  execFileSync(command, args, options)) {
  const options = { cwd: tree, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] };
  const commit = run('git', ['rev-parse', 'HEAD'], options).trim();
  const config = pinnedFeedsConfig(receipt.buildInputs, commit, receipt.inputsHash);
  writeFileSync(resolve(tree, 'feeds.conf'), config);
  // Let the selected upstream handle checkout, indexing, precedence and installation.
  run('perl', ['./scripts/feeds', 'update', '-a'], { ...options, stdio: 'inherit' });
  for (const feed of receipt.buildInputs.feeds) {
    const actual = run('git', ['-C', `feeds/${feed.name}`, 'rev-parse', 'HEAD'], options).trim();
    if (actual !== feed.commit) throw new Error(`Catalog feed checkout mismatch: ${feed.name}`);
  }
  run('perl', ['./scripts/feeds', 'install', '-a'], { ...options, stdio: 'inherit' });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  installCatalogFeeds(resolve(process.argv[2] || 'openwrt'),
    JSON.parse(readFileSync(process.argv[3] || 'catalog-build-inputs.json', 'utf8')));
}

#!/usr/bin/env node
// Enforce per-Target/Profile flash size limits on built firmware images.
// 按 Target/Profile 校验编译产物的闪存体积上限；仅对配置了规则的机型生效。

import { spawnSync } from 'node:child_process';
import {
  appendFileSync, existsSync, readdirSync, readFileSync, statSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(MODULE_PATH), '..');

function fail(message) {
  console.error(`[flash-size] FAILED: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { targets: '', limits: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--targets') args.targets = argv[++i] || '';
    else if (arg === '--limits') args.limits = argv[++i] || '';
    else fail(`Unknown option: ${arg}`);
  }
  if (!args.targets || !args.limits) {
    fail('Usage: check-flash-size.mjs --targets <dir> --limits <file>');
  }
  return args;
}

function loadLimits(path) {
  let doc;
  try {
    doc = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`Unable to parse limits file: ${error.message}`);
  }
  if (doc?.schema !== 1) fail('Flash limits schema must be 1');
  if (!Array.isArray(doc.rules)) fail('Flash limits must contain a rules array');
  for (const [index, rule] of doc.rules.entries()) {
    if (!rule || typeof rule.target !== 'string' ||
        !/^[A-Za-z0-9._+-]+\/[A-Za-z0-9._+-]+\/[A-Za-z0-9._+-]+$/.test(rule.target)) {
      fail(`rules[${index}].target must look like system/subtarget/profile`);
    }
    if (!Number.isSafeInteger(rule.bytes) || rule.bytes <= 0) {
      fail(`rules[${index}].bytes must be a positive integer`);
    }
    if (rule.label !== undefined && typeof rule.label !== 'string') {
      fail(`rules[${index}].label must be a string`);
    }
  }
  if (doc.defaultBytes !== null && doc.defaultBytes !== undefined &&
      (!Number.isSafeInteger(doc.defaultBytes) || doc.defaultBytes <= 0)) {
    fail('defaultBytes must be null or a positive integer');
  }
  return doc;
}

function uncompressedBytes(file) {
  if (!file.endsWith('.gz')) return statSync(file).size;
  const result = spawnSync('gzip', ['-l', file], { encoding: 'utf8' });
  if (result.status !== 0) fail(`gzip -l failed for ${file}`);
  const lines = result.stdout.trim().split('\n');
  const fields = lines.at(-1).trim().split(/\s+/);
  const uncompressed = Number(fields[1]);
  if (!Number.isSafeInteger(uncompressed) || uncompressed <= 0) {
    fail(`gzip -l reported no size for ${file}`);
  }
  return uncompressed;
}

const IMAGE_PATTERN = /\.(bin|itb|trx|img|ubi|img\.gz|bin\.gz)$/i;

function collectImages(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && IMAGE_PATTERN.test(entry.name))
    .map((entry) => join(dir, entry.name))
    .sort();
}

function formatMiB(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

const args = parseArgs(process.argv.slice(2));
const system = process.env.TARGET_SYSTEM || '';
const subtarget = process.env.TARGET_SUBTARGET || '';
const profile = process.env.TARGET_PROFILE || '';
if (!system || !profile) {
  fail('TARGET_SYSTEM, TARGET_SUBTARGET and TARGET_PROFILE must be set');
}
const limits = loadLimits(resolve(PROJECT_ROOT, args.limits));
const key = `${system}/${subtarget}/${profile}`;
const rule = limits.rules.find((item) => item.target === key) || null;
const limit = rule?.bytes ?? limits.defaultBytes ?? null;
if (limit === null) {
  console.log(`[flash-size] No flash limit configured for ${key}; skipping.`);
  process.exit(0);
}
const label = rule?.label || key;
const targetDir = resolve(args.targets, system, subtarget);
if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
  fail(`Firmware output directory is missing: ${targetDir}`);
}
const images = collectImages(targetDir);
if (!images.length) fail(`No flashable images found under ${targetDir}`);
const rows = [];
let violated = false;
for (const file of images) {
  const bytes = uncompressedBytes(file);
  const ok = bytes <= limit;
  if (!ok) violated = true;
  rows.push({ name: file.slice(targetDir.length + 1), bytes, ok });
}
for (const row of rows) {
  console.log(`[flash-size] ${row.ok ? 'OK' : 'OVER'} ${row.name} ${row.bytes} bytes (limit ${limit})`);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  const report = [
    '',
    '## 🚦 Flash size gate / 闪存体积门禁',
    '',
    `- Device / 设备: \`${label}\` (\`${key}\`)`,
    `- Limit / 上限: \`${limit}\` bytes (${formatMiB(limit)})`,
    '',
    '| Image / 镜像 | Size / 体积 | Status |',
    '| --- | ---: | --- |',
    ...rows.map((row) => `| \`${row.name}\` | ${formatMiB(row.bytes)} | ${row.ok ? '✅ OK' : '❌ OVER LIMIT'} |`),
    '',
  ];
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, report.join('\n') + '\n', 'utf8');
}
if (violated) {
  const over = rows.filter((row) => !row.ok).map((row) => `${row.name}=${row.bytes}`).join(', ');
  fail(`firmware exceeds the ${limit}-byte flash limit for ${key}: ${over}`);
}
console.log(`[flash-size] PASS: ${rows.length} image(s) within ${limit} bytes for ${key}.`);

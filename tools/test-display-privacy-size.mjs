#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const read = (relative) => readFileSync(join(root, relative), 'utf8');

/* The display boundary is deliberately tested independently from the DOM. It
 * must mask only user-facing text in Chinese while leaving technical values
 * available to search, Kconfig evaluation, and export code. */
const i18nSource = read('site/wrt/lib/i18n/i18n.js');
const context = { state: { lang: 'zh-CN' }, console };
vm.runInNewContext(`${i18nSource}\nglobalThis.__display = { displayText, displayConfigSymbol };`, context);
const { displayText, displayConfigSymbol } = context.__display;
const sensitive = 'luci-app-passwall_INCLUDE_V2ray_Geodata 代理';
assert.match(displayText(sensitive), /luci-app-pa\*+l_INCLUDE_V2\*+y_Geodata 魔法/,
  'Chinese display text must reuse the existing masking policy');
assert.doesNotMatch(displayText(sensitive), /passwall|代理/i,
  'Chinese display text must not expose sensitive terms');
assert.equal(displayConfigSymbol('PACKAGE_passwall'), 'CONFIG_PACKAGE_pa****l',
  'configuration-symbol display must apply the same masking boundary');
context.state.lang = 'en';
assert.equal(displayText(sensitive), sensitive,
  'non-Chinese display text must remain unchanged');
assert.equal(displayConfigSymbol('PACKAGE_passwall'), 'CONFIG_PACKAGE_passwall',
  'technical symbols must be readable in non-Chinese locales');

const moduleSources = {
  'site/wrt/lib/plugins/plugin-controller.js': read('site/wrt/lib/plugins/plugin-controller.js'),
  'site/wrt/lib/catalog/catalog-controller.js': read('site/wrt/lib/catalog/catalog-controller.js'),
  'site/wrt/lib/menuconfig/menuconfig-renderer.js': read('site/wrt/lib/menuconfig/menuconfig-renderer.js'),
  'site/wrt/lib/menuconfig/compatibility-controller.js': read('site/wrt/lib/menuconfig/compatibility-controller.js'),
  'site/wrt/lib/diagnostics/package-probe-controller.js': read('site/wrt/lib/diagnostics/package-probe-controller.js'),
  'site/wrt/lib/package-probe-v3-ui.js': read('site/wrt/lib/package-probe-v3-ui.js'),
};
for (const [path, source] of Object.entries(moduleSources)) {
  assert.match(source, /displayText\(/, `${path} must use the shared display boundary`);
}
assert.match(moduleSources['site/wrt/lib/menuconfig/menuconfig-renderer.js'], /displayConfigSymbol\(/,
  'menuconfig technical labels must use the shared symbol display boundary');
assert.match(moduleSources['site/wrt/lib/diagnostics/package-probe-controller.js'], /displayConfigSymbol\(/,
  'legacy probe technical labels must use the shared symbol display boundary');
assert.match(moduleSources['site/wrt/lib/package-probe-v3-ui.js'], /displayConfigSymbol\(/,
  'Probe V3 technical labels must use the shared symbol display boundary');

/* Raw symbols stay available in machine-facing paths. These assertions guard
 * against accidentally masking the search index or request payload. */
assert.match(moduleSources['site/wrt/lib/catalog/catalog-controller.js'], /menuSearchText\.set\(option\.symbol,/,
  'catalog search must retain raw symbols');
assert.match(moduleSources['site/wrt/lib/diagnostics/package-probe-controller.js'], /rows\.set\(match\[1\], `CONFIG_PACKAGE_\$\{match\[1\]\}=\$\{match\[2\]\}`\)/,
  'probe config parsing must retain raw CONFIG values');
assert.match(moduleSources['site/wrt/lib/package-probe-v3-ui.js'], /JSON\.stringify\(request, null, 2\)/,
  'Probe request preview must retain the machine-facing request contract');

const pluginController = moduleSources['site/wrt/lib/plugins/plugin-controller.js'];
assert.match(pluginController, /function packageSizeSummaryValue\(summary, formatted\)/,
  'package-size summaries must have a shared unknown-aware formatter');
const helperSource = pluginController.match(/(function packageSizeSummaryValue\(summary, formatted\) \{[\s\S]*?\n\})/)?.[1];
assert.ok(helperSource, 'package-size summary helper source must be extractable');
const summaryValue = Function('t', `${helperSource}\nreturn packageSizeSummaryValue;`)((key, params) =>
  key === 'size.summary.unknown' ? `${params.unknown} unknown` : `${params.size} + ${params.unknown} unknown`);
assert.equal(summaryValue({ packages: 3, knownBytes: 0, unknown: 3 }, '0 B'), '3 unknown',
  'all-unknown package selections must not be rendered as 0 B');
assert.equal(summaryValue({ packages: 3, knownBytes: 1024, unknown: 1 }, '1 KiB'), '1 KiB + 1 unknown',
  'mixed package selections must expose known size and unknown count');
assert.equal(summaryValue({ packages: 0, knownBytes: 0, unknown: 0 }, '0 B'), '0 B',
  'an empty selection may remain zero');
assert.match(pluginController, /return \{ direct: summarize\(direct\), total: summarize\(total\) \};/,
  'package-size aggregation must retain separate direct and total sets');
assert.match(pluginController, /const sizes = catalogObservedPackageSizes\(\);/,
  'package-size aggregation must use the active shard only');

const extract = (source, name) => source.match(new RegExp(`(function ${name}\\([^]*?\\n\\})`))?.[1];
const stateSource = read('site/wrt/lib/menuconfig/menuconfig-state.js');
const catalogSource = moduleSources['site/wrt/lib/catalog/catalog-controller.js'];
const records = ['app', 'lib', 'module', 'archive-only'].map((name) => ({ package: name, configSymbol: `PACKAGE_${name}` }));
const model = { bySymbol: new Map(records.map((r) => [r.configSymbol, r])), byPackage: new Map(records.map((r) => [r.package, r])) };
model.bySymbol.set('PACKAGE_app_INCLUDE_data', { configSymbol: 'PACKAGE_app_INCLUDE_data', type: 'bool' });
const values = new Map([['TARGET_ARCH_PACKAGES', 'test_arch'], ['PACKAGE_app', 'y'], ['PACKAGE_lib', 'y'],
  ['PACKAGE_module', 'm'], ['PACKAGE_app_INCLUDE_data', 'y'], ['PACKAGE_archive-only', 'y']]);
const sizeContext = { state: { device: { id: 'catalog-target' } },
  MENU_CATALOG: { source: { id: 'test', branch: 'stable', commit: 'a' } },
  CATALOG_MODEL: model, CATALOG_ENGINE: { decodeKconfigString: (s) => s.replace(/^"|"$/g, '') },
  catalogEngineValues: () => values,
  catalogUserOverrides: new Map([['PACKAGE_app', 'y'], ['PACKAGE_module', 'm'], ['PACKAGE_app_INCLUDE_data', 'y']]),
  catalogPackageSizesDocument: { source: { id: 'test', branch: 'stable', commit: 'a' },
    observation: { architecture: 'test_arch' }, rows: [['app', 10, 60], ['lib', 5, 25], ['module', 100, 1000], ['archive-only', 9000, null]] },
};
vm.createContext(sizeContext);
vm.runInContext([
  extract(stateSource, 'catalogConflictRecordForPackage'), extract(stateSource, 'catalogPackageRecordForSymbol'),
  extract(catalogSource, 'catalogPackageSizeMap'), extract(catalogSource, 'catalogObservedPackageSizes'),
  extract(pluginController, 'packageSizeEstimate'), extract(pluginController, 'packageSizeCapacityStatus'),
].join('\n'), sizeContext);
assert.equal(sizeContext.catalogPackageRecordForSymbol('PACKAGE_app_INCLUDE_data'), null);
let estimated = sizeContext.packageSizeEstimate();
assert.equal(estimated.direct.packages, 1);
assert.equal(estimated.direct.knownBytes, 60);
assert.equal(estimated.total.packages, 3);
assert.equal(estimated.total.knownBytes, 85);
assert.equal(estimated.total.unknown, 1, 'archive size is not installed size');
values.set('TARGET_ARCH_PACKAGES', 'other_arch');
assert.equal(sizeContext.packageSizeEstimate(), null, 'do not borrow another architecture');
values.set('TARGET_ARCH_PACKAGES', 'test_arch');
sizeContext.catalogPackageSizesDocument.source.commit = 'b';
assert.equal(sizeContext.packageSizeEstimate(), null, 'do not borrow another snapshot');
sizeContext.catalogPackageSizesDocument.source.commit = 'a';
sizeContext.catalogPackageSizesDocument.rows = [['app', 1, null]];
assert.equal(sizeContext.packageSizeEstimate(), null, 'hide unavailable installed-size estimates');
for (const [percent, level] of [[49, ''], [50, 'warning'], [79, 'warning'], [80, 'danger'], [101, 'danger']]) {
  const report = sizeContext.packageSizeCapacityStatus({ total: { knownBytes: percent * 1024 * 1024, unknown: 1 } }, 100);
  assert.equal(report.level, level); assert.equal(report.partial, true);
}
assert.equal(sizeContext.packageSizeCapacityStatus(null, 160), null);

const sourceJson = JSON.parse(read('tools/i18n-source.json'));
const translationJson = JSON.parse(read('tools/i18n-translations.json'));
for (const key of ['size.summary.unknown', 'size.summary.withUnknown']) {
  assert.equal(typeof sourceJson.strings?.[key], 'string', `${key} must exist in the English source catalog`);
  assert.equal(typeof translationJson['zh-CN']?.[key], 'string', `${key} must exist in the Chinese translation catalog`);
}
const manifest = JSON.parse(read('site/wrt/data/i18n/index.json'));
for (const language of manifest.languages) {
  const document = JSON.parse(read(`site/wrt/data/i18n/${language.id}.json`));
  assert.equal(typeof document.strings['size.summary.unknown'], 'string',
    `${language.id} generated catalog must contain the unknown-size label`);
  assert.equal(typeof document.strings['size.summary.withUnknown'], 'string',
    `${language.id} generated catalog must contain the mixed-size label`);
}

console.log('display privacy and package-size contracts: ok');

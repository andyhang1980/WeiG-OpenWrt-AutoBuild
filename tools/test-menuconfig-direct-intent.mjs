#!/usr/bin/env node
// Regression for the menuconfig prerequisite modal's two-phase apply path.
// A prerequisite may select the target PACKAGE before the explicit target
// Intent is replayed. The real classic-script state layer must still record
// only the second call as direct user Intent.

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as CATALOG_ENGINE from '../site/wrt/lib/catalog-engine.js';
import * as PROFILE_BASELINE_MODULE from '../site/wrt/lib/profile-baseline.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const records = [
  { kind: 'config', configSymbol: 'TRIGGER', kconfigSymbol: 'TRIGGER',
    type: 'bool', states: ['n', 'y'],
    kconfig: { selectsExpressions: [['PACKAGE_target-plugin']] } },
  { kind: 'config', configSymbol: 'CONFLICT', kconfigSymbol: 'CONFLICT',
    type: 'bool', states: ['n', 'y'] },
  { kind: 'config', configSymbol: 'CHILD', kconfigSymbol: 'CHILD',
    type: 'bool', states: ['n', 'y'],
    kconfig: { dependsExpressions: [['PACKAGE_target-plugin']] } },
  { kind: 'package', package: 'target-plugin', configSymbol: 'PACKAGE_target-plugin',
    kconfigSymbol: 'PACKAGE_target-plugin', type: 'bool', states: ['n', 'y'],
    kconfig: { dependsExpressions: [['TRIGGER && !CONFLICT']] } },
];
const model = CATALOG_ENGINE.createCatalogModel({
  schema: 5, targets: [], relations: { schema: 2, records, indexes: {} },
});
const options = records.map((record) => ({
  symbol: record.configSymbol, type: record.type, states: record.states, userSettable: true,
}));

// Load the actual classic-script state layer with a minimal browser/runtime
// fixture. No production bookkeeping is duplicated in the assertions below.
const runtime = {
  Map, Set,
  CATALOG_ENGINE,
  CATALOG_MODEL: model,
  menuValues: new Map([
    ['TRIGGER', 'n'], ['CONFLICT', 'n'], ['PACKAGE_target-plugin', 'n'],
  ]),
  menuTouched: new Set(),
  catalogBaselineValues: new Map([
    ['TRIGGER', 'n'], ['CONFLICT', 'n'], ['PACKAGE_target-plugin', 'n'],
  ]),
  catalogBaselineOrigins: new Map(),
  catalogRecommendedValues: new Map(),
  catalogDependencySymbols: new Set(),
  catalogConditionalDefaultSymbols: new Set(),
  catalogImportedSymbols: new Set(),
  catalogUserOverrides: new Map(),
  menuOptionBySymbol: new Map(options.map((option) => [option.symbol, option])),
  state: { sel: new Set(), removed: new Set(), theme: '@base', source: null, device: { target: null } },
  PLUGINS: { plugins: [] },
  catalogContextCache: new Map(), catalogContextCacheBypass: false,
  catalogStateRevision: 0,
  menuVisibilityRevision: -1, menuVisibilityCache: new Map(),
  menuSelectableStatesCache: new Map(), menuStateConstraintsCache: new Map(),
  UI_SESSION: {
    compatibility: {
      getAcknowledgement: () => null,
      setAcknowledgement: () => {},
      clearAcknowledgement: () => {},
    },
  },
  $: () => null,
  syncFirmwareThemeFromMenu: () => {},
  syncMenuToCurated: () => {},
};
runtime.clearCatalogDerivedCaches = () => runtime.catalogContextCache.clear();
runtime.markCatalogStateChanged = () => {
  runtime.catalogStateRevision += 1;
  runtime.clearCatalogDerivedCaches();
};

vm.createContext(runtime);
vm.runInContext(readFileSync(new URL('../site/wrt/lib/menuconfig/menuconfig-state.js', import.meta.url), 'utf8'), runtime, {
  filename: 'menuconfig-state.js',
});

const triggerOption = runtime.menuOptionBySymbol.get('TRIGGER');
const targetOption = runtime.menuOptionBySymbol.get('PACKAGE_target-plugin');
runtime.applyCatalogIntent(triggerOption, 'y', false, 'user');
assert(runtime.menuValues.get('PACKAGE_target-plugin') === 'y',
  'the prerequisite did not activate the target through Kconfig select');
assert(!runtime.catalogUserOverrides.has('PACKAGE_target-plugin') &&
  runtime.catalogDependencySymbols.has('PACKAGE_target-plugin'),
  'an automatic select was incorrectly recorded as direct package Intent');

const targetResult = runtime.applyCatalogIntent(targetOption, 'y', false, 'user');
assert(targetResult.changes.length === 0,
  'the target replay fixture did not exercise the no-op direct Intent boundary');
assert(runtime.catalogUserOverrides.get('PACKAGE_target-plugin') === 'y' &&
  !runtime.catalogDependencySymbols.has('PACKAGE_target-plugin') &&
  runtime.menuTouched.has('PACKAGE_target-plugin'),
  'a no-op target replay lost the direct PACKAGE Intent or dependency ownership');
assert(runtime.catalogStateRevision === 2,
  'recording a changed direct Intent without value changes did not invalidate Catalog state');

// The actual UI preference layer must propagate an inherited parent shutdown
// before reporting success, and old stale child states need an executable
// recommendation through the same controller (without reopening that parent).
runtime.menuValues.set('CHILD', 'y');
runtime.catalogUserOverrides.delete('PACKAGE_target-plugin');
runtime.catalogDependencySymbols.add('PACKAGE_target-plugin');
runtime.applyCatalogIntent(triggerOption, 'n', false, 'user');
assert(runtime.menuValues.get('PACKAGE_target-plugin') === 'n' && runtime.menuValues.get('CHILD') === 'n',
  'the actual UI preference replay left a child enabled after its parent was disabled');
runtime.menuValues.set('CHILD', 'y');
runtime.menuImportedOriginal = new Map();
runtime.menuImportedNonDefault = new Set();
runtime.MENU_CATALOG = {};
runtime.state.device.id = 'catalog-target';
runtime.t = key => key;
vm.runInContext(readFileSync(new URL('../site/wrt/lib/menuconfig/compatibility-controller.js', import.meta.url), 'utf8'), runtime, {
  filename: 'compatibility-controller.js',
});
runtime.renderCatalogUiAfterIntent = () => {};
runtime.markCatalogStateChanged();
const staleEvaluation = runtime.configurationPreflightEvaluation();
assert(staleEvaluation.initialViolations.length === 1 &&
  staleEvaluation.actions.some(action => action.kind === 'reconcile'),
  'the UI preflight did not offer derived-state reconciliation for the stale child');
runtime.applyConfigurationRecommendation(staleEvaluation);
assert(runtime.menuValues.get('CHILD') === 'n' && runtime.menuTouched.has('CHILD') &&
  runtime.menuValues.get('PACKAGE_target-plugin') === 'n' &&
  runtime.configurationPreflightEvaluation().initialViolations.length === 0,
  'the repair recommendation did not persist the disabled child or failed its second preflight');

// Lazy display state is not the exported configuration. Validate and repair
// the real native-baseline projection, including values absent from the menu.
Object.assign(runtime, {
  ACTIVE_PROFILE_BASELINE: { values: new Map([['CHILD', 'y'], ['TRIGGER', 'y'],
    ['CONFLICT', 'n'], ['PACKAGE_target-plugin', 'y']]) },
  PROFILE_BASELINE_MODULE,
  importedConfigValues: new Map(), importedUnknownEdits: new Map(),
  profilePackageOverrides: new Map(), menuSearchOptions: options,
  menuCatalogKey: 'example/main',
  selectedCatalogSource: () => ({ id: 'example' }),
  selectedCatalogBranch: () => ({ branch: 'main' }),
  currentTimezone: () => ({ zonename: 'UTC', timezone: 'UTC0' }),
  effectiveSelection: () => ({ all: [], removed: [], normal: [], forced: [] }),
});
Object.assign(runtime.state, { source: { id: 'example' }, version: { id: 'main', branch: 'main' },
  variant: { id: 'default' }, siteVersion: 'fixture' });
runtime.menuValues.delete('CHILD');
runtime.menuTouched.clear();
runtime.catalogConditionalDefaultSymbols.clear();
runtime.catalogDependencySymbols.clear();
runtime.catalogUserOverrides.clear();
runtime.catalogRecommendedValues.clear();
runtime.menuTouched.add('TRIGGER');
runtime.menuTouched.add('PACKAGE_target-plugin');
runtime.catalogUserOverrides.set('TRIGGER', 'n');
runtime.catalogUserOverrides.set('PACKAGE_target-plugin', 'n');
vm.runInContext(readFileSync(new URL('../site/wrt/lib/config/config-generator.js', import.meta.url), 'utf8'), runtime);
runtime.resolveCatalogTheme = () => ({ package: 'example-theme', changes: [] });
runtime.markCatalogStateChanged();
assert(runtime.configurationBlockingViolations(runtime.menuValues).length === 0,
  'fixture must reproduce a clean menu over an invalid exported baseline');
assert(runtime.configurationPreflightValues().get('CHILD') === 'y',
  'preflight discarded a native baseline value missing from the menu');
const exportedEvaluation = runtime.configurationPreflightEvaluation();
assert(exportedEvaluation.initialViolations.length === 1 && exportedEvaluation.actions.length > 0,
  `preflight did not detect and plan repair for the actual exported configuration: ${JSON.stringify({ violations: exportedEvaluation.initialViolations, actions: exportedEvaluation.actions })}`);
runtime.applyConfigurationRecommendation(exportedEvaluation);
assert(CATALOG_ENGINE.parseConfigDocument(runtime.buildFinalConfigText()).get('CHILD') === 'n',
  'recommendation did not change the actual exported bytes');
assert(runtime.configurationPreflightEvaluation().initialViolations.length === 0,
  'a repeated check resurrected the repaired native-baseline value');

console.log('menuconfig prerequisite direct-Intent replay passed');

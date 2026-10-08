#!/usr/bin/env node
import assert from 'node:assert/strict';
import { applyUserIntent, createCatalogModel, validateConfig } from '../site/wrt/lib/catalog-engine.js';
const pkg = (name, extra = {}) => ({ kind: 'package', package: name,
  configSymbol: 'PACKAGE_' + name, kconfigSymbol: 'PACKAGE_' + name,
  type: 'tristate', states: ['n', 'm', 'y'], canDisable: true, ...extra });
const model = createCatalogModel({ schema: 6, relations: { schema: 2,
  records: [pkg('consumer', { kconfig: { selectsExpressions: [['PACKAGE_provider-full']] } }),
    pkg('default-consumer', { kconfig: { selectsExpressions: [['PACKAGE_provider-tiny if PACKAGE_provider-full < PACKAGE_default-consumer']] } }),
    pkg('provider-full', { conflicts: ['provider-tiny'] }), pkg('provider-tiny'),
    { configSymbol: 'STRING', type: 'string', defaults: [{ value: 'default' }] }], indexes: {},
} });
const baseline = new Map([['PACKAGE_default-consumer', 'y'], ['PACKAGE_provider-tiny', 'y'],
  ['PACKAGE_provider-full', 'n'], ['PACKAGE_consumer', 'n'], ['STRING', 'unchanged']]);
assert.throws(() => applyUserIntent(model, baseline, { symbol: 'PACKAGE_provider-tiny', value: 'n' }), /cannot be set/);
assert.throws(() => applyUserIntent(model, baseline, { symbol: 'PACKAGE_consumer', value: 'y' }), /conflicts/);
for (const order of [0, 1]) {
  const entries = [['PACKAGE_consumer', 'y'], ['PACKAGE_provider-tiny', 'n']];
  if (order) entries.reverse();
  const result = applyUserIntent(model, baseline, { symbol: 'PACKAGE_consumer', value: 'y', assignments: new Map(entries) });
  assert.equal(result.values.get('PACKAGE_consumer'), 'y');
  assert.equal(result.values.get('PACKAGE_provider-full'), 'y');
  assert.equal(result.values.get('PACKAGE_provider-tiny'), 'n');
  assert.equal(result.values.get('PACKAGE_default-consumer'), 'y', 'retain the conditional selector consumer');
  assert.equal(result.values.get('STRING'), 'unchanged');
  assert.equal(validateConfig(model, result.values).length, 0);
  assert.equal(result.changes.find(row => row.symbol === 'PACKAGE_provider-full').reason, 'select');
}
assert.equal(baseline.get('PACKAGE_provider-tiny'), 'y', 'dry-run must not mutate the input');
for (const assignments of [new Map([['MISSING', 'y']]), new Map([['STRING', 'n']]),
  new Map([['PACKAGE_provider-tiny', 'n'], ['PACKAGE_provider-full', 'n']])]) {
  assert.throws(() => applyUserIntent(model, baseline, { symbol: 'PACKAGE_consumer', value: 'y', assignments }));
}
const conditional = createCatalogModel({ schema: 6, relations: { schema: 2, indexes: {}, records: [
  pkg('frontend', { kconfig: { selectsExpressions: [['PACKAGE_tls', 'PACKAGE_proxy']] } }),
  pkg('tls', { kconfig: { selectsExpressions: [['PACKAGE_util-lite if !FEATURE', 'PACKAGE_util-full if FEATURE']] } }),
  pkg('proxy', { kconfig: { selectsExpressions: [['PACKAGE_util-full']] } }),
  pkg('util-lite', { conflicts: ['util-full'] }), pkg('util-full', { conflicts: ['unresolved-provider,'] }),
  { configSymbol: 'FEATURE', type: 'bool', states: ['n', 'y'], userSettable: true,
    kconfig: { dependsExpressions: [['PACKAGE_tls']] } },
] } });
const values = new Map(conditional.records.map(row => [row.configSymbol, 'n']));
let failure;
try { applyUserIntent(conditional, values, { symbol: 'PACKAGE_frontend', value: 'y' }); }
catch (error) { failure = error; }
const plan = failure?.prerequisitePlans?.recommended;
assert(plan, 'conditional provider gates must reuse prerequisite planning');
assert.deepEqual(plan.steps.map(row => [row.symbol, row.value]), [['FEATURE', 'y']]);
const replay = applyUserIntent(conditional, values, { symbol: 'PACKAGE_frontend', value: 'y',
  assignments: new Map(plan.steps.map(row => [row.symbol, row.value])) });
assert.equal(replay.values.get('PACKAGE_util-full'), 'y');
assert.equal(replay.values.get('PACKAGE_util-lite') ?? 'n', 'n');
assert.equal(validateConfig(conditional, replay.values).length, 0);
const retainedProvider = new Map(values);
retainedProvider.set('PACKAGE_util-lite', 'y');
const restoredGate = applyUserIntent(conditional, retainedProvider, { symbol: 'PACKAGE_frontend', value: 'y',
  dependencySymbols: ['PACKAGE_util-lite'], preferredValues: new Map([['FEATURE', 'y']]), explicitSymbols: ['FEATURE'] });
assert.equal(restoredGate.values.get('FEATURE'), 'y');
assert.equal(restoredGate.values.get('PACKAGE_util-lite'), 'n', 'prune a prior automatic provider after restoring the user gate');
assert.equal(restoredGate.values.get('PACKAGE_util-full'), 'y');
assert.throws(() => applyUserIntent(conditional, values, { symbol: 'PACKAGE_frontend', value: 'y',
  explicitSymbols: ['FEATURE'] }), error => !error.prerequisitePlans?.recommended);
const selectedGate = createCatalogModel({ schema: 6, relations: { schema: 2, indexes: {}, records: [
  pkg('frontend', { kconfig: { selectsExpressions: [['FEATURE']] } }),
  { configSymbol: 'FEATURE', type: 'bool', states: ['n', 'y'], userSettable: true },
] } });
const fixedResult = applyUserIntent(selectedGate, new Map(), { symbol: 'PACKAGE_frontend', value: 'y',
  assignments: new Map([['FEATURE', 'y']]) });
assert.equal(fixedResult.values.get('FEATURE'), 'y', 'a converged selected-fixed prerequisite satisfies the assignment');
assert.throws(() => applyUserIntent(selectedGate, new Map(), { symbol: 'PACKAGE_frontend', value: 'y',
  assignments: new Map([['FEATURE', 'n']]) }), /cannot be set/, 'a selected-fixed N request must still fail');
const late = createCatalogModel({ schema: 6, relations: { schema: 2, indexes: {}, records: [
  pkg('frontend'), pkg('unrelated'),
  { configSymbol: 'OWNER', type: 'bool', states: ['n', 'y'], hidden: true, userSettable: false,
    defaults: ['y if PACKAGE_frontend'], kconfig: { selectsExpressions: [['PACKAGE_tls']] } },
  pkg('tls', { kconfig: { selectsExpressions: [['PACKAGE_util-lite if !FEATURE', 'PACKAGE_util-full if FEATURE']] },
    packageInfo: { installation: { runtime: { schema: 1, dependencies: [], unresolved: ['util-lite (>= 1)'] } } } }),
  pkg('util-lite', { conflicts: ['util-full'] }), pkg('util-full'),
  { configSymbol: 'FEATURE', type: 'bool', states: ['n', 'y'], userSettable: true,
    kconfig: { dependsExpressions: [['PACKAGE_tls']] } },
] } });
const inactive = new Map(late.records.map(row => [row.configSymbol, 'n']));
const preference = { preferredValues: new Map([['FEATURE', 'y']]), explicitSymbols: ['FEATURE'] };
const activated = applyUserIntent(late, inactive, { symbol: 'PACKAGE_frontend', value: 'y', ...preference });
assert.equal(activated.values.get('FEATURE'), 'y');
assert.equal(activated.values.get('PACKAGE_util-full'), 'y');
assert.equal(activated.values.get('PACKAGE_util-lite') ?? 'n', 'n',
  'late hidden owner must restore user gates before choosing a transient provider');
assert(!activated.changes.some(row => row.symbol === 'PACKAGE_util-lite' && row.to === 'y'));
const unrelated = applyUserIntent(late, inactive, { symbol: 'PACKAGE_unrelated', value: 'y', ...preference });
assert.equal(unrelated.values.get('PACKAGE_tls'), 'n', 'inactive user definitions must not activate unrelated parents');
assert.equal(unrelated.values.get('FEATURE'), 'n');
console.log('PASS atomic intent plans: conditional provider gates, automatic ownership, protected scalar, invalid final states');

#!/usr/bin/env node
import assert from 'node:assert/strict';
import { applyUserIntent, createCatalogModel, deriveConfigurationRepairPlan,
  deriveCompatibilityPlans, evaluateCompatibilityRules, normalizeCompatibilityDocument,
  parseConfigDocument, validateConfig } from '../site/wrt/lib/catalog-engine.js';
import { serializeConfigMap } from '../site/wrt/lib/profile-baseline.js';

const pkg = (name, extra = {}) => ({ kind: 'package', package: name,
  configSymbol: 'PACKAGE_' + name, kconfigSymbol: 'PACKAGE_' + name,
  type: 'tristate', states: ['n', 'm', 'y'], ...extra });
const model = createCatalogModel({ schema: 6, relations: { schema: 2, indexes: {},
  packageClosureComplete: true, packageClosureCapabilities: ['complete-package-build-closure-v1'],
  records: [
    pkg('interface', { packageInfo: { installation: { runtime: { schema: 1,
      dependencies: ['daemon', 'admin'].map(name => ({ raw: name, required: true, packages: [name] })) } } } }),
    pkg('daemon'), pkg('admin'),
    pkg('shared-user', { packageInfo: { installation: { runtime: { schema: 1,
      dependencies: [{ raw: 'admin', required: true, packages: ['admin'] }] } } } }),
    pkg('unknown-version', { packageInfo: { installation: { runtime: { schema: 1,
      dependencies: [], unresolved: ['daemon (>= 2)'] } } } }),
  ] } });
for (const manager of ['n', 'y']) {
  const values = new Map([['USE_APK', manager], ['PACKAGE_interface', 'y'], ['PACKAGE_daemon', 'm']]);
  assert.equal(validateConfig(model, values).filter(row => row.installation).length, 2);
  const repaired = deriveConfigurationRepairPlan(model, values);
  assert.equal(repaired.unresolved.length, 0);
  assert.equal(repaired.values.get('PACKAGE_daemon'), 'y', 'M is not an installed runtime provider');
  assert.equal(repaired.values.get('PACKAGE_admin'), 'y');
  assert.equal(repaired.values.get('PACKAGE_interface'), 'y');
  const second = parseConfigDocument(serializeConfigMap(repaired.values));
  assert.equal(validateConfig(model, second).length, 0, 'runtime facts must survive export and recheck');
  const cancelled = applyUserIntent(model, second, { symbol: 'PACKAGE_admin', value: 'n' });
  assert.equal(cancelled.values.get('PACKAGE_interface'), 'n', 'reverse runtime dependency was not cancelled');
  const moduleOnly = new Map(values).set('PACKAGE_interface', 'm');
  assert.equal(validateConfig(model, moduleOnly).length, 0, 'compile-only M must not imply RootFS installation');
}
const oldModel = createCatalogModel({ schema: 5, relations: { schema: 2, records: [pkg('interface')] } });
assert.equal(validateConfig(oldModel, new Map([['PACKAGE_interface', 'y']])).length, 0,
  'old readable metadata must not invent missing runtime facts');
assert(validateConfig(model, new Map([['PACKAGE_unknown-version', 'y']]), { deferred: 'error' }).some(row => row.deferred),
  'unsupported version syntax must not be silently satisfied');
const shared = applyUserIntent(model, new Map([['PACKAGE_interface', 'y'], ['PACKAGE_daemon', 'y'],
  ['PACKAGE_admin', 'y'], ['PACKAGE_shared-user', 'y']]), { symbol: 'PACKAGE_interface', value: 'n',
  dependencySymbols: new Set(['PACKAGE_admin', 'PACKAGE_daemon']) });
assert.equal(shared.values.get('PACKAGE_admin'), 'y', 'a surviving installed consumer requires the shared runtime');

const retainedModel = createCatalogModel({ schema: 6, relations: { schema: 2, records: [
  pkg('frontend', { kconfig: { selectsExpressions: [['PACKAGE_backend']] } }), pkg('backend'),
] } });
const document = { schema: 7, rules: [{ id: 'OWN-RETAIN', issue: 'file-ownership',
  match: 'all-installed', scope: { Demo: ['stable'] }, packages: ['frontend', 'backend'],
  preferredDisable: ['frontend'], preservePackages: ['backend'], paths: ['/etc/shared'], refs: ['run:1'] }] };
const context = { sourceId: 'Demo', branchName: 'stable' };
const original = new Map([['PACKAGE_frontend', 'y'], ['PACKAGE_backend', 'y']]);
const warning = evaluateCompatibilityRules(retainedModel, document, original, context).warnings[0];
const plan = deriveCompatibilityPlans(retainedModel, original, warning, {
  dependencySymbols: new Set(['PACKAGE_backend']), preferredValues: new Map([['PACKAGE_backend', 'n']]),
}).recommended;
assert.deepEqual(plan.steps.map(row => row.package), ['frontend']);
assert.equal(plan.cost, 1);
assert.equal(plan.values.get('PACKAGE_frontend'), 'n');
assert.equal(plan.values.get('PACKAGE_backend'), 'y', 'orphan/default reconciliation violated retained Y');
assert.deepEqual(plan.retainedTargets, [{ symbol: 'PACKAGE_backend', package: 'backend', value: 'y' }]);
const replay = parseConfigDocument(serializeConfigMap(plan.values));
assert.equal(evaluateCompatibilityRules(retainedModel, document, replay, context).warnings.length, 0);
for (const mutate of [
  rule => { rule.preservePackages = ['absent']; },
  rule => { rule.preservePackages = ['frontend']; },
  rule => { rule.match = 'all-selected'; },
]) {
  const invalid = structuredClone(document); mutate(invalid.rules[0]);
  assert.throws(() => normalizeCompatibilityDocument(invalid), /preservePackages/);
}
assert.throws(() => normalizeCompatibilityDocument({ ...document, schema: 6 }), /unsupported/);

const scopedDocument = structuredClone(document);
scopedDocument.rules[0].sourceCommits = ['a'.repeat(40)];
scopedDocument.rules[0].inputHashes = ['b'.repeat(64)];
const scopedContext = { ...context, sourceCommit: 'a'.repeat(40), inputsHash: 'b'.repeat(64) };
assert.equal(evaluateCompatibilityRules(retainedModel, scopedDocument, original, scopedContext).warnings.length, 1);
for (const inputsHash of ['', 'c'.repeat(64)]) {
  const result = evaluateCompatibilityRules(retainedModel, scopedDocument, original, { ...scopedContext, inputsHash });
  assert.equal(result.warnings.length, 0, 'missing/changed feed identity must not apply an exact old rule');
  assert.deepEqual(result.diagnostics[0].mismatches, ['inputsHash']);
}
const malformedInputs = structuredClone(scopedDocument); malformedInputs.rules[0].inputHashes = ['b'.repeat(40)];
assert.throws(() => normalizeCompatibilityDocument(malformedInputs), /inputHashes/);
delete malformedInputs.rules[0].sourceCommits;
assert.throws(() => normalizeCompatibilityDocument(malformedInputs), /sourceCommits/);

// Both proof paths must forget activation-choice ambiguity under known NOT,
// but keep genuinely unknown conditions inconclusive.
for (const typed of [false, true]) {
  const rows = [pkg('failed'), pkg('root', { packageInfo: { depends: [
    { raw: '+failed', required: true, packages: ['failed'] }] },
    kconfig: { dependsExpressions: [['!(ARCH_A || ARCH_B)']],
      ...(typed ? { dependsAstVariants: [[{ kind: 'not', value: { kind: 'or', values: [
        { kind: 'symbol', name: 'ARCH_A' }, { kind: 'symbol', name: 'ARCH_B' }] } }]] } : {}) } }),
    ...['ARCH_A', 'ARCH_B'].map(name => ({ kind: 'config', configSymbol: name, kconfigSymbol: name,
      type: 'bool', states: ['n', 'y'] }))];
  const graph = createCatalogModel({ schema: 6, relations: { schema: 2, records: rows, indexes: {},
    validation: { relationsComplete: true },
    packageClosureComplete: true, packageClosureCapabilities: ['complete-package-build-closure-v1'] } });
  graph.typedRelationsComplete = typed;
  const rule = { schema: 4, rules: [{ id: 'BLD-NEGATION', issue: 'build-failure', match: 'all-selected',
    scope: { Demo: ['stable'] }, sourceCommits: ['a'.repeat(40)], packages: ['failed'],
    buildDependency: { package: 'failed' }, refs: ['run:1'],
    failure: { phase: 'package-compile', cause: 'package-caused', code: 'fixture-failure' } }] };
  const ctx = { ...context, sourceCommit: 'a'.repeat(40) };
  const values = new Map([['ARCH_A', 'n'], ['ARCH_B', 'n'], ['PACKAGE_root', 'y'], ['PACKAGE_failed', 'y']]);
  const hit = evaluateCompatibilityRules(graph, rule, values, ctx).warnings[0];
  const result = deriveCompatibilityPlans(graph, values, hit);
  assert(result.recommended, 'known negative OR incorrectly blocked the ' + (typed ? 'AST' : 'legacy') + ' graph');
  assert.equal(result.recommended.values.get('PACKAGE_root'), 'n');
  const unknown = new Map(values); unknown.delete('ARCH_A');
  const unknownGraph = createCatalogModel({ schema: 6, relations: { schema: 2,
    records: rows.filter(row => row.configSymbol !== 'ARCH_A'), indexes: {},
    validation: { relationsComplete: true },
    packageClosureComplete: true, packageClosureCapabilities: ['complete-package-build-closure-v1'] } });
  unknownGraph.typedRelationsComplete = typed;
  const unknownHit = evaluateCompatibilityRules(unknownGraph, rule, unknown, ctx).warnings[0];
  assert.equal(deriveCompatibilityPlans(unknownGraph, unknown, unknownHit).recommended, null,
    'unknown negative condition was mistaken for proven truth');
}
console.log('Native runtime dependencies, retained participants and negative graph proofs passed');

#!/usr/bin/env node
// Real native Catalog + uploaded requests, with a staged compatibility
// document. Does not publish data, create Issues or dispatch builds.
// Usage: node tools/test-compatibility-browser.mjs compatibility.json RULE-ID request.json [...]
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { evaluateFunction, findChrome, launchChrome, startPreview, waitFor } from './test-ui-browser.mjs';

const [rulePath, ...pairs] = process.argv.slice(2);
assert(rulePath && pairs.length && pairs.length % 2 === 0, 'Pass compatibility.json and RULE-ID/request.json pairs');
const document = JSON.parse(readFileSync(rulePath, 'utf8'));
const sha256 = createHash('sha256').update(JSON.stringify(document)).digest('hex');
const output = mkdtempSync(join(tmpdir(), 'weig-compatibility-browser-'));
const preview = await startPreview();
let browser;
try {
  assert(findChrome(), 'Chrome is required');
  browser = await launchChrome(findChrome(), preview.url, { width: 1366, height: 768 });
  const evaluate = (fn, args = []) => evaluateFunction(browser, fn, args);
  const ready = () => waitFor('native Profile workspace', () => evaluate(`() =>
    typeof ACTIVE_PROFILE_BASELINE !== 'undefined' && ACTIVE_PROFILE_BASELINE &&
    catalogLoadMode === 'idle' && !document.getElementById('submitBtn').disabled`), 120000);
  for (let index = 0; index < pairs.length; index += 2) {
    const id = pairs[index], file = pairs[index + 1];
    if (index) {
      await evaluate('() => { localStorage.clear(); return true; }');
      await browser.connection.command('Page.navigate', { url: preview.url + '&case=' + index });
    }
    await waitFor('Source controls', () => evaluate(`() => document.getElementById('targetSource')?.options.length > 0`), 60000);
    const payload = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    await evaluate(`async (payload, name) => {
      await importConfigFile(new File([JSON.stringify(payload)], name, { type: 'application/json' }));
      return true;
    }`, [payload, basename(file)]);
    await ready();
    await evaluate(`async () => { await ensureCatalogMenuLoaded(true); await ensureCatalogHiddenLoaded(); return true; }`);
    const initial = await evaluate(`async (document, hash, id) => {
      const loaded = { ...(await CATALOG_LOADER.fetchCompatibility()), compatibility: document, hash };
      const evaluation = evaluateLoadedCompatibility(loaded);
      const warning = evaluation.warnings.find(row => row.rule.id === id);
      if (!warning) throw Error('No exact warning for ' + id + ': ' + JSON.stringify({
        context: evaluation.context, source: MENU_CATALOG?.source,
        diagnostics: evaluation.diagnostics.filter(row => row.ruleId === id) }));
      const intent = { dependencySymbols: catalogDependencySymbols, protectedSymbols: catalogProtectedSymbols(),
        preferredValues: catalogPreferredValues(), derivedSymbols: catalogConditionalDefaultSymbols,
        explicitSymbols: new Set(catalogUserOverrides.keys()), validationOptions: evaluation.context.validationOptions };
      const plans = CATALOG_ENGINE.deriveCompatibilityPlans(CATALOG_MODEL, warning.values, warning, intent);
      if (!plans.recommended) {
        const records = warning.records.map(row => {
          const constraints = CATALOG_ENGINE.kconfigStateConstraints(CATALOG_MODEL, row,
            warning.values, evaluation.context.validationOptions);
          let directError = null;
          try { CATALOG_ENGINE.applyUserIntent(CATALOG_MODEL, warning.values,
            { ...intent, symbol: row.configSymbol, value: 'n' }); }
          catch (error) { directError = { message: error.message, violations: error.violations }; }
          return { package: row.package, symbol: row.configSymbol, canDisable: row.canDisable,
            userSettable: row.userSettable, protected: intent.protectedSymbols.has(row.configSymbol),
            type: row.type, states: row.states, constraints, directError };
        });
        throw Error('No executable recommendation: ' + JSON.stringify({ reason: plans.reason, records }));
      }
      globalThis.__compatibilityTest = { loaded, id, expected: [...plans.recommended.steps,
        ...(plans.recommended.requiredTargets || []), ...(plans.recommended.retainedTargets || [])] };
      openCompatibilityWarningModal(evaluation, warning, plans);
      return { source: state.source.id, branch: state.version.branch, steps: plans.recommended.steps,
        retained: plans.recommended.retainedTargets || [] };
    }`, [document, sha256, id]);
    for (const theme of ['light', 'dark']) {
      for (const viewport of [{ width: 1366, height: 768 }, { width: 1024, height: 600 },
        { width: 390, height: 640 }, { width: 320, height: 568 }]) {
        await browser.connection.command('Emulation.setDeviceMetricsOverride', {
          ...viewport, deviceScaleFactor: 1, mobile: false,
        });
        await evaluate(`theme => { document.documentElement.dataset.theme = theme;
          document.querySelector('#modalBody details')?.setAttribute('open', ''); return true; }`, [theme]);
        await waitFor('visible modal and footer', () => evaluate(`() => {
          const modal = document.querySelector('#modal .modal'), body = document.getElementById('modalBody');
          const footer = body.querySelector('.modal-actions'), scroll = body.querySelector('.modal-scroll-content');
          const m = modal.getBoundingClientRect(), f = footer?.getBoundingClientRect();
          return f && scroll && m.top >= 0 && m.bottom <= innerHeight + 1 &&
            f.top >= m.top && f.bottom <= m.bottom + 1 && scroll.scrollWidth <= scroll.clientWidth + 1 &&
            scroll.getBoundingClientRect().bottom <= f.top + 1;
        }`), 5000);
      }
    }
    const screenshot = await browser.connection.command('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(output, id + '-phone.png'), Buffer.from(screenshot.data, 'base64'));
    await evaluate(`() => { document.querySelector('#modalBody .compatibility-recommended').click(); return true; }`);
    await waitFor('recommendation transaction settled', () => evaluate(`() =>
      document.querySelector('#modalBody .compatibility-recommendation')?.classList.contains('is-applied')`), 60000);
    const final = await evaluate(`() => {
      const test = __compatibilityTest;
      if (!compatibilityTargetsResolved(test.expected)) throw Error('Recommended or retained target changed');
      const second = evaluateLoadedCompatibility(test.loaded);
      if (second.warnings.some(row => row.rule.id === test.id)) throw Error('Second check resurrected the warning');
      const text = buildFinalConfigText();
      const exported = PROFILE_BASELINE_MODULE.parseConfigMap(text);
      for (const target of test.expected) if ((exported.get(target.symbol) ?? 'n') !== target.value) {
        throw Error('Export lost ' + target.symbol);
      }
      const overrides = buildRequestOverrides(text);
      const rebuilt = PROFILE_BASELINE_MODULE.applyProfileOverrides(ACTIVE_PROFILE_BASELINE, overrides,
        { allowedSymbols: new Set(CATALOG_MODEL.bySymbol.keys()) });
      const roundtrip = CATALOG_ENGINE.evaluateCompatibilityRules(CATALOG_MODEL, test.loaded.compatibility,
        rebuilt, compatibilityContext());
      if (roundtrip.warnings.some(row => row.rule.id === test.id)) throw Error('Schema-6 override roundtrip failed');
      closeModal();
      return { values: test.expected.map(target => [target.symbol, exported.get(target.symbol) ?? 'n']),
        overrides, source: state.source.id, branch: state.version.branch };
    }`);
    writeFileSync(join(output, id + '-result.json'), JSON.stringify({ initial, final }, null, 2) + '\n');
    console.log('[compatibility-browser] PASS ' + id + ' ' + initial.source + '/' + initial.branch);
  }
  console.log('[compatibility-browser] results=' + output);
} finally {
  await browser?.close?.();
  preview.stop();
}

#!/usr/bin/env node
// Opt-in real Catalog regression; no Issue creation or firmware dispatch.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateFunction, findChrome, launchChrome, startPreview, waitFor } from './test-ui-browser.mjs';
const preview = await startPreview();
const screenshots = process.argv.includes('--screenshots') ? mkdtempSync(join(tmpdir(), 'weig-selection-browser-')) : '';
let browser;
try {
  browser = await launchChrome(findChrome(), preview.url, { width: 1366, height: 900 });
  const ev = (fn, args = []) => evaluateFunction(browser, fn, args);
  await waitFor('Source controls', () => ev("() => $('targetSource')?.options.length > 0"), 120000);
  const sources = await ev("() => [...$('targetSource').options].map(option => option.value).filter(Boolean)");
  for (const source of sources) {
    await ev("(source) => { closeModal(); closeCatalogDependencyDetails(); const select = $('targetSource'); select.value = source; select.dispatchEvent(new Event('change', { bubbles: true })); }", [source]);
    const ready = () => ev("(source) => state.source?.id === source && catalogLoadMode === 'idle' && ACTIVE_PROFILE_BASELINE && !$('submitBtn').disabled && $('targetPicker').getAttribute('aria-busy') === 'false'", [source]);
    await waitFor(source + ' workspace', ready, 180000);
    await ev(`async () => {
      const target = MENU_CATALOG.targets.find(t => t.board === 'x86' && t.subtarget === '64');
      if (target) {
        const profile = target.profiles.find(p => /generic/i.test(p.id));
        renderCatalogPicker(false, { sourceId: state.source.id, branchId: state.version.id,
          system: target.board, subtarget: target.subtarget, profileSymbol: profile.id });
        await applyCatalogTarget();
      }
      await ensureCatalogMenuLoaded(true); await ensureCatalogHiddenLoaded();
      state.advanced = true; renderGroups();
      globalThis.__selectionBaseline = snapshotCatalogUiState();
      globalThis.__selectionScans = 0; globalThis.__selectionPlans = 0;
      globalThis.__originalCompatibilityEvaluation ||= evaluateLoadedCompatibility;
      globalThis.__originalDependencyAnalysis ||= catalogDependencyAnalysis;
      evaluateLoadedCompatibility = (...args) => { __selectionScans++; return __originalCompatibilityEvaluation(...args); };
      catalogDependencyAnalysis = (...args) => { __selectionPlans++; return __originalDependencyAnalysis(...args); };
    }`);
    const cases = await ev(`() => ['luci-app-ddns', 'luci-app-cjdns', 'luci-app-kodexplorer', 'luci-app-pbr',
      'luci-app-tailscale-community', 'luci-app-mwan3helper', 'luci-app-qbittorrent', 'luci-app-qmodem-hc',
      'luci-app-mtwifi', 'luci-app-baidupcs-web', 'luci-app-ltqtapi']
      .filter(pkg => menuOptionBySymbol.has('PACKAGE_' + pkg))`);
    // Capture both engines over identical inputs. The reference uses the full
    // native path; the real UI still exercises its revision-aware dirty path.
    await ev(`() => {
      globalThis.__originalIntent = evaluateCatalogIntent;
      evaluateCatalogIntent = (...args) => {
        const revision = catalogNativeIntentRevision;
        catalogNativeIntentRevision = -1;
        const full = __originalIntent(...args);
        catalogNativeIntentRevision = revision;
        const incremental = __originalIntent(...args);
        const entries = result => JSON.stringify([...result.values].sort(([a], [b]) => a.localeCompare(b)));
        if (entries(full) !== entries(incremental)) throw new Error('Incremental/full native values differ for ' + args[0].symbol);
        return incremental;
      };
    }`);
    for (const pkg of cases) {
      const result = await ev(`(pkg) => {
        const option = menuOptionBySymbol.get('PACKAGE_' + pkg);
        const constraints = optionStateConstraints(option);
        const value = menuValues.get(option.symbol) === 'y' ? 'n' : 'y';
        const allowed = constraints.selectableStates.includes(value);
        const plansBefore = __selectionPlans;
        const applied = setMenuValue(option, value);
        closeCatalogDependencyDetails();
        return { pkg, allowed, applied, modal: !$('modal').hidden, plans: __selectionPlans - plansBefore,
          value: menuValues.get(option.symbol), requested: value };
      }`, [pkg]);
      assert.equal(result.modal, false, source + '/' + pkg + ' unexpectedly opened a modal');
      assert.equal(result.plans, 0, 'ordinary edit invoked the optional prerequisite planner');
      if (result.allowed) {
        assert.equal(result.applied, true, source + '/' + pkg + ': legal native intent failed');
        assert.equal(result.value, result.requested);
      } else assert.equal(result.applied, false, source + '/' + pkg + ': illegal native edit was accepted');
    }
    await ev("() => { evaluateCatalogIntent = __originalIntent; }");
    const checkbox = await ev(`() => {
      const plugin = PLUGINS.plugins.find(p => curatedPackageCandidates(p).includes('luci-app-ddns'));
      if (!plugin) return null;
      return plugin.id;
    }`);
    if (checkbox) {
      const clicks = await ev(`(id) => {
        restoreCatalogUiState(__selectionBaseline); renderCatalogUiAfterIntent();
        const card = () => $('pcb-' + id).closest('.plugin');
        const before = $('pcb-' + id).checked;
        const unchangedCard = [...document.querySelectorAll('.plugin')].find(element => !element.contains($('pcb-' + id)));
        const samples = [];
        for (let index = 0; index < 8; index++) {
          const start = performance.now(); card().click(); samples.push(performance.now() - start);
        }
        const after = $('pcb-' + id).checked;
        card().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
        const pinned = $('uiTooltip').classList.contains('is-pinned'); hideUiTooltip(true);
        const initial = $('pcb-' + id).checked;
        card().querySelector('.plugin-dependency-toggle').click();
        const detailUnchanged = $('pcb-' + id).checked === initial;
        return { before, after, pinned, detailUnchanged, samples, scans: __selectionScans,
          modal: !$('modal').hidden, stableCard: unchangedCard?.isConnected };
      }`, [checkbox]);
      assert.equal(clicks.before, clicks.after, 'card background did not toggle exactly once');
      assert.equal(clicks.pinned, true, 'right-click must retain shared copyable tooltip');
      assert.equal(clicks.detailUnchanged, true, 'dependency button toggled selection');
      assert.equal(clicks.scans, 0, 'ordinary selection scanned compatibility');
      assert.equal(clicks.modal, false);
      assert.equal(clicks.stableCard, true, 'unaffected cards were rebuilt on a checkbox edit');
      console.log(JSON.stringify({ source, cases: cases.length, checkboxMs: clicks.samples.map(value => +value.toFixed(1)) }));
    }
    for (const pkg of source === 'iStoreOS' ? ['luci-app-baidupcs-web', 'luci-app-ltqtapi'] :
      source === 'Lienol' ? ['luci-app-mwan3helper', 'luci-app-qmodem-hc'] : []) {
      const result = await ev(`(pkg) => {
        closeCatalogDependencyDetails();
        const option = menuOptionBySymbol.get('PACKAGE_' + pkg);
        if (!option) return null;
        openCatalogDependencyDetails(option);
        const panel = document.querySelector('.catalog-dependency-details');
        return { text: panel.textContent, apply: [...panel.querySelectorAll('button')].some(button =>
          button.textContent === t('dependency.apply')), checked: menuValues.get(option.symbol) };
      }`, [pkg]);
      if (!result) continue;
      if (pkg === 'luci-app-baidupcs-web' || pkg === 'luci-app-mwan3helper') {
        assert.match(result.text, /依赖提供者|Provider absent/, source + '/' + pkg + ': missing-provider explanation');
      } else assert.equal(result.apply, false, 'target/hidden prerequisites must not be guessed');
    }
  }
  // Shared on-demand assistance: one legal manual prerequisite, no package or
  // Source-specific code. A small browser fixture exercises the real renderer,
  // engine, apply bookkeeping and responsive inline panel together.
  await ev(`() => {
    closeCatalogDependencyDetails(); closeModal();
    CATALOG_MODEL = CATALOG_ENGINE.createCatalogModel({ schema: 6, relations: { schema: 2, records: [
      { configSymbol: 'GATE', type: 'bool', states: ['n','y'], userSettable: true },
      { package: 'fixture-application', configSymbol: 'PACKAGE_fixture-application', type: 'bool', states: ['n','y'],
        userSettable: true, kconfig: { dependsExpressions: [['GATE']] } },
    ] } });
    const option = { symbol: 'PACKAGE_fixture-application', type: 'bool', states: ['n','y'], userSettable: true,
      dependsVariants: [['GATE']] };
    menuOptionBySymbol = new Map([[option.symbol, option], ['GATE', { symbol: 'GATE', type: 'bool', states: ['n','y'], userSettable: true }]]);
    for (const map of [menuValues, catalogBaselineValues, catalogBaselineOrigins, catalogRecommendedValues, catalogUserOverrides]) map.clear();
    for (const set of [menuTouched, catalogDependencySymbols, catalogConditionalDefaultSymbols, catalogImportedSymbols, state.sel, state.removed]) set.clear();
    menuValues.set('GATE','n'); menuValues.set(option.symbol,'n');
    PLUGINS = { groups: ['Other'], plugins: [{ id:'fixture-application', pkg:'fixture-application', group:'Other',
      name:'Fixture application', desc:'Manual prerequisite fixture', catalogOnly:true }] };
    state.advanced=true; markCatalogStateChanged(); renderGroups();
    $('pcb-fixture-application').closest('.plugin').querySelector('.plugin-dependency-toggle').click();
  }`);
  const manual = await ev(`() => {
    const panel=document.querySelector('.catalog-dependency-details');
    return { text:panel.textContent, gate:menuValues.get('GATE'), app:menuValues.get('PACKAGE_fixture-application'),
      apply:[...panel.querySelectorAll('button')].some(button=>button.textContent===t('dependency.apply')) };
  }`);
  assert.equal(manual.gate, 'n'); assert.equal(manual.app, 'n'); assert.equal(manual.apply,true);
  assert.match(manual.text,/GATE=Y/);
  for (const width of [1366, 640, 390]) {
    await browser.connection.command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    const geometry=await ev(`() => {
      const panel=document.querySelector('.catalog-dependency-details');
      const rect=panel.getBoundingClientRect();
      return { width:innerWidth,left:rect.left,right:rect.right,overflow:panel.scrollWidth-panel.clientWidth,
        height:rect.height,maxHeight:innerHeight*.6,domCount:document.querySelectorAll('.catalog-dependency-details').length };
    }`);
    assert.equal(geometry.domCount,1); assert(geometry.left>=0 && geometry.right<=geometry.width+1);
    assert(geometry.overflow<=1); assert(geometry.height<=geometry.maxHeight+1);
    if (screenshots) {
      await ev("() => document.querySelector('.catalog-dependency-details').scrollIntoView({ block: 'center' })");
      const shot = await browser.connection.command('Page.captureScreenshot', { format: 'png' });
      const path = join(screenshots, `dependency-panel-${width}.png`);
      writeFileSync(path, Buffer.from(shot.data, 'base64'));
      console.log('Screenshot: ' + path);
    }
  }
  const applied=await ev(`() => {
    [...document.querySelectorAll('.catalog-dependency-details button')].find(button=>button.textContent===t('dependency.apply')).click();
    return {gate:menuValues.get('GATE'),app:menuValues.get('PACKAGE_fixture-application'),
      explicit:catalogUserOverrides.get('PACKAGE_fixture-application'),modal:!$('modal').hidden};
  }`);
  assert.deepEqual(applied,{gate:'y',app:'y',explicit:'y',modal:false});
  console.log('PASS optional shared prerequisite recommendation, atomic apply and desktop/mobile geometry');
} finally {
  await browser?.close(); preview.stop();
  if (preview.fixtureRoot) rmSync(preview.fixtureRoot,{ recursive:true,force:true });
}

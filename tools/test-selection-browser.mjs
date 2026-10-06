#!/usr/bin/env node
// Opt-in real Catalog regression; no Issue creation or firmware dispatch.
import assert from 'node:assert/strict';
import { evaluateFunction, findChrome, launchChrome, startPreview, waitFor } from './test-ui-browser.mjs';
const preview = await startPreview();
let browser;
try {
  browser = await launchChrome(findChrome(), preview.url, { width: 1366, height: 900 });
  const ev = (fn, args = []) => evaluateFunction(browser, fn, args);
  await waitFor('Source controls', () => ev("() => document.getElementById('targetSource')?.options.length > 0"), 120000);
  await ev("() => { const select = $('targetSource'); select.value = 'Lienol'; select.dispatchEvent(new Event('change', { bubbles: true })); }");
  const ready = () => ev("() => state.source?.id === 'Lienol' && catalogLoadMode === 'idle' && ACTIVE_PROFILE_BASELINE && !$('submitBtn').disabled && $('targetPicker').getAttribute('aria-busy') === 'false'");
  await waitFor('Lienol workspace', ready, 180000);
  await ev(`async () => {
    const target = MENU_CATALOG.targets.find(t => t.board === 'x86' && t.subtarget === '64');
    const profile = target.profiles.find(p => /generic/i.test(p.id));
    renderCatalogPicker(false, { sourceId: state.source.id, branchId: state.version.id,
      system: target.board, subtarget: target.subtarget, profileSymbol: profile.id });
    await applyCatalogTarget(); await ensureCatalogMenuLoaded(true); await ensureCatalogHiddenLoaded();
    globalThis.__selectionBaseline = snapshotCatalogUiState();
  }`);
  await waitFor('Generic workspace', ready, 180000);
  for (const pkg of ['luci-app-tailscale-community', 'luci-app-pbr', 'luci-app-arpbind', 'luci-app-kodexplorer']) {
    const result = await ev(`(pkg) => {
      closeModal(); restoreCatalogUiState(__selectionBaseline); renderCatalogUiAfterIntent();
      const plugin = PLUGINS.plugins.find(p => curatedPackageCandidates(p).includes(pkg));
      const card = document.querySelector('#pcb-' + plugin.id).closest('.plugin');
      card.querySelector('.plugin-name').click();
      const apply = [...document.querySelectorAll('#modal button')].find(b => /应用切换|应用推荐|Apply switch|Apply recommended|应用前置/.test(b.textContent));
      if (!$('modal').hidden && apply && !apply.disabled) apply.click();
      return { value: menuValues.get('PACKAGE_' + pkg), modal: !$('modal').hidden,
        detail: $('modalBody').textContent, ddns: menuValues.get('PACKAGE_ddns-scripts'),
        tiny: menuValues.get('PACKAGE_ip-tiny'), full: menuValues.get('PACKAGE_ip-full') };
    }`, [pkg]);
    assert.equal(result.value, 'y', `${pkg}: ${result.detail}`);
    assert.equal(result.modal, false, `${pkg} application did not close`);
    if (pkg !== 'luci-app-kodexplorer') {
      assert.equal(result.tiny, 'n'); assert.equal(result.full, 'y'); assert.equal(result.ddns, 'y');
    }
    const clicks = await ev(`(pkg) => {
      const plugin = PLUGINS.plugins.find(p => curatedPackageCandidates(p).includes(pkg));
      const card = () => document.querySelector('#pcb-' + plugin.id).closest('.plugin');
      card().click(); const off = menuValues.get('PACKAGE_' + pkg);
      card().querySelector('input').click();
      const apply = [...document.querySelectorAll('#modal button')].find(b => /应用切换|应用推荐|Apply switch|Apply recommended|应用前置/.test(b.textContent));
      if (!$('modal').hidden && apply && !apply.disabled) apply.click();
      const on = menuValues.get('PACKAGE_' + pkg);
      card().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      const pinned = $('uiTooltip').classList.contains('is-pinned');
      const unchanged = menuValues.get('PACKAGE_' + pkg);
      hideUiTooltip(true);
      return { off, on, pinned, unchanged, detail: on !== 'y' ? $('modalBody').textContent : '' };
    }`, [pkg]);
    assert.deepEqual(clicks, { off: 'n', on: 'y', pinned: true, unchanged: 'y', detail: '' },
      'card background and native checkbox toggle exactly once; right-click only pins');
    console.log('PASS real card click and shared switch: ' + pkg);
  }
  for (const [pkg, reason] of [['luci-app-mtwifi', 'TARGET_ramips'], ['luci-app-qmodem-hc', 'hc-g80'],
    ['luci-app-mwan3helper', 'pdnsd-alt'], ['luci-app-libreswan', 'nss-utils']]) {
    const result = await ev(`(pkg) => {
      closeModal(); restoreCatalogUiState(__selectionBaseline); renderCatalogUiAfterIntent();
      setMenuValue(menuOptionBySymbol.get('PACKAGE_' + pkg), 'y');
      return { modal: !$('modal').hidden, detail: $('modalBody').textContent,
        value: menuValues.get('PACKAGE_' + pkg) };
    }`, [pkg]);
    assert(result.modal && result.detail.includes(reason), `${pkg}: ${result.detail}`);
    assert.notEqual(result.value, 'y');
    console.log('PASS persistent restriction/provider explanation: ' + pkg);
  }
} finally { await browser?.close(); preview.stop(); }

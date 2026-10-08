/*
 * SPDX-FileCopyrightText: 2026 weigefenxiang <weigefenxiang@gmail.com>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import './compatibility-recommendation-ui.js';

function addClassNames(element, ...names) {
  for (const name of names.flatMap((value) => String(value || '').split(/\s+/)).filter(Boolean)) {
    element.classList.add(name);
  }
  return element;
}

function loadComponentStyles() {
  if (typeof document === 'undefined' || document.querySelector('link[data-ui-components-style]')) return;
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  const url = new URL('../ui-components.css', import.meta.url);
  url.search = new URL(import.meta.url).search;
  stylesheet.href = url.href;
  stylesheet.dataset.uiComponentsStyle = '';
  document.head.appendChild(stylesheet);
}
loadComponentStyles();

export function createUiActionRow(className = '') {
  const row = document.createElement('div');
  addClassNames(row, 'ui-action-row', className);
  return row;
}

// Reusable modal shell: a bounded scroll region and a non-scrolling footer.
// Call after rendering content. Re-renderers already clear modalBody.
export function mountUiModalActions(body, actions) {
  const content = document.createElement('div');
  content.className = 'modal-scroll-content';
  while (body.firstChild) content.appendChild(body.firstChild);
  body.replaceChildren(content, actions);
}

export function createUiButton({ text = '', className = 'btn', title = '', onClick = null } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  addClassNames(button, 'ui-button', className);
  button.textContent = String(text);
  if (title) button.dataset.uiTooltipBody = String(title);
  if (typeof onClick === 'function') button.addEventListener('click', onClick);
  return button;
}

// Presentation only: every caller supplies constraints from the same Catalog engine.
export function updateUiKconfigStateControl(root, { value, constraints, bindTooltip } = {}) {
  for (const button of root.querySelectorAll('button[data-value]')) {
    const state = constraints.states.find((item) => item.value === button.dataset.value);
    const active = value === button.dataset.value;
    button.classList.toggle('is-current', active);
    button.classList.toggle('is-editable', Boolean(state?.selectable));
    button.classList.toggle('is-disabled', !state?.selectable);
    button.classList.toggle('is-locked', Boolean(active && state?.locked));
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-disabled', String(!state?.selectable));
    button.textContent = button.dataset.value.toUpperCase();
    if (active && state?.locked) {
      const lock = document.createElement('span');
      lock.className = 'kconfig-state-lock'; lock.textContent = '🔒';
      lock.setAttribute('aria-hidden', 'true'); button.appendChild(lock);
    }
    bindTooltip?.(button, button.dataset.value, constraints);
  }
}

export function createUiKconfigStateControl({ type, value, constraints, className = 'catalog-conflict-state',
  bindTooltip, onChange, onUnavailable } = {}) {
  const root = document.createElement('span'); root.className = className;
  for (const stateValue of ['n', 'm', 'y']) {
    if (type === 'bool' && stateValue === 'm') {
      const spacer = document.createElement('span'); spacer.className = 'kconfig-state-spacer';
      spacer.setAttribute('aria-hidden', 'true'); root.appendChild(spacer); continue;
    }
    const button = document.createElement('button'); button.type = 'button';
    button.className = 'kconfig-state'; button.dataset.value = stateValue;
    button.onclick = (event) => {
      if (button.getAttribute('aria-disabled') === 'true') {
        event.preventDefault(); onUnavailable?.(button, event); return;
      }
      if (button.getAttribute('aria-pressed') !== 'true') onChange?.(stateValue);
    };
    root.appendChild(button);
  }
  updateUiKconfigStateControl(root, { value, constraints, bindTooltip });
  return root;
}

export function createUiConfigurationReview({ title, changes = [], formatSymbol, formatValue, formatKind } = {}) {
  const section = document.createElement('section'); section.className = 'configuration-review';
  const heading = document.createElement('strong'); heading.textContent = title; section.appendChild(heading);
  for (const change of changes) {
    const row = document.createElement('div'); row.className = 'configuration-review-row';
    const name = document.createElement('code'); name.textContent = formatSymbol(change.symbol);
    const values = document.createElement('span');
    values.textContent = `${formatValue(change.from)} → ${formatValue(change.to)}`;
    const kind = document.createElement('small'); kind.textContent = formatKind(change);
    row.append(name, values, kind); section.appendChild(row);
  }
  return section;
}

export function createUiCheckboxControl({
  label = '', className = '', checked = false, tooltipTitle = '', tooltipBody = '', onChange = null,
} = {}) {
  const root = document.createElement('label');
  addClassNames(root, 'ui-checkbox-control', className);
  if (tooltipTitle) root.dataset.uiTooltipTitle = String(tooltipTitle);
  if (tooltipBody) root.dataset.uiTooltipBody = String(tooltipBody);
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked === true;
  if (typeof onChange === 'function') input.addEventListener('change', () => onChange(input.checked, input));
  const text = document.createElement('span');
  text.className = 'ui-checkbox-label';
  text.textContent = String(label);
  root.append(input, text);
  return { root, input, text };
}

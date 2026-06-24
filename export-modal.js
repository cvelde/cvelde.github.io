// ── EXPORT ───────────────────────────────────────────────────────────────────
async function exportMod() {
  if (typeof JSZip === 'undefined') {
    alert('JSZip library not loaded. Check your internet connection and reload the page.');
    return;
  }
  const btn = document.getElementById('export-btn') || document.getElementById('header-export-btn');
  const origText = btn?.textContent;
  if (btn) { btn.textContent = '⏳ Building ZIP…'; btn.disabled = true; }

  try {
    const zip = new JSZip();
    const exportPaths = new Set();

    // Collect checked ships (+ their skins automatically)
    document.querySelectorAll('.export-ship-cb:checked').forEach(cb => {
      const entry = _shipPathById[cb.dataset.hullId];
      if (entry) {
        exportPaths.add(entry.path);
        entry.skinPaths.forEach(sp => exportPaths.add(sp));
      }
    });

    // Collect checked orphan skins (those without a parent ship)
    document.querySelectorAll('.export-skin-cb:checked').forEach(cb => {
      exportPaths.add(cb.dataset.path);
    });

    // Collect checked variants
    document.querySelectorAll('.export-variant-cb:checked').forEach(cb => {
      exportPaths.add(cb.dataset.path);
    });

    // Collect checked files from the file inventory
    document.querySelectorAll('.export-file-cb:checked').forEach(cb => {
      exportPaths.add(cb.dataset.path);
    });

    // Determine mod_info.json path
    const modInfoPath = Object.keys(_byPath).find(p => p.endsWith('/mod_info.json'));

    // Add all collected files to the zip (applying pending content patches)
    for (const path of exportPaths) {
      if (path === modInfoPath) continue; // handled separately below
      const file = _byPath[path];
      if (!file) continue;
      const zipPath = _modRoot && path.startsWith(_modRoot + '/')
        ? path.slice(_modRoot.length + 1)
        : path.replace(/^\//, '');
      if (_pendingPatches[path]?.length) {
        try {
          let text = await readText(file);
          for (const patch of _pendingPatches[path]) text = patch.apply(text);
          zip.file(zipPath, text);
        } catch(e) { zip.file(zipPath, file); }
      } else {
        zip.file(zipPath, file);
      }
    }

    // Always include a modified mod_info.json
    if (modInfoPath && _byPath[modInfoPath]) {
      let modInfo;
      try { modInfo = parseStarsectorJson(await readText(_byPath[modInfoPath])); } catch(e) { modInfo = {}; }
      modInfo.name = (modInfo.name || 'Unknown Mod') + ' [SMT]';
      modInfo.version = (modInfo.version ? modInfo.version + '-' : '') + 'SMT';
      zip.file('mod_info.json', JSON.stringify(modInfo, null, 2));
    }

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const modId = Object.keys(_byPath).length ? (_byPath[Object.keys(_byPath).find(p => p.endsWith('/mod_info.json'))] ? '' : '') : '';
    a.download = (document.getElementById('mod-name-display')?.textContent || 'mod').replace(/[^\w\-. ]/g, '_') + '_smt.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  } catch (err) {
    alert('Export failed: ' + err.message);
  } finally {
    if (btn) { btn.textContent = origText; btn.disabled = false; }
  }
}

// ── UNIFIED CHECKBOX SYSTEM ───────────────────────────────────────────────────
// Single entry point for every checkbox change in the app.
// Determines type, checks risks, shows modal when needed, then applies cascades.
function onAnyCheckChange(cb) {
  const checked = cb.checked;
  const type = cbType(cb);

  if (!checked) {
    const risks = risksForCb(cb, type);
    if (risks.length) {
      // Temporarily restore previous state while modal is open
      cb.checked = true;
      visualRestoreCb(cb, type, true);
      showRiskModal(primaryPathForCb(cb, type), risks, () => applyToggle(cb, type, false));
      return;
    }
  }
  applyToggle(cb, type, checked);
}

function cbType(cb) {
  if (cb.classList.contains('export-ship-cb'))    return 'ship';
  if (cb.classList.contains('export-variant-cb')) return 'variant';
  if (cb.classList.contains('export-skin-cb'))    return 'skin';
  return 'file';
}

function primaryPathForCb(cb, type) {
  if (type === 'ship') return _shipPathById[cb.dataset.hullId]?.path || '';
  return cb.dataset.path || '';
}

function risksForCb(cb, type) {
  if (type === 'ship') {
    const entry = _shipPathById[cb.dataset.hullId];
    if (!entry) return [];
    // Only check risks stored on the .ship file itself (e.g. faction knownShips, ship roles).
    // Sprite risks say "removing the sprite will break THIS ship" — irrelevant when the
    // ship itself is being unchecked (and would produce a circular "also exclude the ship" fix).
    return getActiveRisksForPath(entry.path);
  }
  return getActiveRisksForPath(cb.dataset.path);
}

function dedupeRisks(risks) {
  const seen = new Set();
  return risks.filter(r => { const k = r.severity + r.msg; return seen.has(k) ? false : (seen.add(k), true); });
}

function visualRestoreCb(cb, type, checked) {
  if (type === 'file') setChipDeselected(cb.closest('.file-chip'), !checked);
  else setRowDeselected(cb.closest('tr'), !checked);
}

function applyToggle(cb, type, checked) {
  if      (type === 'ship')    applyShipToggle(cb.dataset.hullId, checked, cb);
  else if (type === 'variant') applyVariantToggle(cb.dataset.path, checked, cb);
  else if (type === 'skin')    applySkinToggle(cb.dataset.path, checked, cb);
  else                         applyFileToggle(cb.dataset.path, checked, cb);
}

// Apply ship toggle: cascades to all related files and variant table rows
function applyShipToggle(hullId, checked, sourceCb) {
  const entry = _shipPathById[hullId];
  if (!entry) return;
  if (sourceCb) { sourceCb.checked = checked; setRowDeselected(sourceCb.closest('tr'), !checked); }

  // Build the full cascade set for the change log
  const cascadePaths = [entry.path];
  if (entry.spritePath) cascadePaths.push(entry.spritePath);
  entry.skinPaths.forEach(p => cascadePaths.push(p));
  entry.skinSpritePaths.forEach(p => cascadePaths.push(p));
  entry.variantPaths.forEach(vPath => {
    cascadePaths.push(vPath);
    const vs = _variantSpriteByPath[vPath];
    if (vs) cascadePaths.push(vs);
  });

  if (!checked) {
    const shipName = entry.path.split('/').pop();
    const varCount = entry.variantPaths.length;
    const skinCount = entry.skinPaths.length;
    const sub = [varCount && `${varCount} variant${varCount!==1?'s':''}`, skinCount && `${skinCount} skin${skinCount!==1?'s':''}`, entry.spritePath && 'sprite'].filter(Boolean).join(', ');
    addChangeEntry('☑', `Excluded ship: ${shipName}${sub ? ` (+${sub})` : ''}`, entry.path, { cascade: cascadePaths });
  } else {
    _changeLog = _changeLog.filter(e => !cascadePaths.includes(e.path) || e.icon === '✂️');
    renderChangeLogSection();
  }

  syncFileCbByPath(entry.path, checked);
  if (entry.spritePath) syncFileCbByPath(entry.spritePath, checked);
  entry.skinPaths.forEach(p => syncFileCbByPath(p, checked));
  entry.skinSpritePaths.forEach(p => syncFileCbByPath(p, checked));
  entry.variantPaths.forEach(vPath => {
    const safe = vPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const vCb = document.querySelector(`.export-variant-cb[data-path="${safe}"]`);
    if (vCb) { vCb.checked = checked; setRowDeselected(vCb.closest('tr'), !checked); }
    syncFileCbByPath(vPath, checked);
    const vs = _variantSpriteByPath[vPath];
    if (vs) syncFileCbByPath(vs, checked);
  });
  refreshRiskBadges();
}

// Apply variant toggle: syncs file chip and sprite
function applyVariantToggle(path, checked, sourceCb) {
  if (sourceCb) { sourceCb.checked = checked; setRowDeselected(sourceCb.closest('tr'), !checked); }
  if (!checked) addChangeEntry('☑', `Excluded variant: ${path.split('/').pop()}`, path);
  else { _changeLog = _changeLog.filter(e => e.path !== path || e.icon === '✂️'); renderChangeLogSection(); }
  syncFileCbByPath(path, checked);
  const sp = _variantSpriteByPath[path];
  if (sp) syncFileCbByPath(sp, checked);
  refreshRiskBadges();
}

// Apply orphan skin toggle: syncs file chip
function applySkinToggle(path, checked, sourceCb) {
  if (sourceCb) { sourceCb.checked = checked; setRowDeselected(sourceCb.closest('tr'), !checked); }
  if (!checked) addChangeEntry('☑', `Excluded skin: ${path.split('/').pop()}`, path);
  else { _changeLog = _changeLog.filter(e => e.path !== path || e.icon === '✂️'); renderChangeLogSection(); }
  syncFileCbByPath(path, checked);
  refreshRiskBadges();
}

// Apply file chip toggle: also reverse-syncs ship / variant / skin table rows
function applyFileToggle(path, checked, sourceCb) {
  if (sourceCb) { sourceCb.checked = checked; setChipDeselected(sourceCb.closest('.file-chip'), !checked); }
  if (!checked) addChangeEntry('☑', `Excluded file: ${path.split('/').pop()}`, path);
  else { _changeLog = _changeLog.filter(e => e.path !== path || e.icon === '✂️'); renderChangeLogSection(); }
  const safe = path.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  // Reverse sync → ship table row (only for the actual .ship file, not sprites)
  const hullId = _shipFilePathToHullId[path];
  if (hullId) {
    const escapedId = hullId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const sCb = document.querySelector(`.export-ship-cb[data-hull-id="${escapedId}"]`);
    if (sCb) { sCb.checked = checked; setRowDeselected(sCb.closest('tr'), !checked); }
  }
  // Reverse sync → variant table row
  const vCb = document.querySelector(`.export-variant-cb[data-path="${safe}"]`);
  if (vCb) { vCb.checked = checked; setRowDeselected(vCb.closest('tr'), !checked); }
  // Reverse sync → orphan skin table row
  const skCb = document.querySelector(`.export-skin-cb[data-path="${safe}"]`);
  if (skCb) { skCb.checked = checked; setRowDeselected(skCb.closest('tr'), !checked); }
  refreshRiskBadges();
}

// ── LOW-LEVEL SYNC HELPERS ───────────────────────────────────────────────────
// Update a file chip checkbox by path without triggering onAnyCheckChange
function syncFileCbByPath(path, checked) {
  if (!path) return;
  const safe = path.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const cb = document.querySelector(`.export-file-cb[data-path="${safe}"]`);
  if (cb) { cb.checked = checked; setChipDeselected(cb.closest('.file-chip'), !checked); }
}

function setChipDeselected(chip, deselected) {
  if (!chip) return;
  chip.classList.toggle('export-deselected', deselected);
}

function setRowDeselected(row, deselected) {
  if (!row) return;
  row.classList.toggle('export-deselected', deselected);
}

// ── BULK OPERATIONS ───────────────────────────────────────────────────────────
// Bulk toggles bypass the risk modal (mass operation) but still cascade correctly.
function uncheckOrphanedFiles() {
  let skipped = 0;
  document.querySelectorAll('.export-file-cb').forEach(cb => {
    if (!_allOrphanPaths.has(cb.dataset.path)) return;
    if (getActiveRisksForPath(cb.dataset.path).some(r => r.severity === 'unsafe')) { skipped++; return; }
    applyFileToggle(cb.dataset.path, false, cb);
  });
  if (skipped > 0) showNotification(`Skipped ${skipped} orphan${skipped !== 1 ? 's' : ''} flagged UNSAFE to remove.`);
}

function toggleCheckboxes(className) {
  const boxes = Array.from(document.querySelectorAll('.' + className));
  const newState = !boxes.every(cb => cb.checked);
  let skipped = 0;
  boxes.forEach(cb => {
    const type = cbType(cb);
    if (!newState && getActiveRisksForPath(primaryPathForCb(cb, type)).some(r => r.severity === 'unsafe')) { skipped++; return; }
    applyToggle(cb, type, newState);
  });
  if (skipped > 0) showNotification(`Skipped ${skipped} unsafe referenced file${skipped !== 1 ? 's' : ''}.`);
}

// ── PER-CATEGORY FILE CONTROLS ────────────────────────────────────────────────
function toggleCategoryFiles(catId) {
  const cbs = Array.from(document.querySelectorAll(`.export-file-cb-${catId}`));
  const newState = !cbs.every(cb => cb.checked);
  let skipped = 0;
  cbs.forEach(cb => {
    if (!newState && getActiveRisksForPath(cb.dataset.path).some(r => r.severity === 'unsafe')) { skipped++; return; }
    applyFileToggle(cb.dataset.path, newState, cb);
  });
  if (skipped > 0) showNotification(`Skipped ${skipped} unsafe referenced file${skipped !== 1 ? 's' : ''}.`);
}

function uncheckCategoryOrphans(catId) {
  let skipped = 0;
  document.querySelectorAll(`.export-file-cb-${catId}`).forEach(cb => {
    if (!_allOrphanPaths.has(cb.dataset.path)) return;
    if (getActiveRisksForPath(cb.dataset.path).some(r => r.severity === 'unsafe')) { skipped++; return; }
    applyFileToggle(cb.dataset.path, false, cb);
  });
  if (skipped > 0) showNotification(`Skipped ${skipped} unsafe referenced orphan${skipped !== 1 ? 's' : ''}.`);
}

// ── RISK MODAL ────────────────────────────────────────────────────────────────
function showRiskModal(filePath, activeRisks, onProceed) {
  document.getElementById('risk-modal')?.remove();
  const fixGroups = buildRiskFixGroups(activeRisks);
  const allFixes = {};
  for (const group of fixGroups) for (const fix of group.fixes) allFixes[fix._fixIndex] = fix;
  _currentModal = { filePath, activeRisks, allFixes, fixGroups, onProceed };
  const fname = filePath.split('/').pop();
  const maxSev = activeRisks.some(r => r.severity === 'unsafe') ? 'unsafe' : 'warn';
  const sevColor = maxSev === 'unsafe' ? 'var(--red)' : 'var(--amber)';
  const fixRows = fixGroups.map((group, groupIdx) => {
    if (group.type === 'exclusive') {
      const existingIdx = group.fixes.findIndex(riskFixMatchesExistingAction);
      const defaultIdx = existingIdx >= 0 ? existingIdx : 0;
      return `<div class="risk-fix-group">
        <div class="risk-fix-group-label">${esc(group.label)} fix</div>
        ${group.fixes.map((fix, optIdx) => `
          <label class="risk-fix-row">
            <input type="radio" class="risk-fix-radio" name="risk-fix-group-${groupIdx}" data-fix-index="${fix._fixIndex}" ${optIdx === defaultIdx ? 'checked' : ''} style="cursor:pointer;flex-shrink:0">
            <span style="flex:1">${esc(fix.label)}</span>
            <span class="risk-fix-type">${riskFixTypeLabel(fix)}</span>
          </label>`).join('')}
      </div>`;
    }
    const fix = group.fixes[0];
    return `<label class="risk-fix-row">
      <input type="checkbox" class="risk-fix-cb" data-fix-index="${fix._fixIndex}" checked style="cursor:pointer;flex-shrink:0">
      <span style="flex:1">${esc(fix.label)}</span>
      <span class="risk-fix-type">${riskFixTypeLabel(fix)}</span>
    </label>`;
  }).join('');
  const modal = document.createElement('div');
  modal.id = 'risk-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = `<div class="risk-modal-inner">
    <div class="risk-modal-head">
      <span style="font-size:18px">${maxSev==='unsafe'?'🔴':'🟡'}</span>
      <span style="font-weight:700;color:${sevColor};font-family:var(--head);letter-spacing:1px;text-transform:uppercase">${maxSev==='unsafe'?'Unsafe Removal':'Removal Warning'}</span>
    </div>
    <div style="padding:4px 20px 10px;color:var(--text2);font-size:13px">
      Excluding <code style="color:var(--text);background:var(--bg3);padding:1px 5px;border-radius:3px">${esc(fname)}</code> may break your mod:
    </div>
    <div class="risk-modal-reasons">
      ${activeRisks.map(r=>`<div class="risk-reason risk-reason-${r.severity}"><span class="risk-sev">${r.severity.toUpperCase()}</span><span>${esc(r.msg)}</span></div>`).join('')}
    </div>
    ${fixRows ? `<div class="risk-modal-fixes"><div class="risk-fixes-label">Available fixes (applied to file content in the exported ZIP)</div>${fixRows}</div>` : ''}
    <div class="risk-modal-footer">
      <button class="btn" onclick="modalCancel()" style="background:var(--bg3)">Cancel (keep file)</button>
      <button class="btn" onclick="modalProceedNoFix()" style="color:var(--text2);border-color:var(--border2)">Proceed, no fixes</button>
      <button class="btn" style="color:${sevColor};border-color:${sevColor}" onclick="modalApplyAndProceed()">${fixRows?'Apply selected &amp; proceed':'Proceed anyway'}</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

function modalCancel() {
  if (_currentModal) {
    const safe = _currentModal.filePath.replace(/\\/g,'\\\\').replace(/"/g,'\\"');
    const cb = document.querySelector(`.export-file-cb[data-path="${safe}"]`);
    if (cb) { cb.checked = true; setChipDeselected(cb.closest('.file-chip'), false); }
  }
  _currentModal = null;
  document.getElementById('risk-modal')?.remove();
}

function modalProceedNoFix() {
  const proceed = _currentModal?.onProceed;
  _currentModal = null;
  document.getElementById('risk-modal')?.remove();
  proceed?.();
  refreshRiskBadges();
}

function modalApplyAndProceed() {
  if (!_currentModal) { document.getElementById('risk-modal')?.remove(); return; }
  const { allFixes, onProceed } = _currentModal;
  document.querySelectorAll('.risk-fix-cb:checked,.risk-fix-radio:checked').forEach(cb => {
    const fix = allFixes[parseInt(cb.dataset.fixIndex)];
    applyRiskFix(fix);
  });
  _currentModal = null;
  document.getElementById('risk-modal')?.remove();
  onProceed?.();
  refreshRiskBadges();
}

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
function showNotification(msg) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;bottom:24px;right:24px;background:var(--bg2);border:1px solid var(--amber);border-radius:6px;padding:12px 18px;color:var(--amber);font-size:13px;z-index:9998;box-shadow:0 4px 24px rgba(0,0,0,.7);max-width:360px;font-family:var(--mono)';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

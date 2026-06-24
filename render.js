// ── RENDER: Mod Info Panel ────────────────────────────────────────────────────
function renderModInfoPanel(modInfo, declaredDeps, undeclaredDeps) {
  // Meta row: author, id, game version
  const metaRow = $('mod-meta-row');
  if (modInfo) {
    const parts = [];
    if (modInfo.author) parts.push(`<span class="meta-item"><span class="meta-label">By</span> ${esc(modInfo.author)}</span>`);
    if (modInfo.id)     parts.push(`<span class="meta-item"><span class="meta-label">ID</span><code>${esc(modInfo.id)}</code></span>`);
    if (modInfo.gameVersion) parts.push(`<span class="meta-item"><span class="meta-label">Game</span> ${esc(modInfo.gameVersion)}</span>`);
    if (parts.length) {
      metaRow.innerHTML = `<div class="mod-meta">${parts.join('<span class="meta-sep">·</span>')}</div>`;
      metaRow.style.display = '';
    }
  }

  // Deps section
  const depsEl = $('mod-deps-section');
  if (!declaredDeps.length && !undeclaredDeps.length) { depsEl.style.display = 'none'; return; }

  let html = '';

  // ── Declared dependencies ────────────────────────────────────────────────
  if (declaredDeps.length) {
    html += `<div class="deps-group">
      <div class="deps-label">Declared Dependencies <span class="deps-count">${declaredDeps.length}</span></div>
      <div class="deps-chips">`;
    for (const dep of declaredDeps) {
      const tipLines = [
        `ID: ${dep.id || '?'}`,
        dep.version  ? `Required version: ${dep.version}` : null,
        dep.required === false ? `Optional dependency` : `Required`,
      ].filter(Boolean).join('\n');
      html += `<span class="dep-chip dep-chip-ok" data-tip="${esc(tipLines)}">
        <span class="dep-chip-name">${esc(dep.name || dep.id || '?')}</span>
        ${dep.version ? `<span class="dep-chip-ver" data-tip="Required version">${esc(dep.version)}</span>` : ''}
        ${dep.required === false ? `<span class="dep-chip-opt" data-tip="Optional — mod works without it">OPT</span>` : ''}
      </span>`;
    }
    html += `</div></div>`;
  }

  // ── Undeclared dependencies ───────────────────────────────────────────────
  if (undeclaredDeps.length) {
    html += `<div class="deps-group">
      <div class="deps-label deps-label-warn">
        ⚠ Undeclared Dependencies <span class="deps-count">${undeclaredDeps.length}</span>
        <span class="deps-warn-note">— used in mod files but missing from mod_info.json, can cause unexpected crashes</span>
      </div>
      <div class="deps-chips">`;
    for (const dep of undeclaredDeps) {
      const prefixList = dep.usedPrefixes.join(', ');
      const tipLines = [
        `Mod ID: ${dep.modId}`,
        dep.modName?.trim() && dep.modName.trim() !== dep.modId ? `Name: ${dep.modName.trim()}` : null,
        dep.author ? `Author: ${dep.author}` : null,
        dep.soft ? `Soft dependency — mod likely works without it,\n  but these features will be missing` : `Hard dependency — mod will likely crash without it`,
        dep.detectedVia === 'file'
          ? `Detected via: ${dep.detectionReason}`
          : `Prefixes detected: ${prefixList}\nExample references:\n  ${dep.exampleIds.slice(0,3).join('\n  ')}`,
      ].filter(Boolean).join('\n');
      const softBadge = dep.soft
        ? `<span class="dep-chip-soft" title="Soft dependency — mod works without it but loses these features">SOFT</span>`
        : `<span class="dep-chip-hard" title="Hard dependency — mod will likely crash without it">HARD</span>`;
      html += `<span class="dep-chip dep-chip-warn" data-tip="${esc(tipLines)}">
        <span class="dep-chip-name">${esc(dep.modName?.trim() || dep.modId)}</span>
        ${prefixList ? `<span class="dep-chip-prefix" title="Shorthand prefix(es) found in mod files">${esc(prefixList)}</span>` : ''}
        ${softBadge}
      </span>`;
    }
    html += `</div>`;
    if (_modInfoPath) {
      html += `<button class="btn dep-fix-btn" onclick="queueAddMissingDeps()">⚙ Add Missing Dependencies to mod_info.json</button>`;
    }
    html += `</div>`;
  }

  depsEl.innerHTML = html;
  depsEl.style.display = '';
}

function queueAddMissingDeps() {
  if (!_modInfoPath || !_undeclaredDepData.length) return;
  const depsToAdd = _undeclaredDepData.map(d => ({ id: d.modId, name: (d.modName?.trim() || d.modId) }));
  const desc = `Add ${depsToAdd.length} missing dep${depsToAdd.length > 1 ? 'endencies' : 'endency'} to mod_info.json`;
  if (!_pendingPatches[_modInfoPath]) _pendingPatches[_modInfoPath] = [];
  if (!_pendingPatches[_modInfoPath].some(p => p.description === desc)) {
    _pendingPatches[_modInfoPath].push({ description: desc, apply: text => {
      let obj;
      try { obj = parseStarsectorJson(text); } catch(e) { return text; }
      if (!Array.isArray(obj.dependencies)) obj.dependencies = [];
      const existingIds = new Set(obj.dependencies.map(d => (d.id || '').toLowerCase()));
      for (const dep of depsToAdd) {
        if (!existingIds.has(dep.id.toLowerCase())) obj.dependencies.push(dep);
      }
      return JSON.stringify(obj, null, 2);
    }});
    addChangeEntry('🔗', desc, _modInfoPath);
  }
  document.querySelectorAll('.dep-fix-btn').forEach(b => {
    b.disabled = true;
    b.textContent = `✓ Queued — will be applied on export`;
    b.style.color = 'var(--green)';
    b.style.borderColor = 'rgba(61,214,140,.4)';
  });
}

// ── RENDER ────────────────────────────────────────────────────────────────────
function renderResults(d) {
  const { ships, skins, variants, orphans, issues, csvById, csvShipsNotFound, allFilesByCat, allFiles, modInfo, orphanBytes, orphanPercent } = d;

  const okShips    = ships.filter(s => s.inCsv && !s.data?._parseError).length;
  const errShips   = ships.length - okShips;
  const okVariants = variants.filter(v => v.refOk && v.refType !== 'parse_error').length;
  const errVariants= variants.length - okVariants;
  const errCount   = issues.filter(i => i.severity === 'err').length;
  const warnCount  = issues.filter(i => i.severity === 'warn').length;

  $('summary-bar').innerHTML = `
    <div class="stat-card ${errCount>0?'err':warnCount>0?'warn':'ok'}">
      <div class="stat-label">Issues</div>
      <div class="stat-value">${issues.length}</div>
      <div class="stat-sub">${errCount} errors · ${warnCount} warnings</div>
    </div>
    <div class="stat-card ${errShips>0?'err':'ok'}">
      <div class="stat-label">Ships</div>
      <div class="stat-value">${ships.length}</div>
      <div class="stat-sub">${okShips} valid · ${errShips} issues</div>
    </div>
    <div class="stat-card info">
      <div class="stat-label">Skins</div>
      <div class="stat-value">${skins.length}</div>
      <div class="stat-sub">${skins.filter(sk=>sk.parentShip).length} linked to ships</div>
    </div>
    <div class="stat-card ${errVariants>0?'warn':'ok'}">
      <div class="stat-label">Variants</div>
      <div class="stat-value">${variants.length}</div>
      <div class="stat-sub">${okVariants} valid · ${errVariants} issues</div>
    </div>
    <div class="stat-card ${csvShipsNotFound.length>0?'warn':'ok'}">
      <div class="stat-label">CSV Entries</div>
      <div class="stat-value">${Object.keys(csvById).length}</div>
      <div class="stat-sub">${csvShipsNotFound.length} unmatched</div>
    </div>
    <div class="stat-card ${orphans.length>0?'warn':'ok'}">
      <div class="stat-label">Orphaned</div>
      <div class="stat-value">${orphans.length}</div>
      <div class="stat-sub">${formatBytes(orphanBytes)} · ${formatPercent(orphanPercent)} removable</div>
    </div>
    ${modInfo ? `<div class="stat-card info">
      <div class="stat-label">Mod Version</div>
      <div class="stat-value" style="font-size:16px">${modInfo.version||'—'}</div>
      <div class="stat-sub">${modInfo.gameVersion||''}</div>
    </div>` : ''}
  `;

  const container = $('sections-container');
  container.innerHTML = '';

  addSection(container, '⚠', 'ISSUES & WARNINGS', issues.length,
    issues.length===0?'ok':errCount>0?'err':'warn',
    issues.length===0?'All checks passed':`${errCount} errors, ${warnCount} warnings`,
    renderIssues(issues), issues.length>0);

  addSection(container, '🚀', 'SHIPS & SKINS', ships.length,
    errShips>0?'err':'ok',
    `${okShips}/${ships.length} ships in CSV · ${skins.length} skins`,
    renderShipTree(ships, skins, csvById), true);

  if (csvShipsNotFound.length>0) {
    addSection(container, '📊', 'CSV ENTRIES WITHOUT HULL FILES', csvShipsNotFound.length,
      'warn', 'These IDs in ship_data.csv have no .ship or .skin file',
      renderCsvMissing(csvShipsNotFound, csvById), true);
  }

  addSection(container, '🔩', 'VARIANT FILES', variants.length,
    errVariants>0?'warn':'ok',
    `${okVariants}/${variants.length} valid`,
    renderVariantTable(variants), variants.length>0);

  addSection(container, '📁', 'FILE INVENTORY', allFiles.length,
    orphans.length>0?'warn':'info',
    orphans.length===0?'All mod files grouped by type':`${formatBytes(orphanBytes)} (${formatPercent(orphanPercent)}) potentially removable`,
    renderFileInventory(allFilesByCat), false);

  // Change-log section — appended last so it appears at the bottom, hidden until patches are queued
  const clSection = document.createElement('div');
  clSection.id = 'change-log-section';
  clSection.className = 'section';
  clSection.style.cssText = 'display:none;border-color:rgba(74,158,255,.4)';
  clSection.innerHTML = `
    <div class="section-header" style="background:rgba(74,158,255,.06)" onclick="toggleSection(this)">
      <span class="section-icon">📋</span>
      <span class="section-title">PENDING EXPORT CHANGES</span>
      <span class="section-badge badge-info change-log-count-badge"></span>
      <span class="chevron">▲</span>
    </div>
    <div class="section-body open change-log-body"></div>`;
  container.appendChild(clSection);
  renderChangeLogSection();

  scheduleThumbLoad();
  refreshRiskBadges();
}

// ── RENDER: Issues ────────────────────────────────────────────────────────────
function renderIssues(issues) {
  if (!issues.length) return '<div class="empty">✓ No issues detected</div>';
  return `<div class="table-wrap"><table>
    <thead><tr><th>SEV</th><th>ISSUE</th><th>DETAIL</th></tr></thead>
    <tbody>${issues.map(i=>`<tr>
      <td><span class="status-dot ${i.severity==='err'?'dot-err':'dot-warn'}"></span><span class="td-tag ${i.severity==='err'?'tag-missing':'tag-warn'}">${i.severity.toUpperCase()}</span></td>
      <td style="font-weight:500;color:${i.severity==='err'?'var(--red)':'var(--amber)'}">${esc(i.msg)}</td>
      <td style="color:var(--text2);font-size:12px">${esc(i.detail)}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

// ── RENDER: Ship tree (ships with nested skins) ───────────────────────────────
function spriteThumbHtml(spritePath, size = 36) {
  if (!spritePath) return `<span style="color:var(--text3);font-size:10px;opacity:.5">—</span>`;
  return `<div class="sprite-cell" data-sprite-path="${esc(spritePath)}" onmouseenter="showSpritePreview(this,event)" onmouseleave="hideSpritePreview()">
    <img class="sprite-thumb" data-path="${esc(spritePath)}" width="${size}" height="${size}" style="object-fit:contain;image-rendering:pixelated;background:rgba(0,0,0,.5);border-radius:3px;display:block;cursor:zoom-in">
  </div>`;
}

function renderShipTree(ships, skins, csvById) {
  const tid = 'ship-tbl';

  _shipPathById = {};
  _shipFilePathToHullId = {};
  for (const s of ships) {
    _shipPathById[s.hullId] = {
      path: s.path,
      spritePath: s.spritePath || null,
      skinPaths: s.skins.map(sk => sk.path),
      skinSpritePaths: s.skins.map(sk => sk.spritePath).filter(Boolean),
      variantPaths: s.variants.map(v => v.path),
    };
    _shipFilePathToHullId[s.path] = s.hullId;
  }

  const orphanSkins = skins.filter(sk => !sk.parentShip);

  const rows = ships.map(s => {
    const hasErr = !!s.data?._parseError;
    const ok = s.inCsv && !hasErr;
    const statusDot  = ok ? 'dot-ok' : 'dot-err';
    const statusTag  = ok ? 'tag-ok' : 'tag-missing';
    const statusText = hasErr ? 'PARSE ERR' : s.inCsv ? 'OK' : 'NOT IN CSV';
    const searchKey  = (s.hullId+' '+s.shortName+' '+(s.csvRow?.name||'')).toLowerCase();

    const skinRows = s.skins.map(sk => {
      const skErr = !!sk.data?._parseError;
      return `<tr class="skin-row" data-parent-ship="${esc(s.hullId)}" data-status="${skErr?'error':'ok'}" data-name="${esc(sk.skinHullId.toLowerCase())} ${esc(sk.shortName.toLowerCase())}">
        <td style="padding-left:32px"><span class="td-tag" style="color:#c87eff;border-color:rgba(200,126,255,.3);background:rgba(200,126,255,.06);font-size:9px">SKIN</span><span style="color:var(--text3);font-size:10px;margin-left:4px">with parent</span></td>
        <td>${spriteThumbHtml(sk.spritePath, 28)}</td>
        <td class="td-mono" style="color:#c87eff">${esc(sk.skinHullId)}</td>
        <td style="color:var(--text2);font-size:12px">${esc(sk.shortName)}</td>
        <td class="td-path">${esc(sk.path)}</td>
        <td style="color:var(--text3);font-size:11px">base: <span style="color:var(--text2)">${esc(sk.baseHullId||'—')}</span></td>
        <td>${sk.inHullsFolder?'<span class="td-tag tag-ok">hulls/</span>':'<span class="td-tag tag-warn">other</span>'}</td>
        <td>${skErr?`<span style="color:var(--red);font-family:var(--mono);font-size:11px">${esc(sk.data._parseError)}</span>`:'—'}</td>
      </tr>`;
    }).join('');

    return `<tr data-status="${ok?'ok':'error'}" data-name="${searchKey}" class="ship-row">
      <td><input type="checkbox" class="export-ship-cb" checked data-hull-id="${esc(s.hullId)}" onchange="onAnyCheckChange(this)" title="Include ship, skins and variants in export" style="margin-right:6px;cursor:pointer;vertical-align:middle"><span class="status-dot ${statusDot}"></span><span class="td-tag ${statusTag}">${statusText}</span>
        ${s.skins.length?`<span class="td-tag" style="color:#c87eff;border-color:rgba(200,126,255,.3);background:rgba(200,126,255,.06);margin-left:4px">${s.skins.length} skin${s.skins.length>1?'s':''}</span>`:''}
      </td>
      <td>${spriteThumbHtml(s.spritePath)}</td>
      <td class="td-mono">${esc(s.hullId)}</td>
      <td>${esc(s.shortName)}</td>
      <td class="td-path">${esc(s.path)}</td>
      <td style="font-size:12px;color:var(--text2)">${s.csvRow?esc(s.csvRow.name||'—'):'<span style="color:var(--red)">—</span>'}</td>
      <td>${s.inHullsFolder?'<span class="td-tag tag-ok">hulls/</span>':'<span class="td-tag tag-warn">other</span>'}</td>
      <td>${hasErr?`<span style="color:var(--red);font-family:var(--mono);font-size:11px">${esc(s.data._parseError)}</span>`:'—'}</td>
    </tr>${skinRows}`;
  }).join('');

  const orphanSkinRows = orphanSkins.map(sk => {
    const skErr = !!sk.data?._parseError;
    const statusText = skErr ? 'PARSE ERR' : sk.baseHullId ? 'BAD BASE' : 'NO BASE';
    const baseText = skErr ? 'not parsed' : `baseHullId: ${sk.baseHullId || 'missing'}`;
    return `<tr data-status="error" data-name="${esc(sk.skinHullId.toLowerCase())}">
      <td><input type="checkbox" class="export-skin-cb" checked data-path="${esc(sk.path)}" onchange="onAnyCheckChange(this)" title="Include in export" style="margin-right:6px;cursor:pointer;vertical-align:middle"><span class="status-dot ${skErr?'dot-err':'dot-warn'}"></span><span class="td-tag ${skErr?'tag-missing':'tag-warn'}">${statusText}</span>
        <span class="td-tag" style="color:#c87eff;border-color:rgba(200,126,255,.3);background:rgba(200,126,255,.06)">SKIN</span>
      </td>
      <td>${spriteThumbHtml(sk.spritePath, 28)}</td>
      <td class="td-mono" style="color:#c87eff">${esc(sk.skinHullId)}</td>
      <td>${esc(sk.shortName)}</td>
      <td class="td-path">${esc(sk.path)}</td>
      <td style="color:${skErr?'var(--text3)':'var(--red)'};font-size:12px">${esc(baseText)}</td>
      <td>${sk.inHullsFolder?'<span class="td-tag tag-ok">hulls/</span>':'<span class="td-tag tag-warn">other</span>'}</td>
      <td>${skErr?`<span style="color:var(--red);font-family:var(--mono);font-size:11px">${esc(sk.data._parseError)}</span>`:'—'}</td>
    </tr>`;
  }).join('');

  const total = ships.length + skins.length;
  const limitedRows = limitRows(rows + orphanSkinRows, tid, 3);
  const initialShown = Math.min(total, 3);
  return `
    <div class="filter-bar">
      <input class="filter-input" placeholder="Filter by hull ID, name…" oninput="filterTable('${tid}',this.value)" id="${tid}-search">
      <div class="filter-btns">
        <button class="filter-btn active" onclick="filterTableStatus('${tid}','all',this)">ALL</button>
        <button class="filter-btn" onclick="filterTableStatus('${tid}','ok',this)">OK</button>
        <button class="filter-btn" onclick="filterTableStatus('${tid}','error',this)">ISSUES</button>
      </div>
      <button class="btn btn-sm" onclick="toggleCheckboxes('export-ship-cb')" style="margin-left:8px">☑ Toggle All</button>
      <span class="table-count" id="${tid}-count">${total > 3 ? `${initialShown} shown · ` : ''}${ships.length} ships · ${skins.length} skins</span>
    </div>
    <div class="table-wrap"><table id="${tid}">
      <thead><tr><th>EXPORT / STATUS</th><th>SPRITE</th><th>HULL ID</th><th>FILE</th><th>PATH</th><th>CSV NAME / BASE</th><th>LOCATION</th><th>ERROR</th></tr></thead>
      <tbody>${limitedRows.html}</tbody>
    </table></div>
    ${limitedRows.control}`;
}

// ── RENDER: CSV missing ───────────────────────────────────────────────────────
function renderCsvMissing(ids, csvById) {
  return `<div class="table-wrap"><table>
    <thead><tr><th>HULL ID</th><th>NAME IN CSV</th><th>DESIGNATION</th></tr></thead>
    <tbody>${ids.map(id=>{const r=csvById[id];return`<tr>
      <td class="td-mono">${esc(id)}</td>
      <td style="color:var(--text2)">${r?esc(r.name||'—'):'—'}</td>
      <td style="font-size:12px;color:var(--text3)">${r?esc(r.designation||r.class||'—'):'—'}</td>
    </tr>`;}).join('')}</tbody></table></div>`;
}

// ── RENDER: Variants ──────────────────────────────────────────────────────────
function renderVariantTable(variants) {
  const tid = 'var-tbl';

  const byShip = {};
  const unresolved = [];
  for (const v of variants) {
    if (v.resolvedShip) {
      const key = v.resolvedShip.hullId;
      if (!byShip[key]) byShip[key] = { ship: v.resolvedShip, variants: [] };
      byShip[key].variants.push(v);
    } else {
      unresolved.push(v);
    }
  }

  let rows = '';
  for (const key of Object.keys(byShip)) {
    const group = byShip[key];
    const s = group.ship;
    rows += `<tr class="var-group-header" style="background:var(--bg3)">
      <td colspan="8" style="padding:0;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:8px;padding:6px 16px;font-family:var(--mono);font-size:11px;color:var(--text2)">
          ${spriteThumbHtml(s.spritePath, 24)}
          <span class="td-tag tag-ship">SHIP</span>
          <span style="color:var(--text)">${esc(s.hullId)}</span>
          <span style="color:var(--text3)">${esc(s.shortName)}</span>
          <span style="color:var(--text3);margin-left:auto">${group.variants.length} variant${group.variants.length>1?'s':''}</span>
        </div>
      </td>
    </tr>`;
    for (const v of group.variants) rows += variantRow(v);
  }
  for (const v of unresolved) rows += variantRow(v);

  const limitedRows = limitRows(rows, tid, 3);
  const initialShown = Math.min(variants.length, 3);
  return `
    <div class="filter-bar">
      <input class="filter-input" placeholder="Filter variants…" oninput="filterTable('${tid}',this.value)" id="${tid}-search">
      <div class="filter-btns">
        <button class="filter-btn active" onclick="filterTableStatus('${tid}','all',this)">ALL</button>
        <button class="filter-btn" onclick="filterTableStatus('${tid}','ok',this)">OK</button>
        <button class="filter-btn" onclick="filterTableStatus('${tid}','error',this)">ISSUES</button>
      </div>
      <button class="btn btn-sm" onclick="toggleCheckboxes('export-variant-cb')" style="margin-left:8px">☑ Toggle All</button>
      <span class="table-count" id="${tid}-count">${variants.length > 3 ? `${initialShown} shown · ` : ''}${variants.length} variants</span>
    </div>
    <div class="table-wrap"><table id="${tid}">
      <thead><tr><th>EXPORT / STATUS</th><th>SPRITE</th><th>VARIANT FILE</th><th>REFERENCES</th><th>REF TYPE</th><th>RESOLVED SHIP</th><th>PATH</th><th>ERROR</th></tr></thead>
      <tbody>${limitedRows.html}</tbody>
    </table></div>
    ${limitedRows.control}`;
}

function variantRow(v) {
  const ok = v.refOk && v.refType !== 'parse_error';
  const statusDot  = ok ? 'dot-ok' : v.refType==='missing'?'dot-err':'dot-warn';
  const statusTag  = ok ? 'tag-ok' : v.refType==='missing'?'tag-missing':'tag-warn';
  const statusText = v.refType==='parse_error'?'PARSE ERR':v.refType==='missing'?'BAD REF':ok?'OK':'NO REF';
  const refTypeBadge = v.refType==='skin'
    ? '<span class="td-tag" style="color:#c87eff;border-color:rgba(200,126,255,.3);background:rgba(200,126,255,.06)">→ SKIN</span>'
    : v.refType==='ship' ? '<span class="td-tag tag-ship">→ SHIP</span>'
    : v.refType==='missing' ? '<span class="td-tag tag-missing">MISSING</span>'
    : '<span class="td-tag badge-muted">—</span>';
  const resolvedLabel = v.resolvedShip
    ? `<span class="td-mono" style="font-size:11px">${esc(v.resolvedShip.hullId)}</span>`
    : v.refType==='missing' ? '<span style="color:var(--red);font-size:11px">unresolved</span>' : '—';

  return `<tr data-status="${ok?'ok':'error'}" data-name="${esc(v.shortName.toLowerCase())} ${esc(v.refId||'')}">
    <td><input type="checkbox" class="export-variant-cb" checked data-path="${esc(v.path)}" onchange="onAnyCheckChange(this)" title="Include variant in export" style="margin-right:6px;cursor:pointer;vertical-align:middle"><span class="status-dot ${statusDot}"></span><span class="td-tag ${statusTag}">${statusText}</span></td>
    <td>${spriteThumbHtml(v.spritePath, 28)}</td>
    <td style="font-size:12px">${esc(v.shortName)}</td>
    <td class="td-mono" style="font-size:11px">${esc(v.refId||'—')}</td>
    <td>${refTypeBadge}</td>
    <td>${resolvedLabel}</td>
    <td class="td-path">${esc(v.path)}</td>
    <td>${v.refType==='parse_error'?`<span style="color:var(--red);font-family:var(--mono);font-size:11px">${esc(v.data._parseError)}</span>`:'—'}</td>
  </tr>`;
}

// ── RENDER: File inventory ────────────────────────────────────────────────────
function renderFileInventory(allFilesByCat) {
  const totalOrphans = Object.values(allFilesByCat).flat().filter(f => f.orphan).length;
  let html = `<div class="inv-global-bar">
    <button class="btn btn-sm" onclick="toggleCheckboxes('export-file-cb')">☑ Toggle All Files</button>
    ${totalOrphans ? `<button class="btn btn-sm inv-orphan-btn" onclick="uncheckOrphanedFiles()">✕ Uncheck All ${totalOrphans} Orphaned</button>` : ''}
    <span style="color:var(--text3);font-size:11px">Checkboxes control which files go into the ZIP export.</span>
  </div>`;
  for (const cat of FILE_CATEGORIES) {
    const files = allFilesByCat[cat.id];
    if (!files?.length) continue;
    const orphanCount = files.filter(f => f.orphan).length;
    const orphanBytes = files.filter(f => f.orphan).reduce((sum, f) => sum + (f.size || 0), 0);
    const groupId = `files-${cat.id}`;
    const cbClass = `export-file-cb export-file-cb-${cat.id}`;
    html += `<div class="redund-group">
      <div class="redund-group-header" onclick="toggleGroup(event,this)">
        <span class="group-icon">${cat.icon}</span>
        <span class="group-name">${cat.label}</span>
        <span class="group-count">(${files.length} file${files.length!==1?'s':''})</span>
        ${orphanCount ? `<span class="td-tag tag-warn">${orphanCount} orphan${orphanCount!==1?'s':''} · ${formatBytes(orphanBytes)}</span>` : ''}
        <div class="group-actions">
          <button class="btn btn-sm btn-xs" onclick="toggleCategoryFiles('${cat.id}',this)">☑ Toggle</button>
          ${orphanCount ? `<button class="btn btn-sm btn-xs inv-orphan-btn" onclick="uncheckCategoryOrphans('${cat.id}')">✕ Orphans</button>` : ''}
          <span style="color:var(--text3);font-size:11px">${cat.desc}</span>
        </div>
        <span class="group-chevron">▼</span>
      </div>
      <div class="redund-group-body">
        <div class="file-chips">
          ${files.map((f, index)=>{
            const ext = f.name.includes('.')?f.name.split('.').pop().toLowerCase():'';
            const ownerText = fileOwnerText(f);
            const isImg = /^(png|jpg|jpeg|webp|svg)$/.test(ext);
            const thumbHtml = isImg
              ? `<div class="sprite-cell chip-sprite" data-sprite-path="${esc(f.path)}" onmouseenter="showSpritePreview(this,event)" onmouseleave="hideSpritePreview()"><img class="sprite-thumb" data-path="${esc(f.path)}" width="20" height="20" style="object-fit:contain;image-rendering:pixelated;display:block;cursor:zoom-in"></div>`
              : '';
            return `<div class="file-chip ${index >= 3 ? 'is-collapsed-entry' : ''}" data-collapse-group="${groupId}" data-chip-path="${esc(f.path)}" title="${esc(f.path)}">
              <input type="checkbox" class="${cbClass}" checked data-path="${esc(f.path)}" onchange="onAnyCheckChange(this)" style="margin-right:4px;cursor:pointer;flex-shrink:0">
              ${thumbHtml}
              <span class="chip-ext ${getExtClass(ext)}">.${ext||'?'}</span>
              <span>${esc(f.name)}</span>
              <span class="td-tag badge-muted">${formatBytes(f.size || 0)}</span>
              ${f.orphan && f.orphanNote
                ? `<span class="td-tag tag-warn" title="${esc(f.orphanNote.note)}">orphan</span><span class="td-tag tag-missing" title="${esc(f.orphanNote.note)}" style="cursor:help">${esc(f.orphanNote.tag)}</span>`
                : f.orphan && f.cat?.id === 'other'
                  ? `<span class="td-tag tag-warn">orphan</span><span class="td-tag badge-muted" title="File type is unrecognised — purpose unknown, removal risk cannot be assessed" style="cursor:help">? UNKNOWN</span>`
                  : f.orphan ? '<span class="td-tag tag-warn">orphan</span>' : ''}
              ${ownerText ? `<span class="td-tag ${f.orphan?'tag-warn':'tag-ok'}" title="${esc(ownerText)}">${esc(ownerText)}</span>` : ''}
              <span class="risk-badge td-tag" style="display:none"></span>
            </div>`;
          }).join('')}
        </div>
        ${files.length > 3 ? showAllControl(groupId, files.length - 3) : ''}
      </div>
    </div>`;
  }
  return html || '<div class="empty">No files found</div>';
}

function getExtClass(ext) {
  const m = {
    ship:'tag-ship', skin:'tag-variant', variant:'tag-variant',
    wpn:'tag-weapon', proj:'tag-weapon', wing:'tag-wing',
    csv:'tag-ok', json:'badge-info', version:'badge-info',
    faction:'tag-ship', system:'badge-info', 'star_system':'badge-info', planet:'badge-info',
  };
  return m[ext] || 'badge-muted';
}

function fileOwnerText(file) {
  if (!file.owners?.length) return '';
  const labels = file.owners.slice(0, 2).map(o => {
    const parent = o.parentId ? ` → ${o.parentId}` : '';
    return `${o.type}: ${o.id}${parent}`;
  });
  const extra = file.owners.length > labels.length ? ` +${file.owners.length - labels.length}` : '';
  return labels.join(', ') + extra;
}

// ── UI HELPERS ────────────────────────────────────────────────────────────────
function addSection(container, icon, title, count, badgeType, badgeText, bodyHtml, open=false) {
  const div = document.createElement('div');
  div.className = 'section';
  div.innerHTML = `
    <div class="section-header" onclick="toggleSection(this)">
      <span class="section-icon">${icon}</span>
      <span class="section-title">${title}</span>
      <span class="section-badge badge-${badgeType}">${esc(badgeText)}</span>
      <span class="section-badge badge-muted" style="margin-left:4px">${count}</span>
      <span class="chevron">${open?'▲':'▼'}</span>
    </div>
    <div class="section-body ${open?'open':''}">${bodyHtml}</div>
  `;
  container.appendChild(div);
}

function toggleSection(header) {
  const body = header.nextElementSibling;
  const ch   = header.querySelector('.chevron');
  const open = body.classList.toggle('open');
  ch.textContent = open ? '▲' : '▼';
}

function toggleGroup(event, header) {
  if (event?.target?.closest('button,input,a')) return;
  const body = header.nextElementSibling;
  const ch = header.querySelector('.group-chevron');
  const open = body?.classList.toggle('open');
  if (ch) ch.textContent = open ? '▲' : '▼';
}

function filterTable(tableId, search) {
  const tbl = $(tableId);
  if (!tbl) return;
  const q = search.toLowerCase();
  const sf = tbl._statusFilter;
  if ((q || (sf && sf !== 'all')) && !tbl._expanded) expandCollapsed(tableId);
  let vis = 0;
  const rows = Array.from(tbl.tBodies[0].rows);

  // First pass: show/hide data rows, track visibility per group header
  let currentHeader = null;
  let headerHasVisible = false;
  const headerVisibility = new Map(); // header tr → hasAnyVisibleChild

  for (const tr of rows) {
    if (tr.classList.contains('var-group-header')) {
      if (currentHeader) headerVisibility.set(currentHeader, headerHasVisible);
      currentHeader = tr;
      headerHasVisible = false;
      continue;
    }
    const match = !q || tr.dataset.name?.includes(q) || tr.textContent.toLowerCase().includes(q);
    const statusMatch = !sf || sf === 'all' || tr.dataset.status === sf;
    const collapsed = tr.classList.contains('is-collapsed-entry') && !tbl._expanded;
    const show = match && statusMatch && !collapsed;
    tr.style.display = show ? '' : 'none';
    if (show) { vis++; headerHasVisible = true; }
  }
  if (currentHeader) headerVisibility.set(currentHeader, headerHasVisible);

  // Second pass: hide group headers that have no visible children
  for (const [headerTr, hasVisible] of headerVisibility) {
    const collapsedHeader = headerTr.classList.contains('is-collapsed-entry') && !tbl._expanded;
    headerTr.style.display = (hasVisible && !collapsedHeader) ? '' : 'none';
  }

  const c = $(tableId + '-count');
  if (c) c.textContent = vis + ' shown';
}

function filterTableStatus(tableId, status, btn) {
  const tbl = $(tableId);
  if (!tbl) return;
  tbl._statusFilter = status;
  btn.closest('.filter-btns').querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  filterTable(tableId, $(tableId+'-search')?.value||'');
}

function limitRows(rowsHtml, groupId, limit) {
  const rows = rowsHtml.match(/<tr[\s\S]*?<\/tr>/g) || [];
  if (rows.length <= limit) return { html: rowsHtml, control: '' };
  const html = rows.map((row, index) => index < limit ? row : markCollapsed(row, groupId)).join('');
  return { html, control: showAllControl(groupId, rows.length - limit) };
}

function markCollapsed(html, groupId) {
  return html.replace(/^<tr\b([^>]*)>/i, (match, attrs) => {
    let nextAttrs = attrs || '';
    if (/class="/i.test(nextAttrs)) nextAttrs = nextAttrs.replace(/class="([^"]*)"/i, 'class="$1 is-collapsed-entry"');
    else nextAttrs += ' class="is-collapsed-entry"';
    return `<tr${nextAttrs} data-collapse-group="${esc(groupId)}">`;
  });
}

function showAllControl(groupId, hiddenCount) {
  return `<div class="show-more-row" data-collapse-control="${esc(groupId)}">
    <button class="btn btn-sm" type="button" onclick="expandCollapsed('${esc(groupId)}', this)">Show all ${hiddenCount} more</button>
  </div>`;
}

function expandCollapsed(groupId, btn) {
  const selector = `[data-collapse-group="${groupId}"]`;
  document.querySelectorAll(selector).forEach(el => {
    el.classList.remove('is-collapsed-entry');
    if (el.tagName === 'TR') el.style.display = '';
  });
  const table = $(groupId);
  if (table && !table._expanded) {
    table._expanded = true;
    filterTable(groupId, $(groupId+'-search')?.value || '');
  }
  document.querySelectorAll(`[data-collapse-control="${groupId}"]`).forEach(el => el.remove());
  btn?.closest('.show-more-row')?.remove();
}

// ── SPRITE PREVIEW ────────────────────────────────────────────────────────────
function getTooltip() {
  if (!_spriteTooltip) {
    _spriteTooltip = document.createElement('div');
    _spriteTooltip.id = 'sprite-tooltip';
    _spriteTooltip.style.cssText = 'position:fixed;display:none;pointer-events:none;z-index:9999;background:var(--bg2);border:1px solid var(--border2);border-radius:6px;padding:6px;box-shadow:0 4px 24px rgba(0,0,0,.7)';
    document.body.appendChild(_spriteTooltip);
    document.addEventListener('mousemove', e => {
      if (_spriteTooltip.style.display !== 'none') placeTooltip(e);
    });
  }
  return _spriteTooltip;
}

async function showSpritePreview(el, event) {
  const path = el.dataset.spritePath;
  if (!path) return;
  const url = await getSpriteUrl(path);
  if (!url) return;
  const tip = getTooltip();
  tip.innerHTML = `<img src="${url}" style="display:block;max-width:240px;max-height:240px;object-fit:contain;image-rendering:pixelated">`;
  tip.style.display = 'block';
  placeTooltip(event);
}

function hideSpritePreview() {
  if (_spriteTooltip) _spriteTooltip.style.display = 'none';
}

function placeTooltip(e) {
  const tip = _spriteTooltip;
  const x = e.clientX + 18, y = e.clientY - 12;
  tip.style.left = Math.min(x, window.innerWidth  - 270) + 'px';
  tip.style.top  = Math.max(8, Math.min(y, window.innerHeight - 270)) + 'px';
}

async function getSpriteUrl(path) {
  if (_spriteUrlCache[path]) return _spriteUrlCache[path];
  const file = _byPath[path];
  if (!file) return null;
  const url = URL.createObjectURL(file);
  _spriteUrlCache[path] = url;
  return url;
}

function scheduleThumbLoad() {
  // Eagerly load thumbnails in the background after render
  setTimeout(async () => {
    for (const img of document.querySelectorAll('img.sprite-thumb[data-path]')) {
      if (img.src && img.src !== window.location.href) continue;
      const url = await getSpriteUrl(img.dataset.path);
      if (url) img.src = url;
    }
  }, 80);
}

// ── PATCH & CHANGE LOG ────────────────────────────────────────────────────────
function removePatchesForPath(path) {
  if (!path || !_pendingPatches[path]) return;
  delete _pendingPatches[path];
  _changeLog = _changeLog.filter(e => e.icon !== '✂️' || e.path !== path);
}

function removeExclusionsForPath(path) {
  if (!path) return [];
  const removed = [];
  _changeLog = _changeLog.filter(e => {
    if (e.icon === '✂️') return true;
    if (e.path === path || (Array.isArray(e.cascade) && e.cascade.includes(path))) {
      removed.push(e);
      return false;
    }
    return true;
  });
  return removed;
}

function setPathIncludedVisual(path) {
  if (!path) return;
  syncFileCbByPath(path, true);
  const safe = path.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const vCb = document.querySelector(`.export-variant-cb[data-path="${safe}"]`);
  if (vCb) { vCb.checked = true; setRowDeselected(vCb.closest('tr'), false); }
  const skCb = document.querySelector(`.export-skin-cb[data-path="${safe}"]`);
  if (skCb) { skCb.checked = true; setRowDeselected(skCb.closest('tr'), false); }
  const hullId = _shipFilePathToHullId[path];
  if (hullId) {
    const escapedId = hullId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const sCb = document.querySelector(`.export-ship-cb[data-hull-id="${escapedId}"]`);
    if (sCb) { sCb.checked = true; setRowDeselected(sCb.closest('tr'), false); }
  }
}

function ensurePatchTargetIncluded(path) {
  if (!path) return;
  const removedExclusions = removeExclusionsForPath(path);
  for (const entry of removedExclusions) {
    if (Array.isArray(entry.cascade)) entry.cascade.forEach(setPathIncludedVisual);
    else setPathIncludedVisual(entry.path);
  }
  setPathIncludedVisual(path);
}

function addChangeEntry(icon, title, path, meta = {}) {
  if (icon !== '✂️') {
    removePatchesForPath(path);
    if (Array.isArray(meta.cascade)) meta.cascade.forEach(removePatchesForPath);
  }
  if (_changeLog.some(e => e.title === title && e.path === path)) return;
  const id = Date.now() + Math.random();
  _changeLog.push({ icon, title, path, id, ...meta });
  renderChangeLogSection();
}

function addPatch(path, description, applyFn) {
  ensurePatchTargetIncluded(path);
  if (!_pendingPatches[path]) _pendingPatches[path] = [];
  if (_pendingPatches[path].some(p => p.description === description)) return;
  _pendingPatches[path].push({ description, apply: applyFn });
  addChangeEntry('✂️', description, path);
}

function undoChangeEntry(id) {
  const entry = _changeLog.find(e => e.id === id);
  if (!entry) return;
  _changeLog = _changeLog.filter(e => e.id !== id);
  if (entry.icon === '✂️') {
    // Undo patch: remove from pendingPatches
    if (_pendingPatches[entry.path]) {
      _pendingPatches[entry.path] = _pendingPatches[entry.path].filter(p => p.description !== entry.title);
      if (!_pendingPatches[entry.path].length) delete _pendingPatches[entry.path];
    }
  } else {
    // Undo exclusion: re-check via the appropriate toggle
    if (entry.cascade) {
      // Ship-level cascade entry — re-check via ship toggle
      const hullId = _shipFilePathToHullId[entry.path];
      if (hullId) {
        const escapedId = hullId.replace(/\\/g,'\\\\').replace(/"/g,'\\"');
        const sCb = document.querySelector(`.export-ship-cb[data-hull-id="${escapedId}"]`);
        if (sCb) applyShipToggle(hullId, true, sCb);
      }
    } else {
      const safe = entry.path.replace(/\\/g,'\\\\').replace(/"/g,'\\"');
      const cb = document.querySelector(`.export-file-cb[data-path="${safe}"]`);
      if (cb) applyFileToggle(entry.path, true, cb);
    }
  }
  renderChangeLogSection();
}

function clearAllPatches() {
  _pendingPatches = {};
  _changeLog = [];
  renderChangeLogSection();
}

function renderChangeLogSection() {
  const el = document.getElementById('change-log-section');
  if (!el) return;
  const badge = el.querySelector('.change-log-count-badge');
  const headerBtn = document.getElementById('header-export-btn');
  if (!_changeLog.length) {
    el.style.display = 'none';
    if (badge) badge.textContent = '';
    if (headerBtn) headerBtn.style.display = '';
    return;
  }
  el.style.display = 'block';
  if (headerBtn) headerBtn.style.display = 'none';
  const patches = _changeLog.filter(e => e.icon === '✂️');
  const exclusions = _changeLog.filter(e => e.icon !== '✂️');
  if (badge) badge.textContent = `${exclusions.length} excluded · ${patches.length} patched`;
  const body = el.querySelector('.change-log-body');
  if (!body) return;
  const entriesByCat = {};
  for (const entry of _changeLog) {
    const name = entry.path?.split('/').pop() || '';
    const cat = categoriseFile(name, entry.path || '');
    if (!entriesByCat[cat.id]) entriesByCat[cat.id] = { cat, entries: [] };
    entriesByCat[cat.id].entries.push(entry);
  }
  const renderEntries = (entries) => entries.map(e => {
    const sub = e.cascade?.length > 1
      ? `<div class="change-entry-cascade">${e.cascade.slice(1).map(p=>`<span class="change-entry-sub">${esc(p.split('/').pop())}</span>`).join('')}</div>`
      : '';
    return `<div class="change-entry">
      <span class="change-entry-icon">${e.icon}</span>
      <div class="change-entry-detail">
        <div class="change-entry-title">${esc(e.title)}</div>
        <div class="change-entry-path">${esc(e.path)}</div>
        ${sub}
      </div>
      <button class="btn btn-sm" onclick="undoChangeEntry(${e.id})">↩ Undo</button>
    </div>`;
  }).join('');
  const renderCategoryGroup = ({ cat, entries }) => {
    const groupPatches = entries.filter(e => e.icon === '✂️').length;
    const groupExclusions = entries.length - groupPatches;
    const bits = [
      groupExclusions ? `${groupExclusions} excluded` : '',
      groupPatches ? `${groupPatches} patched` : ''
    ].filter(Boolean).join(' · ');
    return `<div class="redund-group change-log-group">
      <div class="redund-group-header" onclick="toggleGroup(event,this)">
        <span class="group-icon">${cat.icon}</span>
        <span class="group-name">${cat.label}</span>
        <span class="group-count">(${entries.length} change${entries.length!==1?'s':''})</span>
        <span class="td-tag badge-info">${esc(bits)}</span>
        <div class="group-actions">
          <span style="color:var(--text3);font-size:11px">${cat.desc}</span>
        </div>
        <span class="group-chevron">▼</span>
      </div>
      <div class="redund-group-body change-log-group-body">${renderEntries(entries)}</div>
    </div>`;
  };
  const groupedEntries = FILE_CATEGORIES
    .map(cat => entriesByCat[cat.id])
    .filter(Boolean)
    .map(renderCategoryGroup)
    .join('');
  body.innerHTML = `<div class="change-log-wrap">
    <div class="change-log-meta"><strong>${exclusions.length} file${exclusions.length!==1?'s':''} excluded from export · ${patches.length} file content patch${patches.length!==1?'es':''}</strong> applied in the exported ZIP — originals untouched</div>
    ${groupedEntries}
    <div style="padding:12px 0 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-export" onclick="exportMod()" id="export-btn" title="Export selected files as a ZIP">⬇ Export Mod ZIP</button>
      <button class="btn btn-sm" onclick="clearAllPatches()" style="color:var(--red);border-color:rgba(224,85,85,.4)">✕ Clear All Changes</button>
    </div>
  </div>`;
}

/**
 * Imprime+ -- Editor Controller (Tauri / Standalone)
 * Config and presets stored in AppData via Tauri FS (localStorage fallback).
 */

(function () {
  'use strict';

  // -- State --
  let images = [];
  let presets = [];
  let selectedIds = new Set();
  let zoom = 1;
  let idCounter = 0;
  let spacingLinked = true;
  let dragSourceId = null;
  let _suppressClick = false;
  let currentPage = 0;
  let totalPages = 1;

  // -- DOM refs --
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  const canvasScroll = $('#canvasScroll');
  const pagesContainer = $('#pagesContainer');
  const fileInput = $('#fileInput');
  const dropOverlay = $('#dropOverlay');

  // -- Builtin presets --
  const BUILTIN_PRESETS = [
    { id: 'letter', name: 'Carta', width: 21.59, height: 27.94, unit: 'cm', builtin: true },
    { id: 'legal',  name: 'Legal', width: 21.59, height: 35.56, unit: 'cm', builtin: true },
    { id: 'a4',     name: 'A4',    width: 21.0,  height: 29.7,  unit: 'cm', builtin: true },
    { id: 'a5',     name: 'A5',    width: 14.8,  height: 21.0,  unit: 'cm', builtin: true },
    { id: '4x6',    name: '4x6 pulg', width: 4, height: 6, unit: 'in', builtin: true },
    { id: '5x7',    name: '5x7 pulg', width: 5, height: 7, unit: 'in', builtin: true },
  ];

  // -- Config getters --
  function getConfig() {
    return {
      unit: $('#pageUnit').value,
      pageWidth: parseFloat($('#pageWidth').value) || 21.59,
      pageHeight: parseFloat($('#pageHeight').value) || 27.94,
      marginTop: parseFloat($('#marginTop').value) || 0,
      marginRight: parseFloat($('#marginRight').value) || 0,
      marginBottom: parseFloat($('#marginBottom').value) || 0,
      marginLeft: parseFloat($('#marginLeft').value) || 0,
      layoutMode: $('#layoutMode').value,
      gridRows: parseInt($('#gridRows').value) || 3,
      gridCols: parseInt($('#gridCols').value) || 3,
      countPerPage: parseInt($('#countPerPage').value) || 9,
      imgWidth: parseFloat($('#imgWidth').value) || 5,
      imgHeight: parseFloat($('#imgHeight').value) || 5,
      spacingH: $('#spacingH').value !== '' ? parseFloat($('#spacingH').value) : 0.3,
      spacingV: $('#spacingV').value !== '' ? parseFloat($('#spacingV').value) : 0.3,
      shape: $('#imgShape').value,
      border: parseInt($('#imgBorder').value) || 0,
      borderColor: $('#imgBorderColor').value,
      radius: parseInt($('#imgRadius').value) || 0,
      shadow: $('#imgShadow').value,
      fit: $('#imgFit').value,
      bgColor: $('#imgBgColor').value,
      captionEnabled: $('#captionEnabled').checked,
      captionPosition: $('#captionPosition').value,
      captionFontSize: parseInt($('#captionFontSize').value) || 10,
      captionFontFamily: $('#captionFontFamily').value,
      captionColor: $('#captionColor').value,
      captionBgColor: $('#captionBgColor').value,
      captionSource: $('#captionSource').value,
      imgAlignH: $('#imgAlignH').dataset.value || 'center',
      imgAlignV: $('#imgAlignV').dataset.value || 'center',
      cutGuides: $('#cutGuidesEnabled').checked,
      marginsEnabled: $('#marginsEnabled').checked,
    };
  }

  function updatePageSummary() {
    const cfg = getConfig();
    const sel = $('#pagePreset');
    const opt = sel.selectedOptions[0];
    const presetName = (opt && sel.value !== '__custom') ? opt.textContent : 'Personalizado';
    $('#pageSummary').textContent = presetName + ' - ' + cfg.pageWidth + ' x ' + cfg.pageHeight + ' ' + cfg.unit;
  }

  // -- Config persistence (AppData file via Tauri FS, localStorage fallback) --
  var CONFIG_FILE = 'config.json';
  var PRESETS_FILE = 'presets.json';
  var _tauriFs = null;
  var _tauriPath = null;

  function getTauriFs() {
    if (_tauriFs) return _tauriFs;
    try {
      _tauriFs = window.__TAURI__.fs;
      _tauriPath = window.__TAURI__.path;
    } catch (e) { _tauriFs = null; }
    return _tauriFs;
  }

  async function writeAppFile(name, data) {
    var fs = getTauriFs();
    if (fs) {
      try {
        var dir = await _tauriPath.appDataDir();
        await fs.mkdir(dir, { recursive: true }).catch(function() {});
        await fs.writeTextFile(dir + '/' + name, JSON.stringify(data, null, 2));
        return;
      } catch (e) { console.warn('FS write fallback:', e); }
    }
    localStorage.setItem('imprime_' + name, JSON.stringify(data));
  }

  async function readAppFile(name) {
    var fs = getTauriFs();
    if (fs) {
      try {
        var dir = await _tauriPath.appDataDir();
        var txt = await fs.readTextFile(dir + '/' + name);
        return JSON.parse(txt);
      } catch (e) { /* file not found = first run */ }
    }
    var ls = localStorage.getItem('imprime_' + name);
    return ls ? JSON.parse(ls) : null;
  }

  function saveConfig() {
    const cfg = getConfig();
    cfg.savedPrinter = savedPrinter;
    writeAppFile(CONFIG_FILE, cfg);
  }

  async function loadConfig() {
    var saved = await readAppFile(CONFIG_FILE);
    if (!saved) return;
    var map = {
      unit:'pageUnit', pageWidth:'pageWidth', pageHeight:'pageHeight',
      marginTop:'marginTop', marginRight:'marginRight', marginBottom:'marginBottom', marginLeft:'marginLeft',
      layoutMode:'layoutMode', gridRows:'gridRows', gridCols:'gridCols', countPerPage:'countPerPage',
      imgWidth:'imgWidth', imgHeight:'imgHeight', spacingH:'spacingH', spacingV:'spacingV',
      shape:'imgShape', border:'imgBorder', borderColor:'imgBorderColor', radius:'imgRadius',
      shadow:'imgShadow', fit:'imgFit', bgColor:'imgBgColor',
      captionPosition:'captionPosition', captionFontSize:'captionFontSize',
      captionFontFamily:'captionFontFamily', captionColor:'captionColor',
      captionBgColor:'captionBgColor', captionSource:'captionSource',

    };
    for (var k in map) {
      if (saved[k] !== undefined && saved[k] !== null) {
        var el = $('#' + map[k]);
        if (el) el.value = saved[k];
      }
    }
    if (saved.captionEnabled !== undefined) $('#captionEnabled').checked = saved.captionEnabled;
    if (saved.cutGuides !== undefined) $('#cutGuidesEnabled').checked = saved.cutGuides;
    if (saved.marginsEnabled !== undefined) $('#marginsEnabled').checked = saved.marginsEnabled;
    // Restore alignment button groups
    ['imgAlignH', 'imgAlignV'].forEach(function(key) {
      if (saved[key]) {
        var grp = document.getElementById(key);
        if (grp) {
          grp.dataset.value = saved[key];
          grp.querySelectorAll('.btn-align').forEach(function(b) {
            b.classList.toggle('active', b.dataset.val === saved[key]);
          });
        }
      }
    });
    // Restore saved printer
    if (saved.savedPrinter) savedPrinter = saved.savedPrinter;
  }

  // -- Custom Modal --
  function openModal() {
    $('#modalPageConfig').classList.add('open');
  }
  function closeModal() {
    $('#modalPageConfig').classList.remove('open');
    updatePageSummary();
    saveConfig();
    render();
  }

  // -- Presets (AppData file) --
  async function loadPresets() {
    const custom = (await readAppFile(PRESETS_FILE)) || [];
    presets = [...BUILTIN_PRESETS, ...custom];
    renderPresetSelect();
  }

  function saveCustomPresets() {
    const custom = presets.filter(p => !p.builtin);
    writeAppFile(PRESETS_FILE, custom);
  }

  function renderPresetSelect() {
    const sel = $('#pagePreset');
    sel.innerHTML = '';
    const builtins = presets.filter(p => p.builtin);
    const customs = presets.filter(p => !p.builtin);

    builtins.forEach(p => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.name;
      o.dataset.w = p.width;
      o.dataset.h = p.height;
      o.dataset.unit = p.unit;
      sel.appendChild(o);
    });

    if (customs.length) {
      const og = document.createElement('optgroup');
      og.label = '-- Personalizados --';
      customs.forEach(p => {
        const o = document.createElement('option');
        o.value = p.id;
        o.textContent = p.name;
        o.dataset.w = p.width;
        o.dataset.h = p.height;
        o.dataset.unit = p.unit;
        o.dataset.custom = '1';
        og.appendChild(o);
      });
      sel.appendChild(og);
    }

    const custom = document.createElement('option');
    custom.value = '__custom';
    custom.textContent = '-- Personalizado --';
    sel.appendChild(custom);

    // Force Carta (letter) as default selection
    const cartaOpt = sel.querySelector('option[value="letter"]');
    if (cartaOpt) cartaOpt.selected = true;
  }

  function applyPreset() {
    const sel = $('#pagePreset');
    const opt = sel.selectedOptions[0];
    if (!opt || sel.value === '__custom') return;

    const unit = opt.dataset.unit || 'cm';
    const w = parseFloat(opt.dataset.w);
    const h = parseFloat(opt.dataset.h);
    $('#pageUnit').value = unit;
    $('#pageWidth').value = w;
    $('#pageHeight').value = h;
    if (w <= h) {
      $('#btnPortrait').classList.add('active');
      $('#btnLandscape').classList.remove('active');
    } else {
      $('#btnLandscape').classList.add('active');
      $('#btnPortrait').classList.remove('active');
    }
    updatePageSummary();
    render();
  }

  function confirmSavePreset() {
    const name = $('#presetName').value.trim();
    if (!name) return;

    const cfg = getConfig();
    const id = 'custom_' + Date.now();
    presets.push({ id, name, width: cfg.pageWidth, height: cfg.pageHeight, unit: cfg.unit, builtin: false });
    saveCustomPresets();
    renderPresetSelect();
    $('#presetName').value = '';
    // Select the new preset
    const sel = $('#pagePreset');
    const newOpt = sel.querySelector('option[value="' + id + '"]');
    if (newOpt) newOpt.selected = true;
  }

  function deleteSelectedPreset() {
    const sel = $('#pagePreset');
    const opt = sel.selectedOptions[0];
    if (!opt || sel.value === '__custom') return;
    if (opt.dataset.custom !== '1') {
      alert('No se puede eliminar un preset predefinido');
      return;
    }
    if (!confirm('Eliminar preset "' + opt.textContent + '"?')) return;
    presets = presets.filter(p => p.id !== sel.value);
    saveCustomPresets();
    renderPresetSelect();
    applyPreset();
  }

  // -- Images --
  function addImageFiles(files) {
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        images.push({
          id: ++idCounter,
          src: e.target.result,
          name: file.name.replace(/\.[^.]+$/, ''),
          caption: '',
          overrides: {},
        });
        render();
      };
      reader.readAsDataURL(file);
    });
  }

  function addImageFromClipboard(blob) {
    const reader = new FileReader();
    reader.onload = (e) => {
      images.push({
        id: ++idCounter,
        src: e.target.result,
        name: 'Pegado ' + idCounter,
        caption: '',
        overrides: {},
      });
      render();
    };
    reader.readAsDataURL(blob);
  }

  function removeImage(id) {
    images = images.filter(img => img.id !== id);
    selectedIds.delete(id);
    updateInspector();
    render();
  }

  function removeSelectedImages() {
    if (!selectedIds.size) return;
    images = images.filter(function(img) { return !selectedIds.has(img.id); });
    selectedIds.clear();
    updateInspector();
    render();
  }

  // -- Selection (supports multi-select with ctrlKey) --
  function selectImage(id, ctrlKey) {
    if (ctrlKey) {
      if (selectedIds.has(id)) selectedIds.delete(id);
      else selectedIds.add(id);
    } else {
      selectedIds.clear();
      selectedIds.add(id);
    }
    $$('.img-cell').forEach(function(el) {
      el.classList.toggle('selected', selectedIds.has(parseInt(el.dataset.id)));
    });
    updateInspector();
  }

  function updateInspector() {
    var multiEl = document.getElementById('inspectorMulti');
    // Multi-select mode
    if (selectedIds.size > 1) {
      $('#inspectorEmpty').classList.add('hidden');
      $('#inspectorContent').classList.add('hidden');
      if (!multiEl) {
        multiEl = document.createElement('div');
        multiEl.id = 'inspectorMulti';
        multiEl.className = 'inspector-empty';
        var parent = $('#panelRight');
        parent.insertBefore(multiEl, $('#inspectorContent'));
      }
      multiEl.classList.remove('hidden');
      multiEl.innerHTML = '<i class="bi bi-images"></i>' +
        '<p>' + selectedIds.size + ' imagenes seleccionadas</p>' +
        '<button class="btn btn-danger-outline btn-block" id="btnDeleteMulti">' +
        '<i class="bi bi-trash"></i> Eliminar seleccion (' + selectedIds.size + ')</button>';
      document.getElementById('btnDeleteMulti').addEventListener('click', removeSelectedImages);
      return;
    }
    if (multiEl) multiEl.classList.add('hidden');

    var singleId = selectedIds.size === 1 ? selectedIds.values().next().value : null;
    const img = singleId ? images.find(function(i) { return i.id === singleId; }) : null;
    if (!img) {
      $('#inspectorEmpty').classList.remove('hidden');
      $('#inspectorContent').classList.add('hidden');
      return;
    }
    $('#inspectorEmpty').classList.add('hidden');
    $('#inspectorContent').classList.remove('hidden');

    const cfg = getConfig();
    const layout = Engine.computeLayout(cfg);
    const ov = img.overrides || {};

    $('#inspectorThumb').innerHTML = '<img src="' + img.src + '" alt="">';
    $('#inspCaption').value = img.caption || img.name;
    $('#inspCaptionEnabled').checked = ov.captionEnabled !== undefined ? ov.captionEnabled : cfg.captionEnabled;
    $('#inspWidth').value = (Engine.fromPx(layout.cellW, cfg.unit)).toFixed(2);
    $('#inspHeight').value = (Engine.fromPx(layout.cellH, cfg.unit)).toFixed(2);
    $('#inspZoom').value = ov.zoom || 100;
    $('#inspZoomLabel').textContent = (ov.zoom || 100) + '%';
    $('#inspOffsetX').value = ov.offsetX || 0;
    $('#inspOffsetY').value = ov.offsetY || 0;
    $('#inspShape').value = ov.shape || '';
    $('#inspBorder').value = ov.border ?? '';
    $('#inspRadius').value = ov.radius ?? '';
    $('#inspFit').value = ov.fit || '';
    $('#inspRotation').value = ov.rotation || 0;
    $('#inspRotationLabel').textContent = (ov.rotation || 0) + '\u00B0';
    // Per-image caption overrides
    $('#inspCaptionPosition').value = ov.captionPosition || '';
    $('#inspCaptionFontSize').value = ov.captionFontSize || '';
    $('#inspCaptionFontFamily').value = ov.captionFontFamily || '';
    $('#inspCaptionColor').value = ov.captionColor || cfg.captionColor;
    $('#inspCaptionBgColor').value = ov.captionBgColor || cfg.captionBgColor;
    var showCapOpts = ov.captionEnabled !== undefined ? ov.captionEnabled : cfg.captionEnabled;
    $('#inspCaptionOptions').classList.toggle('hidden', !showCapOpts);
  }

  function applyInspector() {
    var singleId = selectedIds.size === 1 ? selectedIds.values().next().value : null;
    const img = singleId ? images.find(function(i) { return i.id === singleId; }) : null;
    if (!img) return;
    const cfg = getConfig();

    img.caption = $('#inspCaption').value;

    const ov = img.overrides;
    ov.captionEnabled = $('#inspCaptionEnabled').checked;
    const w = parseFloat($('#inspWidth').value);
    const h = parseFloat($('#inspHeight').value);
    if (w > 0) $('#imgWidth').value = w.toFixed(2);
    if (h > 0) $('#imgHeight').value = h.toFixed(2);
    // Switch to size mode so layout reflows with the new dimensions
    if ($('#layoutMode').value !== 'size') {
      $('#layoutMode').value = 'size';
      updateLayoutModeVisibility();
    }
    ov.zoom = Math.max(100, parseInt($('#inspZoom').value) || 100);
    ov.offsetX = parseInt($('#inspOffsetX').value) || 0;
    ov.offsetY = parseInt($('#inspOffsetY').value) || 0;
    ov.shape = $('#inspShape').value || undefined;
    const b = $('#inspBorder').value;
    ov.border = b !== '' ? parseInt(b) : undefined;
    const r = $('#inspRadius').value;
    ov.radius = r !== '' ? parseInt(r) : undefined;
    ov.fit = $('#inspFit').value || undefined;
    ov.rotation = parseInt($('#inspRotation').value) || 0;
    if (!ov.rotation) delete ov.rotation;
    // Per-image caption overrides
    ov.captionPosition = $('#inspCaptionPosition').value || undefined;
    var cfs = $('#inspCaptionFontSize').value;
    ov.captionFontSize = cfs ? parseInt(cfs) : undefined;
    ov.captionFontFamily = $('#inspCaptionFontFamily').value || undefined;
    ov.captionColor = $('#inspCaptionColor').value || undefined;
    ov.captionBgColor = $('#inspCaptionBgColor').value || undefined;

    $('#inspZoomLabel').textContent = ov.zoom + '%';
    $('#inspCaptionOptions').classList.toggle('hidden', !ov.captionEnabled);
    saveConfig();
    render();
  }

  // -- Drag Resize (changes global cell size, affects layout) --
  function startResize(e, img, dir, cellW, cellH) {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const cfg = getConfig();
    const startW = Engine.fromPx(cellW, cfg.unit);
    const startH = Engine.fromPx(cellH, cfg.unit);

    function onMove(ev) {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      const dxU = Engine.fromPx(dx, cfg.unit);
      const dyU = Engine.fromPx(dy, cfg.unit);
      let newW = startW, newH = startH;
      if (dir.includes('e')) newW = Math.max(0.5, startW + dxU);
      if (dir.includes('w')) newW = Math.max(0.5, startW - dxU);
      if (dir.includes('s')) newH = Math.max(0.5, startH + dyU);
      if (dir.includes('n')) newH = Math.max(0.5, startH - dyU);

      // Update global image size
      $('#imgWidth').value = newW.toFixed(2);
      $('#imgHeight').value = newH.toFixed(2);

      // Switch to size mode so layout reflows
      if ($('#layoutMode').value !== 'size') {
        $('#layoutMode').value = 'size';
        updateLayoutModeVisibility();
      }

      render();
      updateInspector();
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      saveConfig();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // -- Pan Tool (click+drag on image; if no movement, selects) --
  function startPan(e, img, cellEl) {
    e.stopPropagation();
    e.preventDefault();
    const ov = img.overrides;
    const startX = e.clientX;
    const startY = e.clientY;
    const startOX = ov.offsetX || 0;
    const startOY = ov.offsetY || 0;
    let moved = false;

    function onMove(ev) {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      if (!moved) { moved = true; cellEl.style.cursor = 'grabbing'; }
      ov.offsetX = Math.round(startOX + dx);
      ov.offsetY = Math.round(startOY + dy);
      render();
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      cellEl.style.cursor = '';
      _suppressClick = true;
      requestAnimationFrame(function() { _suppressClick = false; });
      if (!moved) {
        selectImage(img.id, false);
      } else {
        updateInspector();
      }
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // -- Internal Zoom (Ctrl+drag on resize handle) --
  function startInternalZoom(e, img, dir) {
    e.stopPropagation();
    e.preventDefault();
    const ov = img.overrides;
    const startX = e.clientX;
    const startY = e.clientY;
    const startZoom = ov.zoom || 100;

    function onMove(ev) {
      var dx = (ev.clientX - startX) / zoom;
      var dy = (ev.clientY - startY) / zoom;
      var delta = (dx + dy) * 0.5;
      ov.zoom = Math.max(100, Math.min(500, Math.round(startZoom + delta)));
      render();
      updateInspector();
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      saveConfig();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // -- Page Navigation --
  function updatePageNav() {
    $('#pageNavLabel').textContent = 'Pagina ' + (currentPage + 1) + ' de ' + totalPages;
    const imgCount = images.length;
    const cfg = getConfig();
    const layout = Engine.computeLayout(cfg);
    const perPage = layout.perPage;
    $('#pageNavTotal').textContent = imgCount > 0 ? '(' + imgCount + ' imagenes, ' + perPage + ' por pagina)' : '';
    $('#btnPageFirst').disabled = currentPage === 0;
    $('#btnPagePrev').disabled = currentPage === 0;
    $('#btnPageNext').disabled = currentPage >= totalPages - 1;
    $('#btnPageLast').disabled = currentPage >= totalPages - 1;
  }

  function goToPage(idx) {
    if (idx < 0) idx = 0;
    if (idx >= totalPages) idx = totalPages - 1;
    currentPage = idx;
    updatePageNav();
    scrollToCurrentPage();
  }

  function scrollToCurrentPage() {
    const pages = pagesContainer.children;
    if (pages[currentPage]) {
      pages[currentPage].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // -- Render --
  function render() {
    const cfg = getConfig();
    const layout = Engine.computeLayout(cfg);
    const pages = Engine.paginate(images, layout);
    totalPages = pages.length;

    if (currentPage >= totalPages) currentPage = totalPages - 1;
    if (currentPage < 0) currentPage = 0;

    pagesContainer.innerHTML = '';

    pages.forEach((page, pi) => {
      const pageEl = document.createElement('div');
      pageEl.className = 'print-page';
      pageEl.style.width = layout.pageW + 'px';
      pageEl.style.height = layout.pageH + 'px';
      pageEl.style.transform = 'scale(' + zoom + ')';

      const badge = document.createElement('div');
      badge.className = 'page-number-badge';
      badge.textContent = '-- Pagina ' + (pi + 1) + ' de ' + totalPages + ' --';
      pageEl.appendChild(badge);

      const content = document.createElement('div');
      content.className = 'page-content';
      content.style.padding = layout.marginTop + 'px ' + layout.marginRight + 'px ' + layout.marginBottom + 'px ' + layout.marginLeft + 'px';
      content.style.gridTemplateColumns = 'repeat(' + layout.cols + ', ' + layout.cellW + 'px)';
      content.style.gridTemplateRows = 'repeat(' + layout.rows + ', ' + layout.cellH + 'px)';
      content.style.gap = layout.spacingV + 'px ' + layout.spacingH + 'px';

      // Grid alignment from config
      var galignH = cfg.imgAlignH || 'center';
      var galignV = cfg.imgAlignV || 'start';
      var gridAlignMap = { left:'start', center:'center', right:'end', justify:'space-between', top:'start', bottom:'end' };
      content.style.justifyContent = gridAlignMap[galignH] || 'center';
      content.style.alignContent = gridAlignMap[galignV] || 'start';

      // Calculate occupied cells from image spans
      var occupiedCells = 0;
      for (var si = 0; si < page.images.length; si++) {
        var sov = page.images[si] ? (page.images[si].overrides || {}) : {};
        var scs = Math.min(sov.colSpan || 1, layout.cols);
        var srs = Math.min(sov.rowSpan || 1, layout.rows);
        occupiedCells += scs * srs;
      }
      var emptyCells = Math.max(0, layout.totalSlots - occupiedCells);
      var totalCells = page.images.length + emptyCells;

      for (let i = 0; i < totalCells; i++) {
        const img = i < page.images.length ? page.images[i] : null;
        const cellEl = document.createElement('div');

        const ov = img ? (img.overrides || {}) : {};
        const shape = ov.shape || cfg.shape;
        const border = ov.border ?? cfg.border;
        const radius = ov.radius ?? cfg.radius;
        const shadow = cfg.shadow;
        const fit = ov.fit || cfg.fit;
        const cellBg = cfg.bgColor;

        cellEl.className = 'img-cell';
        if (shape !== 'rect') cellEl.classList.add('shape-' + shape);
        if (shadow !== 'none') cellEl.classList.add('shadow-' + shadow);

        var cs = (img && ov.colSpan > 1) ? Math.min(ov.colSpan, layout.cols) : 1;
        var rs = (img && ov.rowSpan > 1) ? Math.min(ov.rowSpan, layout.rows) : 1;
        const cw = layout.cellW * cs + layout.spacingH * (cs - 1);
        const ch = layout.cellH * rs + layout.spacingV * (rs - 1);

        if (cs > 1) cellEl.style.gridColumn = 'span ' + cs;
        if (rs > 1) cellEl.style.gridRow = 'span ' + rs;

        const imgCaptionEnabled = img
          ? ((img.overrides && img.overrides.captionEnabled !== undefined) ? img.overrides.captionEnabled : cfg.captionEnabled)
          : false;

        cellEl.style.width = cw + 'px';
        cellEl.style.height = (imgCaptionEnabled ? 'auto' : ch + 'px');
        cellEl.style.background = cellBg;

        if (img) {
          cellEl.dataset.id = img.id;
          if (selectedIds.has(img.id)) cellEl.classList.add('selected');

          // Drag handle for reorder
          var dragHandle = document.createElement('div');
          dragHandle.className = 'drag-handle';
          dragHandle.innerHTML = '<i class="bi bi-grip-vertical"></i>';
          dragHandle.title = 'Arrastrar para reordenar';
          dragHandle.draggable = true;
          dragHandle.addEventListener('mousedown', function(ev) { ev.stopPropagation(); });
          dragHandle.addEventListener('dragstart', function(ev) {
            dragSourceId = img.id;
            cellEl.classList.add('dragging');
            ev.dataTransfer.effectAllowed = 'move';
            ev.dataTransfer.setData('text/plain', String(img.id));
          });
          dragHandle.addEventListener('dragend', function() {
            cellEl.classList.remove('dragging');
            dragSourceId = null;
            $$('.img-cell.drag-over').forEach(function(el) { el.classList.remove('drag-over'); });
          });
          cellEl.appendChild(dragHandle);

          // Drop targets on cell
          cellEl.addEventListener('dragover', function(ev) {
            if (dragSourceId === null) return;
            ev.preventDefault();
            ev.dataTransfer.dropEffect = 'move';
            cellEl.classList.add('drag-over');
          });
          cellEl.addEventListener('dragleave', function() {
            cellEl.classList.remove('drag-over');
          });
          cellEl.addEventListener('drop', function(ev) {
            ev.preventDefault();
            cellEl.classList.remove('drag-over');
            if (dragSourceId === null) return;
            var fromIdx = images.findIndex(function(im) { return im.id === dragSourceId; });
            var toIdx = images.findIndex(function(im) { return im.id === img.id; });
            if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
              var moved = images.splice(fromIdx, 1)[0];
              images.splice(toIdx, 0, moved);
              render();
            }
          });

          const capPos = (ov.captionPosition || cfg.captionPosition);
          const capFS = (ov.captionFontSize || cfg.captionFontSize);
          const capFF = (ov.captionFontFamily || cfg.captionFontFamily);
          const capC = (ov.captionColor || cfg.captionColor);
          const capBg = (ov.captionBgColor || cfg.captionBgColor);

          if (imgCaptionEnabled && capPos === 'above') {
            const cap = document.createElement('div');
            cap.className = 'img-caption above';
            cap.style.fontSize = capFS + 'px';
            cap.style.fontFamily = capFF;
            cap.style.color = capC;
            cap.style.background = capBg;
            cap.textContent = getCaption(img, i, cfg);
            cellEl.appendChild(cap);
          }

          const inner = document.createElement('div');
          inner.className = 'img-cell-inner';
          inner.style.width = cw + 'px';
          inner.style.height = ch + 'px';
          if (border > 0) {
            inner.style.border = border + 'px solid ' + cfg.borderColor;
          }
          if (shape === 'rounded' || radius > 0) {
            inner.style.borderRadius = (radius || 12) + 'px';
          }

          const imgEl = document.createElement('img');
          imgEl.src = img.src;
          imgEl.alt = img.name;
          imgEl.draggable = false;

          var ox = ov.offsetX || 0;
          var oy = ov.offsetY || 0;
          var zoomFactor = (ov.zoom || 100) / 100;

          // Image fills cell via object-fit; zoom/pan applied via CSS transform
          imgEl.style.cssText = 'display:block;width:100%;height:100%;' +
            'object-fit:' + fit + ';transform-origin:center center;';

          // Clamp pan offsets (screen-space px) to zoomed overflow
          var maxPanX = Math.max(0, (zoomFactor - 1) * cw / 2);
          var maxPanY = Math.max(0, (zoomFactor - 1) * ch / 2);
          var clampedOx = Math.max(-maxPanX, Math.min(maxPanX, ox));
          var clampedOy = Math.max(-maxPanY, Math.min(maxPanY, oy));
          if (clampedOx !== ox) { ov.offsetX = Math.round(clampedOx); ox = clampedOx; }
          if (clampedOy !== oy) { ov.offsetY = Math.round(clampedOy); oy = clampedOy; }

          // Build transform: translate (screen px) then scale then rotate
          var transforms = [];
          if (clampedOx !== 0 || clampedOy !== 0) transforms.push('translate(' + clampedOx + 'px,' + clampedOy + 'px)');
          if (zoomFactor !== 1) transforms.push('scale(' + zoomFactor + ')');
          var rot = ov.rotation || 0;
          if (rot) transforms.push('rotate(' + rot + 'deg)');
          if (transforms.length) imgEl.style.transform = transforms.join(' ');

          inner.appendChild(imgEl);
          cellEl.appendChild(inner);

          if (imgCaptionEnabled && (capPos === 'below' || capPos === 'overlay')) {
            const cap = document.createElement('div');
            cap.className = 'img-caption ' + capPos;
            cap.style.fontSize = capFS + 'px';
            cap.style.fontFamily = capFF;
            cap.style.color = capPos === 'overlay' ? '#fff' : capC;
            cap.style.background = capPos === 'overlay' ? 'rgba(0,0,0,0.55)' : capBg;
            cap.textContent = getCaption(img, i, cfg);
            if (capPos === 'overlay') {
              inner.appendChild(cap);
            } else {
              cellEl.appendChild(cap);
            }
          }

          cellEl.addEventListener('click', (e) => {
            if (_suppressClick || e.defaultPrevented) return;
            selectImage(img.id, e.ctrlKey || e.metaKey);
          });

          // Right-click context menu
          cellEl.addEventListener('contextmenu', (function(imgRef) {
            return function(ev) {
              ev.preventDefault();
              ev.stopPropagation();
              showContextMenu(ev.clientX, ev.clientY, imgRef);
            };
          })(img));

          // Pan: left-click drag only when zoomed in, or middle-click always
          inner.addEventListener('mousedown', (e) => {
            var currentZoom = (img.overrides && img.overrides.zoom) || 100;
            if (e.button === 1 || (e.button === 0 && currentZoom > 100)) {
              startPan(e, img, cellEl);
            }
          });

          // Wheel zoom on image (no Ctrl = internal zoom, Ctrl = page zoom)
          inner.addEventListener('wheel', (function(imgRef) {
            return function(ev) {
              if (ev.ctrlKey) return; // let page zoom handle it
              ev.preventDefault();
              ev.stopPropagation();
              var ovr = imgRef.overrides;
              var step = ev.deltaY > 0 ? -5 : 5;
              ovr.zoom = Math.max(100, Math.min(500, (ovr.zoom || 100) + step));
              render();
              updateInspector();
            };
          })(img), { passive: false });

          // Resize handles (Ctrl = internal zoom)
          ['nw','n','ne','w','e','sw','s','se'].forEach(dir => {
            const handle = document.createElement('div');
            handle.className = 'resize-handle ' + dir;
            handle.addEventListener('mousedown', (e) => {
              if (e.ctrlKey) {
                startInternalZoom(e, img, dir);
              } else {
                startResize(e, img, dir, cw, ch);
              }
            });
            cellEl.appendChild(handle);
          });
        } else {
          cellEl.classList.add('img-cell-empty');
        }

        // Cut guides (crop marks at each corner)
        if (cfg.cutGuides && img) {
          cellEl.classList.add('cut-guides');
          ['tl-h','tl-v','tr-h','tr-v','bl-h','bl-v','br-h','br-v'].forEach(function(cls) {
            var m = document.createElement('div');
            m.className = 'cut-guide-mark ' + cls;
            cellEl.appendChild(m);
          });
        }

        content.appendChild(cellEl);
      }

      pageEl.appendChild(content);
      pagesContainer.appendChild(pageEl);
    });

    updatePageNav();
  }

  function getCaption(img, index, cfg) {
    if (img.caption) return img.caption;
    if (cfg.captionSource === 'number') return String(index + 1);
    if (cfg.captionSource === 'custom') return '';
    return img.name || '';
  }

  // -- Zoom --
  function setZoom(z) {
    zoom = Math.max(0.2, Math.min(3, z));
    $('#zoomLabel').textContent = Math.round(zoom * 100) + '%';
    render();
  }

  function zoomFit() {
    const cfg = getConfig();
    const layout = Engine.computeLayout(cfg);
    const area = canvasScroll.getBoundingClientRect();
    const scale = Math.min((area.width - 60) / layout.pageW, (area.height - 60) / layout.pageH);
    setZoom(Math.min(scale, 1.5));
  }

  // -- Drag & Drop (file drop) --
  function setupDragDrop() {
    const area = $('#canvasArea');
    let dragCounter = 0;

    area.addEventListener('dragenter', (e) => {
      if (dragSourceId !== null) return;
      e.preventDefault();
      dragCounter++;
      dropOverlay.classList.add('active');
    });
    area.addEventListener('dragleave', (e) => {
      if (dragSourceId !== null) return;
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) { dragCounter = 0; dropOverlay.classList.remove('active'); }
    });
    area.addEventListener('dragover', (e) => e.preventDefault());
    area.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      dropOverlay.classList.remove('active');
      if (e.dataTransfer.files.length) addImageFiles(e.dataTransfer.files);
    });
  }

  // -- Clipboard Paste --
  function setupPaste() {
    document.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          addImageFromClipboard(item.getAsFile());
        }
      }
    });
  }

  // -- Linked Spacing --
  function toggleSpacingLink() {
    spacingLinked = !spacingLinked;
    const btn = $('#btnLinkSpacing');
    if (spacingLinked) {
      btn.classList.add('active');
      $('#spacingV').value = $('#spacingH').value;
      render();
    } else {
      btn.classList.remove('active');
    }
  }

  function onSpacingChange(source) {
    if (!spacingLinked) return;
    if (source === 'h') {
      $('#spacingV').value = $('#spacingH').value;
    } else {
      $('#spacingH').value = $('#spacingV').value;
    }
  }

  // -- Printer State --
  var savedPrinter = '';
  var printerList = [];

  async function loadPrinters() {
    try {
      if (!window.__TAURI__) return;
      printerList = await window.__TAURI__.core.invoke('list_printers');
      var sel = $('#printerSelect');
      if (!sel) return;
      sel.innerHTML = '';
      if (!printerList.length) {
        var o = document.createElement('option');
        o.value = '';
        o.textContent = 'Sin impresoras';
        sel.appendChild(o);
        return;
      }
      printerList.forEach(function(p) {
        var o = document.createElement('option');
        o.value = p.name;
        o.textContent = p.name + (p.is_default ? ' (predeterminada)' : '');
        sel.appendChild(o);
      });
      // Restore saved printer or use default
      if (savedPrinter && printerList.some(function(p) { return p.name === savedPrinter; })) {
        sel.value = savedPrinter;
      } else {
        var def = printerList.find(function(p) { return p.is_default; });
        if (def) sel.value = def.name;
        savedPrinter = sel.value;
      }
    } catch (e) {
      console.warn('Error loading printers:', e);
    }
  }

  // -- Canvas rendering for native print --
  var PRINT_DPI = 300;

  function loadImageEl(src) {
    return new Promise(function(resolve, reject) {
      var img = new Image();
      img.onload = function() { resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
  }

  function drawFitCanvas(ctx, imgEl, x, y, w, h, fit) {
    var iw = imgEl.naturalWidth;
    var ih = imgEl.naturalHeight;
    if (fit === 'fill') {
      ctx.drawImage(imgEl, x, y, w, h);
    } else if (fit === 'contain') {
      var ir = iw / ih;
      var cr = w / h;
      var dw, dh, dx, dy;
      if (ir > cr) { dw = w; dh = w / ir; dx = x; dy = y + (h - dh) / 2; }
      else { dh = h; dw = h * ir; dx = x + (w - dw) / 2; dy = y; }
      ctx.drawImage(imgEl, dx, dy, dw, dh);
    } else { // cover
      var ir2 = iw / ih;
      var cr2 = w / h;
      var sw, sh, sx, sy;
      if (ir2 > cr2) { sh = ih; sw = ih * cr2; sx = (iw - sw) / 2; sy = 0; }
      else { sw = iw; sh = iw / cr2; sx = 0; sy = (ih - sh) / 2; }
      ctx.drawImage(imgEl, sx, sy, sw, sh, x, y, w, h);
    }
  }

  function clipShape(ctx, shape, x, y, w, h, radius) {
    ctx.beginPath();
    if (shape === 'circle') {
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    } else if (shape === 'hexagon') {
      var cx = x + w / 2, cy = y + h / 2;
      ctx.moveTo(cx, y);
      ctx.lineTo(x + w, y + h * 0.25);
      ctx.lineTo(x + w, y + h * 0.75);
      ctx.lineTo(cx, y + h);
      ctx.lineTo(x, y + h * 0.75);
      ctx.lineTo(x, y + h * 0.25);
    } else if (shape === 'star') {
      var pts = [[50,0],[61,35],[98,35],[68,57],[79,91],[50,70],[21,91],[32,57],[2,35],[39,35]];
      pts.forEach(function(p, i) {
        var px = x + w * p[0] / 100, py = y + h * p[1] / 100;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
    } else if (shape === 'rounded' || (radius && radius > 0)) {
      var r = radius || 12;
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
    } else {
      ctx.rect(x, y, w, h);
    }
    ctx.closePath();
    ctx.clip();
  }

  async function renderPageToCanvas(pageImages, layout, cfg, dpi) {
    var scale = dpi / 96;
    var canvas = document.createElement('canvas');
    canvas.width = Math.round(layout.pageW * scale);
    canvas.height = Math.round(layout.pageH * scale);
    var ctx = canvas.getContext('2d');

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);

    // Grid alignment
    var galignH = cfg.imgAlignH || 'center';
    var galignV = cfg.imgAlignV || 'start';

    // Compute total grid size
    var gridW = layout.cols * layout.cellW + (layout.cols - 1) * layout.spacingH;
    var gridH = layout.rows * layout.cellH + (layout.rows - 1) * layout.spacingV;
    var contentW = layout.pageW - layout.marginLeft - layout.marginRight;
    var contentH = layout.pageH - layout.marginTop - layout.marginBottom;

    // Alignment offsets
    var offsetX = 0, offsetY = 0;
    if (galignH === 'center') offsetX = (contentW - gridW) / 2;
    else if (galignH === 'right' || galignH === 'end') offsetX = contentW - gridW;
    else if (galignH === 'justify' || galignH === 'space-between') offsetX = 0; // handled via spacing
    if (galignV === 'center') offsetY = (contentH - gridH) / 2;
    else if (galignV === 'bottom' || galignV === 'end') offsetY = contentH - gridH;

    var spacingH = layout.spacingH;
    var spacingV = layout.spacingV;
    if (galignH === 'justify' || galignH === 'space-between') {
      if (layout.cols > 1) spacingH = (contentW - layout.cols * layout.cellW) / (layout.cols - 1);
      else offsetX = (contentW - gridW) / 2;
    }

    // Grid placement tracker for spanning
    var printGrid = [];
    for (var gr = 0; gr < layout.rows; gr++) printGrid.push(new Array(layout.cols).fill(false));

    for (var i = 0; i < pageImages.length; i++) {
      var img = pageImages[i];
      if (!img) continue;

      var ov = img.overrides || {};
      var cs = (ov.colSpan > 1) ? Math.min(ov.colSpan, layout.cols) : 1;
      var rs = (ov.rowSpan > 1) ? Math.min(ov.rowSpan, layout.rows) : 1;

      // Find placement in grid (dense algorithm)
      var col = -1, row = -1;
      for (var pr = 0; pr <= layout.rows - rs && col === -1; pr++) {
        for (var pc = 0; pc <= layout.cols - cs && col === -1; pc++) {
          var canFit = true;
          for (var dr = 0; dr < rs && canFit; dr++) {
            for (var dc = 0; dc < cs && canFit; dc++) {
              if (printGrid[pr + dr][pc + dc]) canFit = false;
            }
          }
          if (canFit) {
            col = pc; row = pr;
            for (var dr = 0; dr < rs; dr++)
              for (var dc = 0; dc < cs; dc++)
                printGrid[row + dr][col + dc] = true;
          }
        }
      }
      if (col === -1) continue; // shouldn't happen since paginate already checked

      var cx = layout.marginLeft + offsetX + col * (layout.cellW + spacingH);
      var cy = layout.marginTop + offsetY + row * (layout.cellH + spacingV);

      var cw = layout.cellW * cs + spacingH * (cs - 1);
      var ch = layout.cellH * rs + spacingV * (rs - 1);

      var fit = ov.fit || cfg.fit;
      var zoomFactor = (ov.zoom || 100) / 100;
      var ox = ov.offsetX || 0;
      var oy = ov.offsetY || 0;
      var rot = ov.rotation || 0;
      var border = ov.border !== undefined && ov.border !== null ? ov.border : cfg.border;
      var borderColor = cfg.borderColor;
      var shape = ov.shape || cfg.shape;
      var radius = ov.radius !== undefined && ov.radius !== null ? ov.radius : cfg.radius;
      var cellBg = cfg.bgColor;

      // Cell background + clip
      ctx.save();
      ctx.fillStyle = cellBg;
      clipShape(ctx, shape, cx, cy, cw, ch, radius);
      ctx.fill();

      // Draw image
      try {
        var imgEl = await loadImageEl(img.src);
        ctx.save();
        ctx.translate(cx + cw / 2, cy + ch / 2);
        if (rot) ctx.rotate(rot * Math.PI / 180);
        ctx.scale(zoomFactor, zoomFactor);
        ctx.translate(ox / zoomFactor, oy / zoomFactor);
        ctx.translate(-cw / 2, -ch / 2);
        drawFitCanvas(ctx, imgEl, 0, 0, cw, ch, fit);
        ctx.restore();
      } catch (e) { /* skip broken image */ }

      ctx.restore(); // restore clip

      // Border
      if (border > 0) {
        ctx.save();
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = border;
        ctx.beginPath();
        if (shape === 'circle') {
          ctx.ellipse(cx + cw / 2, cy + ch / 2, cw / 2 - border / 2, ch / 2 - border / 2, 0, 0, Math.PI * 2);
        } else {
          var br = (shape === 'rounded' || radius > 0) ? (radius || 12) : 0;
          if (br > 0) {
            var bx = cx + border / 2, by = cy + border / 2, bw = cw - border, bh = ch - border;
            ctx.moveTo(bx + br, by);
            ctx.lineTo(bx + bw - br, by);
            ctx.arcTo(bx + bw, by, bx + bw, by + br, br);
            ctx.lineTo(bx + bw, by + bh - br);
            ctx.arcTo(bx + bw, by + bh, bx + bw - br, by + bh, br);
            ctx.lineTo(bx + br, by + bh);
            ctx.arcTo(bx, by + bh, bx, by + bh - br, br);
            ctx.lineTo(bx, by + br);
            ctx.arcTo(bx, by, bx + br, by, br);
          } else {
            ctx.rect(cx + border / 2, cy + border / 2, cw - border, ch - border);
          }
        }
        ctx.stroke();
        ctx.restore();
      }

      // Captions
      var captionEnabled = (ov.captionEnabled !== undefined) ? ov.captionEnabled : cfg.captionEnabled;
      if (captionEnabled) {
        var capPos = ov.captionPosition || cfg.captionPosition;
        var capFS = ov.captionFontSize || cfg.captionFontSize;
        var capFF = ov.captionFontFamily || cfg.captionFontFamily;
        var capC = (capPos === 'overlay') ? '#ffffff' : (ov.captionColor || cfg.captionColor);
        var capBg = (capPos === 'overlay') ? 'rgba(0,0,0,0.55)' : (ov.captionBgColor || cfg.captionBgColor);
        var capText = getCaption(img, i, cfg);

        ctx.save();
        ctx.font = capFS + 'px ' + capFF;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        var capH = capFS + 4;
        var capY;
        if (capPos === 'above') { capY = cy; }
        else if (capPos === 'overlay') { capY = cy + ch - capH; }
        else { capY = cy + ch; }

        ctx.fillStyle = capBg;
        ctx.fillRect(cx, capY, cw, capH);
        ctx.fillStyle = capC;
        ctx.fillText(capText, cx + cw / 2, capY + 2, cw);
        ctx.restore();
      }

      // Cut guides
      if (cfg.cutGuides) {
        ctx.save();
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 1;
        var gl = 7;
        var gx = cx, gy = cy, gw = cw, gh = ch;
        ctx.beginPath();
        ctx.moveTo(gx - gl - 1, gy); ctx.lineTo(gx - 1, gy);
        ctx.moveTo(gx, gy - gl - 1); ctx.lineTo(gx, gy - 1);
        ctx.moveTo(gx + gw + 1, gy); ctx.lineTo(gx + gw + gl + 1, gy);
        ctx.moveTo(gx + gw, gy - gl - 1); ctx.lineTo(gx + gw, gy - 1);
        ctx.moveTo(gx - gl - 1, gy + gh); ctx.lineTo(gx - 1, gy + gh);
        ctx.moveTo(gx, gy + gh + 1); ctx.lineTo(gx, gy + gh + gl + 1);
        ctx.moveTo(gx + gw + 1, gy + gh); ctx.lineTo(gx + gw + gl + 1, gy + gh);
        ctx.moveTo(gx + gw, gy + gh + 1); ctx.lineTo(gx + gw, gy + gh + gl + 1);
        ctx.stroke();
        ctx.restore();
      }
    }

    return canvas;
  }

  function arrayBufferToBase64(buffer) {
    var binary = '';
    var bytes = new Uint8Array(buffer);
    var len = bytes.length;
    for (var i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // -- Context Menu --
  var ctxTarget = null;

  function showContextMenu(x, y, img) {
    ctxTarget = img;
    var menu = $('#ctxMenu');
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    // Update span labels
    var ov = img.overrides || {};
    var hBtn = menu.querySelector('[data-action="expandH"]');
    var vBtn = menu.querySelector('[data-action="expandV"]');
    if (hBtn) hBtn.innerHTML = '<i class="bi bi-arrows-expand"></i> Ampliar horizontal' + ((ov.colSpan > 1) ? ' (' + ov.colSpan + 'x) - clic para +1' : '');
    if (vBtn) vBtn.innerHTML = '<i class="bi bi-arrows-expand"></i> Ampliar vertical' + ((ov.rowSpan > 1) ? ' (' + ov.rowSpan + 'x) - clic para +1' : '');
    menu.classList.add('open');
    // Clamp to viewport
    var rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (x - rect.width) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + 'px';
  }

  function hideContextMenu() {
    $('#ctxMenu').classList.remove('open');
    ctxTarget = null;
  }

  function ctxRotate() {
    if (!ctxTarget) return;
    ctxTarget.overrides.rotation = ((ctxTarget.overrides.rotation || 0) + 90) % 360;
    updateInspector();
    render();
  }

  function ctxDuplicate() {
    if (!ctxTarget) return;
    var idx = images.findIndex(function(im) { return im.id === ctxTarget.id; });
    if (idx === -1) return;
    var clone = {
      id: ++idCounter,
      src: ctxTarget.src,
      name: ctxTarget.name,
      caption: ctxTarget.caption || '',
      overrides: JSON.parse(JSON.stringify(ctxTarget.overrides || {})),
    };
    images.splice(idx + 1, 0, clone);
    render();
  }

  function ctxClear() {
    if (!ctxTarget) return;
    var idx = images.findIndex(function(im) { return im.id === ctxTarget.id; });
    if (idx === -1) return;
    images.splice(idx, 1);
    selectedIds.delete(ctxTarget.id);
    updateInspector();
    render();
  }

  function ctxExpandH() {
    if (!ctxTarget) return;
    var ov = ctxTarget.overrides;
    var cs = ov.colSpan || 1;
    var cfg = getConfig();
    var layout = Engine.computeLayout(cfg);
    ov.colSpan = cs < layout.cols ? cs + 1 : 1;
    render();
  }

  function ctxExpandV() {
    if (!ctxTarget) return;
    var ov = ctxTarget.overrides;
    var rs = ov.rowSpan || 1;
    var cfg = getConfig();
    var layout = Engine.computeLayout(cfg);
    ov.rowSpan = rs < layout.rows ? rs + 1 : 1;
    render();
  }

  // -- Native Print (GDI) --
  async function printNative() {
    if (!images.length) { alert('No hay imagenes para imprimir'); return; }

    var sel = $('#printerSelect');
    var printer = sel ? sel.value : '';
    if (!printer) { alert('Seleccione una impresora'); return; }

    var cfg = getConfig();
    var layout = Engine.computeLayout(cfg);
    var allPages = Engine.paginate(images, layout);

    // Show progress
    var btn = $('#btnPrint');
    var origText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Renderizando...';

    try {
      var pageDataArray = [];
      for (var pi = 0; pi < allPages.length; pi++) {
        btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Pagina ' + (pi + 1) + '/' + allPages.length;
        // yield to UI
        await new Promise(function(r) { setTimeout(r, 10); });
        var canvas = await renderPageToCanvas(allPages[pi].images, layout, cfg, PRINT_DPI);
        var blob = await new Promise(function(resolve) {
          canvas.toBlob(resolve, 'image/jpeg', 0.92);
        });
        var buf = await blob.arrayBuffer();
        pageDataArray.push(arrayBufferToBase64(buf));
      }

      btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Enviando...';
      await new Promise(function(r) { setTimeout(r, 10); });

      var result = await window.__TAURI__.core.invoke('print_pages', {
        request: {
          printer: printer,
          copies: 1,
          pages: pageDataArray,
        }
      });
      console.log('Print result:', result);
    } catch (e) {
      alert('Error al imprimir: ' + e);
    } finally {
      btn.disabled = false;
      btn.innerHTML = origText;
    }

    // Save preferred printer
    savedPrinter = printer;
    saveConfig();
  }

  // -- Print --
  function printNow() {
    const prevZoom = zoom;
    zoom = 1;

    render();

    // Inject dynamic @page size based on current page dimensions
    var cfg = getConfig();
    var layout = Engine.computeLayout(cfg);
    var wMM = (layout.pageW / (96 / 25.4)).toFixed(1);
    var hMM = (layout.pageH / (96 / 25.4)).toFixed(1);
    var styleEl = document.createElement('style');
    styleEl.id = 'print-page-size';
    styleEl.textContent = '@page { size: ' + wMM + 'mm ' + hMM + 'mm; margin: 0; }';
    document.head.appendChild(styleEl);

    setTimeout(() => {
      window.print();
      // Cleanup
      var s = document.getElementById('print-page-size');
      if (s) s.remove();
      zoom = prevZoom;
      render();
    }, 150);
  }

  // -- Layout Mode Toggle --
  function updateLayoutModeVisibility() {
    const mode = $('#layoutMode').value;
    $$('.layout-mode-grid').forEach(el => el.classList.toggle('hidden', mode !== 'grid'));
    $$('.layout-mode-count').forEach(el => el.classList.toggle('hidden', mode !== 'count'));
    $$('.layout-mode-size').forEach(el => el.classList.toggle('hidden', mode !== 'size'));
  }

  function updateCaptionVisibility() {
    $('#captionOptions').classList.toggle('hidden', !$('#captionEnabled').checked);
  }

  function updateMarginsVisibility() {
    var enabled = $('#marginsEnabled').checked;
    $('#marginsOptions').classList.toggle('hidden', !enabled);
    if (!enabled) {
      $('#marginTop').value = '0';
      $('#marginBottom').value = '0';
      $('#marginLeft').value = '0';
      $('#marginRight').value = '0';
    }
  }

  // -- Orientation --
  function setOrientation(landscape) {
    let w = parseFloat($('#pageWidth').value);
    let h = parseFloat($('#pageHeight').value);
    if (landscape && w < h) { $('#pageWidth').value = h; $('#pageHeight').value = w; }
    if (!landscape && w > h) { $('#pageWidth').value = h; $('#pageHeight').value = w; }
    $('#btnPortrait').classList.toggle('active', !landscape);
    $('#btnLandscape').classList.toggle('active', landscape);
    updatePageSummary();
    render();
  }

  // -- Events --
  function bindEvents() {
    // Toolbar
    $('#btnAddImages').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => { addImageFiles(fileInput.files); fileInput.value = ''; });
    $('#btnPaste').addEventListener('click', async () => {
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const blob = await item.getType(type);
              addImageFromClipboard(blob);
            }
          }
        }
      } catch { /* user denied or no image */ }
    });

    // Zoom
    $('#btnZoomIn').addEventListener('click', () => setZoom(zoom + 0.1));
    $('#btnZoomOut').addEventListener('click', () => setZoom(zoom - 0.1));
    $('#btnZoomFit').addEventListener('click', zoomFit);

    // Print - use native if Tauri available, fallback to browser
    $('#btnPrint').addEventListener('click', function() {
      if (window.__TAURI__) {
        printNative();
      } else {
        printNow();
      }
    });

    // Check for updates
    $('#btnCheckUpdate').addEventListener('click', checkForUpdates);

    // Printer selection
    var prSel = $('#printerSelect');
    if (prSel) prSel.addEventListener('change', function() { savedPrinter = prSel.value; saveConfig(); });

    // Page config modal
    $('#btnPageConfig').addEventListener('click', openModal);
    $('#btnPageConfigPanel').addEventListener('click', openModal);
    $('#modalClose').addEventListener('click', closeModal);
    $('#modalAccept').addEventListener('click', closeModal);
    $('#modalPageConfig').addEventListener('click', (e) => {
      if (e.target === $('#modalPageConfig')) closeModal();
    });

    // Inside modal
    $('#pagePreset').addEventListener('change', applyPreset);
    $('#btnDeletePreset').addEventListener('click', deleteSelectedPreset);
    $('#btnConfirmPreset').addEventListener('click', confirmSavePreset);
    $('#btnPortrait').addEventListener('click', () => setOrientation(false));
    $('#btnLandscape').addEventListener('click', () => setOrientation(true));

    // Page config inputs
    var pageInputs = '#pageWidth,#pageHeight,#pageUnit,#marginTop,#marginRight,#marginBottom,#marginLeft';
    pageInputs.split(',').forEach(sel => {
      const el = $(sel);
      if (!el) return;
      el.addEventListener('change', () => { updatePageSummary(); render(); saveConfig(); });
      el.addEventListener('input', () => { updatePageSummary(); render(); });
    });

    // Layout mode
    $('#layoutMode').addEventListener('change', () => { updateLayoutModeVisibility(); render(); saveConfig(); });

    // Caption toggle
    $('#captionEnabled').addEventListener('change', () => { updateCaptionVisibility(); render(); });

    // Margins toggle
    $('#marginsEnabled').addEventListener('change', () => { updateMarginsVisibility(); render(); saveConfig(); });

    // Linked spacing
    $('#btnLinkSpacing').addEventListener('click', toggleSpacingLink);
    $('#spacingH').addEventListener('input', () => { onSpacingChange('h'); render(); });
    $('#spacingH').addEventListener('change', () => { onSpacingChange('h'); render(); saveConfig(); });
    $('#spacingV').addEventListener('input', () => { onSpacingChange('v'); render(); });
    $('#spacingV').addEventListener('change', () => { onSpacingChange('v'); render(); saveConfig(); });

    // All panel settings inputs
    var settingsInputs = '#gridRows,#gridCols,#countPerPage,#imgWidth,#imgHeight,' +
      '#marginTop,#marginRight,#marginBottom,#marginLeft,#cutGuidesEnabled,' +
      '#imgShape,#imgBorder,#imgBorderColor,#imgRadius,#imgShadow,#imgFit,#imgBgColor,' +
      '#captionEnabled,#captionPosition,#captionFontSize,#captionFontFamily,#captionColor,#captionBgColor,#captionSource';
    settingsInputs.split(',').forEach(sel => {
      const el = $(sel);
      if (!el) return;
      el.addEventListener('change', () => { render(); saveConfig(); });
      el.addEventListener('input', render);
    });

    // Inspector
    var inspInputs = '#inspCaption,#inspCaptionEnabled,#inspWidth,#inspHeight,#inspZoom,#inspOffsetX,#inspOffsetY,#inspShape,#inspBorder,#inspRadius,#inspFit,#inspRotation,#inspCaptionPosition,#inspCaptionFontSize,#inspCaptionFontFamily,#inspCaptionColor,#inspCaptionBgColor';
    inspInputs.split(',').forEach(sel => {
      const el = $(sel);
      if (!el) return;
      el.addEventListener('change', applyInspector);
      el.addEventListener('input', applyInspector);
    });
    // Rotation buttons
    $('#inspRotateLeft').addEventListener('click', function() {
      selectedIds.forEach(function(sid) {
        var im = images.find(function(i) { return i.id === sid; });
        if (im) im.overrides.rotation = ((im.overrides.rotation || 0) - 90 + 360) % 360;
      });
      updateInspector(); render();
    });
    $('#inspRotateRight').addEventListener('click', function() {
      selectedIds.forEach(function(sid) {
        var im = images.find(function(i) { return i.id === sid; });
        if (im) im.overrides.rotation = ((im.overrides.rotation || 0) + 90) % 360;
      });
      updateInspector(); render();
    });
    $('#inspDelete').addEventListener('click', removeSelectedImages);

    // Alignment button groups
    $$('.btn-group-align').forEach(function(group) {
      group.querySelectorAll('.btn-align').forEach(function(btn) {
        btn.addEventListener('click', function() {
          group.querySelectorAll('.btn-align').forEach(function(b) { b.classList.remove('active'); });
          btn.classList.add('active');
          group.dataset.value = btn.dataset.val;
          render();
          saveConfig();
        });
      });
    });

    // Page navigation
    $('#btnPageFirst').addEventListener('click', () => goToPage(0));
    $('#btnPagePrev').addEventListener('click', () => goToPage(currentPage - 1));
    $('#btnPageNext').addEventListener('click', () => goToPage(currentPage + 1));
    $('#btnPageLast').addEventListener('click', () => goToPage(totalPages - 1));

    // Printer config button
    $('#btnPrinterConfig').addEventListener('click', function() {
      var sel = $('#printerSelect');
      var printer = sel ? sel.value : '';
      if (!printer) { alert('Seleccione una impresora'); return; }
      if (window.__TAURI__) {
        window.__TAURI__.core.invoke('open_printer_config', { printer: printer }).catch(function(e) {
          alert('Error: ' + e);
        });
      }
    });

    // Context menu actions
    $$('#ctxMenu .ctx-item').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var action = btn.dataset.action;
        if (action === 'rotate') ctxRotate();
        else if (action === 'duplicate') ctxDuplicate();
        else if (action === 'clear') ctxClear();
        else if (action === 'expandH') ctxExpandH();
        else if (action === 'expandV') ctxExpandV();
        hideContextMenu();
      });
    });

    // Hide context menu on click elsewhere or scroll
    document.addEventListener('click', function() { hideContextMenu(); });
    canvasScroll.addEventListener('scroll', function() { hideContextMenu(); });

    // Prevent default context menu only outside img-cells
    document.addEventListener('contextmenu', function(e) {
      if (!e.target.closest('.img-cell') || !e.target.closest('.img-cell').dataset.id) {
        e.preventDefault();
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      var isInput = (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA');
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size && !isInput) { e.preventDefault(); removeSelectedImages(); }
      if ((e.key === 'r' || e.key === 'R') && selectedIds.size && !e.ctrlKey && !isInput) {
        selectedIds.forEach(function(sid) {
          var rImg = images.find(function(i) { return i.id === sid; });
          if (rImg) rImg.overrides.rotation = ((rImg.overrides.rotation || 0) + 90) % 360;
        });
        updateInspector(); render();
      }
      if (e.ctrlKey && e.key === '+') { e.preventDefault(); setZoom(zoom + 0.1); }
      if (e.ctrlKey && e.key === '-') { e.preventDefault(); setZoom(zoom - 0.1); }
      if (e.ctrlKey && e.key === 'p') { e.preventDefault(); if (window.__TAURI__) printNative(); else printNow(); }
      if (e.key === 'Escape' && $('#modalPageConfig').classList.contains('open')) closeModal();
    });

    // Mouse wheel zoom
    canvasScroll.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom(zoom + (e.deltaY > 0 ? -0.05 : 0.05));
    }, { passive: false });

    // Click canvas to deselect
    canvasScroll.addEventListener('click', (e) => {
      if (e.target === canvasScroll || e.target === pagesContainer) {
        selectedIds.clear();
        $$('.img-cell.selected').forEach(el => el.classList.remove('selected'));
        updateInspector();
      }
    });

    // Track which page is visible during scroll
    canvasScroll.addEventListener('scroll', () => {
      const pages = pagesContainer.children;
      if (!pages.length) return;
      const scrollTop = canvasScroll.scrollTop;
      const scrollCenter = scrollTop + canvasScroll.clientHeight / 2;
      let closest = 0;
      let closestDist = Infinity;
      for (let i = 0; i < pages.length; i++) {
        const rect = pages[i].getBoundingClientRect();
        const containerRect = canvasScroll.getBoundingClientRect();
        const pageCenter = rect.top - containerRect.top + rect.height / 2 + scrollTop;
        const dist = Math.abs(scrollCenter - pageCenter);
        if (dist < closestDist) { closestDist = dist; closest = i; }
      }
      if (closest !== currentPage) {
        currentPage = closest;
        updatePageNav();
      }
    });
  }

  // -- Init --
  async function init() {
    await loadPresets();
    var hasSaved = await readAppFile(CONFIG_FILE);
    if (hasSaved) {
      await loadConfig();
    } else {
      applyPreset();
    }
    updateLayoutModeVisibility();
    updateCaptionVisibility();
    updateMarginsVisibility();
    updatePageSummary();
    setupDragDrop();
    setupPaste();
    bindEvents();
    // Set spacing linked visual state
    if (spacingLinked) {
      $('#btnLinkSpacing').classList.add('active');
      $('#spacingV').value = $('#spacingH').value;
    }
    render();
    zoomFit();
    loadPrinters();
    checkForUpdates(true);
  }

  function showToast(msg, duration) {
    var el = $('#toastNotification');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._toastTimer);
    el._toastTimer = setTimeout(function() { el.classList.remove('show'); }, duration || 3000);
  }

  async function checkForUpdates(silent) {
    try {
      if (!window.__TAURI__ || !window.__TAURI__.core) {
        if (!silent) showToast('Imprime+ notifica: No disponible fuera de Tauri');
        return;
      }
      var core = window.__TAURI__.core;
      var metadata = await core.invoke('plugin:updater|check');
      if (metadata) {
        var msg = 'Nueva version ' + metadata.version + ' disponible.\nDesea actualizar ahora?';
        if (metadata.body) msg += '\n\n' + metadata.body;
        if (confirm(msg)) {
          showToast('Imprime+ notifica: Descargando actualizacion...');
          var channel = new core.Channel();
          await core.invoke('plugin:updater|download_and_install', {
            onEvent: channel,
            rid: metadata.rid
          });
          showToast('Imprime+ notifica: Reiniciando...');
          await core.invoke('plugin:process|restart');
        } else {
          // User declined, close the resource
          await core.invoke('plugin:resources|close', { rid: metadata.rid });
        }
      } else if (!silent) {
        showToast('Imprime+ notifica: Ya tiene la ultima version.');
      }
    } catch (e) {
      console.error('Update check failed:', e);
      if (!silent) showToast('Imprime+ notifica: Error al verificar actualizaciones.');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();

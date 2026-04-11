/**
 * Imprime+ — Layout Engine
 * Calculates grid positions, image sizes, and pagination
 */

const Engine = (function () {
  'use strict';

  /** Convert any unit to px  (96 DPI) */
  const UNIT_TO_PX = { cm: 96 / 2.54, in: 96, mm: 96 / 25.4 };

  function toPx(value, unit) {
    return value * (UNIT_TO_PX[unit] || UNIT_TO_PX.cm);
  }

  function fromPx(px, unit) {
    return px / (UNIT_TO_PX[unit] || UNIT_TO_PX.cm);
  }

  /**
   * Compute the grid layout for a given config.
   * Returns { cellW, cellH, cols, rows, totalSlots, pageW, pageH, contentW, contentH }
   */
  function computeLayout(config) {
    const unit = config.unit || 'cm';
    const pageW = toPx(config.pageWidth, unit);
    const pageH = toPx(config.pageHeight, unit);
    const mt = toPx(config.marginTop, unit);
    const mr = toPx(config.marginRight, unit);
    const mb = toPx(config.marginBottom, unit);
    const ml = toPx(config.marginLeft, unit);
    const sh = toPx(config.spacingH, unit);
    const sv = toPx(config.spacingV, unit);

    const contentW = pageW - ml - mr;
    const contentH = pageH - mt - mb;

    let cols, rows, cellW, cellH;

    if (config.layoutMode === 'grid') {
      cols = Math.max(1, config.gridCols);
      rows = Math.max(1, config.gridRows);
      cellW = (contentW - sh * (cols - 1)) / cols;
      cellH = (contentH - sv * (rows - 1)) / rows;
    } else if (config.layoutMode === 'count') {
      const count = Math.max(1, config.countPerPage);
      // Find best cols/rows to fill page while being as square as possible
      const ratio = contentW / contentH;
      cols = Math.max(1, Math.round(Math.sqrt(count * ratio)));
      rows = Math.ceil(count / cols);
      // Adjust if we overshot
      while (cols * rows < count) rows++;
      cellW = (contentW - sh * (cols - 1)) / cols;
      cellH = (contentH - sv * (rows - 1)) / rows;
    } else if (config.layoutMode === 'size') {
      cellW = toPx(config.imgWidth, unit);
      cellH = toPx(config.imgHeight, unit);
      cols = Math.max(1, Math.floor((contentW + sh) / (cellW + sh)));
      rows = Math.max(1, Math.floor((contentH + sv) / (cellH + sv)));
    } else {
      cols = 3; rows = 3;
      cellW = (contentW - sh * 2) / 3;
      cellH = (contentH - sv * 2) / 3;
    }

    return {
      pageW, pageH,
      contentW, contentH,
      marginTop: mt, marginRight: mr, marginBottom: mb, marginLeft: ml,
      spacingH: sh, spacingV: sv,
      cols, rows, cellW, cellH,
      totalSlots: cols * rows,
      perPage: config.layoutMode === 'count' ? Math.max(1, config.countPerPage) : cols * rows,
      unit,
    };
  }

  /**
   * Try to place a span (cs x rs) in a grid. Returns true if placed.
   */
  function tryPlace(grid, cols, rows, cs, rs) {
    for (var r = 0; r <= rows - rs; r++) {
      for (var c = 0; c <= cols - cs; c++) {
        var fits = true;
        for (var dr = 0; dr < rs && fits; dr++) {
          for (var dc = 0; dc < cs && fits; dc++) {
            if (grid[r + dr][c + dc]) fits = false;
          }
        }
        if (fits) {
          for (var dr = 0; dr < rs; dr++) {
            for (var dc = 0; dc < cs; dc++) {
              grid[r + dr][c + dc] = true;
            }
          }
          return true;
        }
      }
    }
    return false;
  }

  function makeGrid(cols, rows) {
    var g = [];
    for (var r = 0; r < rows; r++) {
      g.push(new Array(cols).fill(false));
    }
    return g;
  }

  /**
   * Distribute images across pages, accounting for colSpan/rowSpan.
   * Returns array of page objects: [{ images: [{...}, ...] }, ...]
   */
  function paginate(images, layout) {
    var pages = [];
    var cols = layout.cols;
    var rows = layout.rows;
    var perPage = layout.perPage;
    var grid = makeGrid(cols, rows);
    var pageImages = [];

    for (var i = 0; i < images.length; i++) {
      var img = images[i];
      var ov = img.overrides || {};
      var cs = Math.min(ov.colSpan || 1, cols);
      var rs = Math.min(ov.rowSpan || 1, rows);

      // In count mode, also enforce the per-page image count limit
      var countFull = (perPage < cols * rows) && (pageImages.length >= perPage);

      if (countFull || !tryPlace(grid, cols, rows, cs, rs)) {
        // Current page can't fit this image -- start new page
        pages.push({ images: pageImages });
        pageImages = [];
        grid = makeGrid(cols, rows);
        // Retry placement on fresh page
        tryPlace(grid, cols, rows, cs, rs);
      }

      pageImages.push(img);
    }

    pages.push({ images: pageImages });
    if (pages.length === 0) pages.push({ images: [] });
    return pages;
  }

  /**
   * Generate a clip-path CSS value for a shape.
   */
  function getShapeClip(shape) {
    switch (shape) {
      case 'circle': return 'circle(50% at 50% 50%)';
      case 'hexagon': return 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';
      case 'star': return 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)';
      default: return 'none';
    }
  }

  return { toPx, fromPx, computeLayout, paginate, getShapeClip, UNIT_TO_PX };
})();

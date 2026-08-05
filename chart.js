/**
 * WaveChart — a modern, zero-dependency canvas oscilloscope / signal chart.
 *
 * Design goals over the legacy version:
 *  - ESM + named export, typed via JSDoc (works with `tsc --noEmit` / editors).
 *  - Clean, options-object constructor instead of a `0xff` bitmask.
 *  - Series-based model: add channels at runtime, push one sample for all.
 *  - Device-pixel-ratio aware (crisp on HiDPI), auto-resize via ResizeObserver.
 *  - requestAnimationFrame + dirty-flag rendering (no 33ms polling loop).
 *  - Pointer Events (mouse + touch), decimated LOD for huge buffers,
 *    crosshair tooltip, wheel zoom, drag pan, bottom scrollbar.
 *
 * @module WaveChart
 */

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} SeriesOptions
 * @property {string} name        Channel label (also shown in the legend).
 * @property {string} [color]     CSS color. Falls back to a palette slot.
 * @property {boolean} [visible]  Default true.
 */

/**
 * @typedef {Object} SeriesState
 * @property {string} name
 * @property {string} color
 * @property {boolean} visible
 * @property {number[]} data      Ring-buffered samples (oldest first).
 */

/**
 * @typedef {Object} HoverInfo
 * @property {number} index                                  Global sample index.
 * @property {Array<{name:string,color:string,value:number}>} values  Per-series value.
 */

/**
 * @typedef {Object} ChartOptions
 * @property {HTMLCanvasElement} canvas
 * @property {SeriesOptions[]} [series]          Initial channels.
 * @property {number} [cacheSize=10000]          Max retained samples per channel.
 * @property {number} [showPoints=200]           Visible window size (in samples).
 * @property {number} [maxPoints]                LOD decimation threshold; default = canvas width.
 * @property {boolean} [autoScale=true]          Auto-fit amplitude to visible data.
 * @property {number} [autoScalePadding=0.1]     Padding as fraction of the data range.
 * @property {number} [pointSize=0]              Marker radius (0 disables markers).
 * @property {boolean} [interactive=true]        Enable wheel / drag / scrollbar.
 * @property {boolean} [tooltip=true]            Show crosshair + value readout.
 * @property {boolean} [follow=false]            Keep the newest samples anchored to the right edge (live mode).
 * @property {string} [gridColor='#333333']      Axis / grid color.
 * @property {string} [font='13px system-ui, sans-serif']
 * @property {'light'|'dark'} [theme='light']     Colour theme. In 'dark' mode axis/grid,
 *                                                labels, legend and tooltip switch to light
 *                                                colours that read well on a dark background.
 * @property {(info: HoverInfo) => void} [onHover]
 */

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const DEFAULT_PALETTE = [
  '#2f6df6', '#e23b3b', '#f5a623', '#16c784',
  '#a855f7', '#06b6d4', '#64748b', '#ec4899',
];

// Brighter palette used in dark mode so channels stay legible on a dark bg.
const DARK_PALETTE = [
  '#60a5fa', '#f87171', '#fbbf24', '#34d399',
  '#c084fc', '#22d3ee', '#94a3b8', '#f472b6',
];

// Theme-dependent colours for grid, labels, legend and tooltip chrome.
const THEME_COLORS = {
  light: {
    grid: '#333333',
    label: '#333333',
    legendBg: '#ffffff',
    legendText: '#111111',
    tooltipBg: '#ffffff',
    tooltipText: '#111111',
    crosshair: 'rgba(51,51,51,0.5)',
    followBg: 'rgba(255,255,255,0.9)',
    followIcon: '#2f6df6',
    scrollTrack: 'rgba(0,0,0,0.08)',
  },
  dark: {
    grid: '#475569',
    label: '#cbd5e1',
    legendBg: '#0f172a',
    legendText: '#e2e8f0',
    tooltipBg: '#0f172a',
    tooltipText: '#e2e8f0',
    crosshair: 'rgba(203,213,225,0.45)',
    followBg: 'rgba(15,23,42,0.9)',
    followIcon: '#60a5fa',
    scrollTrack: 'rgba(255,255,255,0.10)',
  },
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* ------------------------------------------------------------------ */
/* WaveChart                                                          */
/* ------------------------------------------------------------------ */

class WaveChart {
  /**
   * @param {ChartOptions} options
   */
  constructor(options) {
    if (!options || !options.canvas) {
      throw new Error('WaveChart: `canvas` is required in options.');
    }

    /** @type {ChartOptions} */
    this.opts = {
      cacheSize: 10000,
      showPoints: 200,
      autoScale: true,
      autoScalePadding: 0.1,
      pointSize: 0,
      interactive: true,
      tooltip: true,
      follow: false,
      gridColor: '#333333',
      font: '13px system-ui, sans-serif',
      theme: 'light',
      ...options,
    };

    // Resolve theme-dependent colours. An explicit gridColor in options wins
    // over the theme default so callers can still fully customise.
    this.theme = this.opts.theme === 'dark' ? 'dark' : 'light';
    this.ui = Object.assign({}, THEME_COLORS[this.theme]);
    if (options.gridColor) this.ui.grid = options.gridColor;
    this.palette = this.theme === 'dark' ? DARK_PALETTE : DEFAULT_PALETTE;

    this.canvas = this.opts.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.canvas.style.touchAction = 'none'; // let Pointer Events drive gestures

    /** @type {SeriesState[]} */
    this.series = [];
    this.colorCursor = 0;

    // View state
    this.dataIndex = 0;        // first visible sample (global index)
    this.showPoints = this.opts.showPoints;
    this.autoScale = this.opts.autoScale;
    this.follow = this.opts.follow;        // live mode: newest samples pinned to the right edge
    this.padding = this.opts.autoScalePadding;
    this.amplitudeOffset = 0;  // vertical pixel pan
    this.manualMin = 0;
    this.manualMax = 1;

    // Pointer / interaction state
    this._hover = -1;          // hovered visible-index
    this._hoverPos = [0, 0];
    this._drag = null;         // { mode:'pan'|'scroll', startX, startY, baseIndex, baseOffset }
    this._scrollbar = null;    // { y, h, handleW, trackW } computed each draw
    this._followBox = null;    // { x, y, w, h } right-side control, computed each draw

    // Render loop state (RAF + dirty flag; no polling timer)
    this._dirty = false;
    this._raf = 0;
    this._destroyed = false;

    // Sizing
    this._dpr = 1;
    this.width = 0;
    this.height = 0;
    this._maxPoints = this.opts.maxPoints || 0;

    // Bind handlers so they can be removed in destroy()
    this._onWheel = this._handleWheel.bind(this);
    this._onDown = this._handleDown.bind(this);
    this._onMove = this._handleMove.bind(this);
    this._onUp = this._handleUp.bind(this);
    this._onLeave = () => { this._hover = -1; this.requestDraw(); };
    this._loop = this._loop.bind(this);

    (this.opts.series || []).forEach((s) => this.addSeries(s));

    if (this.opts.interactive) {
      this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
      this.canvas.addEventListener('pointerdown', this._onDown);
      window.addEventListener('pointermove', this._onMove);
      window.addEventListener('pointerup', this._onUp);
      this.canvas.addEventListener('pointerleave', this._onLeave);
    }

    // Auto-resize + HiDPI.
    // ResizeObserver can miss the first size change when the host is shown via
    // display:none -> block (the element gets its real size before the observer
    // is connected, so no callback fires and the bitmap stays at 1x1 -> blurry).
    // Work around it by: (a) deferring observation to the next frame, (b) doing
    // an explicit resize on the next animation frame, and (c) a window resize fallback.
    this._onWinResize = () => this.resize();
    this._resizeObserver = new ResizeObserver(() => {
      // measure on the next frame so layout has settled
      requestAnimationFrame(() => this.resize());
    });
    // Defer observe() so a pending size change (e.g. becoming visible) is caught.
    requestAnimationFrame(() => {
      if (this._destroyed) return;
      this._resizeObserver.observe(this.canvas);
      this.resize();
    });
    // Immediate attempt too; harmless if size is still 0.
    this.resize();
    if (this.opts.interactive) window.addEventListener('resize', this._onWinResize);

    this.requestDraw();
  }

  /* ----------------------------- API ----------------------------- */

  /**
   * Register a channel. Returns its index.
   * @param {SeriesOptions} options
   * @returns {number}
   */
  addSeries(options) {
    const color = options.color || this.palette[this.colorCursor++ % this.palette.length];
    this.series.push({
      name: options.name || `通道 ${this.series.length + 1}`,
      color,
      visible: options.visible !== false,
      data: [],
    });
    this.requestDraw();
    return this.series.length - 1;
  }

  /**
   * Push one sample for every channel.
   * @param {number[]} values  Positional values, aligned to channel order.
   *                           Missing entries are stored as NaN.
   * @returns {this}
   */
  push(values) {
    const n = this.series.length;
    for (let i = 0; i < n; i++) {
      const s = this.series[i];
      s.data.push(values[i]);
    }
    this._trim();
    if (this.follow) this.dataIndex = this._clampIndex(this._len() - this.showPoints);
    this.requestDraw();
    return this;
  }

  /** @deprecated use {@link push} */
  addPoint(...values) { return this.push(values); }

  /**
   * Append a batch of samples (each element is one timestamp's values).
   * @param {number[][]} batch
   */
  pushBatch(batch) {
    for (const v of batch) this.push(v);
    return this;
  }

  /** Clear all data and reset the view. */
  clear() {
    for (const s of this.series) s.data.length = 0;
    this.dataIndex = 0;
    this.amplitudeOffset = 0;
    this.requestDraw();
    return this;
  }

  /** Reset zoom / pan / auto-scale to defaults. */
  reset() {
    this.dataIndex = Math.max(0, this._len() - this.showPoints);
    this.amplitudeOffset = 0;
    this.autoScale = true;
    this.requestDraw();
    return this;
  }

  /**
   * Turn live mode on/off. When on, the newest samples are kept pinned to the
   * right edge (and re-anchored on every push). Panning / dragging turns it off.
   * @param {boolean} on
   */
  followLatest(on) {
    this.follow = !!on;
    if (on) this.dataIndex = this._clampIndex(this._len() - this.showPoints);
    this.requestDraw();
    return this;
  }

  /** Reset auto-scale AND enable live mode (right-side control action). */
  _resetAndFollow() {
    this.autoScale = true;
    this.amplitudeOffset = 0;
    this.follow = true;
    this.dataIndex = this._clampIndex(this._len() - this.showPoints);
    this.requestDraw();
  }

  /** Set the visible window size (in samples). */
  setWindow(points) {
    this.showPoints = clamp(Math.round(points), 25, this.opts.cacheSize);
    this.requestDraw();
    return this;
  }

  /** Toggle / set auto-scaling of the vertical axis. */
  setAutoScale(on) {
    this.autoScale = !!on;
    if (on) this.amplitudeOffset = 0;
    this.requestDraw();
    return this;
  }

  /** Manually set the vertical range (also disables autoScale). */
  setRange(min, max) {
    this.autoScale = false;
    this.manualMin = min;
    this.manualMax = max;
    this.requestDraw();
    return this;
  }

  /** Zoom by a factor (>1 zooms out). Cursor x in CSS pixels keeps its sample. */
  zoom(factor, cursorX = this.width / 2) {
    const len = this._len();
    if (len === 0) return this;
    const start = this._start();
    const count = this._count(start);
    const cursorIndex = start + Math.round((cursorX / this.width) * (count - 1));
    const next = clamp(Math.round(this.showPoints * factor), 25, this.opts.cacheSize);
    const ratio = cursorX / this.width;
    let idx = Math.round(cursorIndex - ratio * (next - 1));
    this.showPoints = next;
    this.dataIndex = this._clampIndex(idx);
    this.requestDraw();
    return this;
  }

  /** Pan by a number of samples (positive = older data). */
  pan(samples) {
    this.dataIndex = this._clampIndex(this.dataIndex + samples);
    this.requestDraw();
    return this;
  }

  /** Enable / disable a channel by index. */
  setVisible(index, visible) {
    if (this.series[index]) {
      this.series[index].visible = visible;
      this.requestDraw();
    }
    return this;
  }

  /** Tear down listeners, observers and the RAF loop. */
  destroy() {
    this._destroyed = true;
    cancelAnimationFrame(this._raf);
    this._resizeObserver.disconnect();
    this.canvas.removeEventListener('wheel', this._onWheel);
    this.canvas.removeEventListener('pointerdown', this._onDown);
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('resize', this._onWinResize);
    this.canvas.removeEventListener('pointerleave', this._onLeave);
  }

  /* --------------------------- Internals -------------------------- */

  _len() {
    return this.series[0] ? this.series[0].data.length : 0;
  }

  /** Trim every channel to cacheSize, keeping the view anchored. */
  _trim() {
    const limit = this.opts.cacheSize;
    const over = this._len() - limit;
    if (over > 0) {
      for (const s of this.series) s.data.splice(0, over);
      this.dataIndex = Math.max(0, this.dataIndex - over);
    }
  }

  /** First visible index, clamped to valid range. */
  _start() {
    const len = this._len();
    return clamp(this.dataIndex, 0, Math.max(0, len - 1));
  }

  /** Number of visible samples (<= showPoints, <= available). */
  _count(start) {
    return Math.min(this.showPoints, Math.max(0, this._len() - start));
  }

  _clampIndex(idx) {
    const len = this._len();
    return clamp(idx, 0, Math.max(0, len - this.showPoints));
  }

  /** Mark dirty and schedule a single RAF. */
  requestDraw() {
    this._dirty = true;
    if (!this._raf) this._raf = requestAnimationFrame(this._loop);
  }

  _loop() {
    this._raf = 0;
    if (this._dirty) {
      this._dirty = false;
      this._draw();
    }
  }

  /** Recompute backing-store size for the current CSS box + DPR. */
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    // Skip if backing store already matches (avoids clearing data on every draw).
    if (this.canvas.width === bw && this.canvas.height === bh && this._dpr === dpr) {
      this.width = w; this.height = h;
      return;
    }
    this._dpr = dpr;
    this.canvas.width = bw;
    this.canvas.height = bh;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
    this.width = w;
    this.height = h;
    if (!this._maxPoints) this._maxPoints = Math.max(500, w);
    this.requestDraw();
  }

  /* ----------------------------- Draw ----------------------------- */

  _draw() {
    const { ctx, width, height } = this;
    // Safety net: if the canvas CSS box changed (e.g. became visible / re-laid-out)
    // but resize() was never triggered, the backing store would be wrong and the
    // chart blurry. Re-sync here before drawing.
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const bw = Math.round(Math.max(1, rect.width) * dpr);
    const bh = Math.round(Math.max(1, rect.height) * dpr);
    if (bw !== this.canvas.width || bh !== this.canvas.height) {
      this.resize();
    }
    ctx.clearRect(0, 0, width, height);

    const len = this._len();
    if (len === 0) {
      this._drawEmpty();
      return;
    }

    const start = this._start();
    const count = this._count(start);
    if (count <= 0) { this._drawEmpty(); return; }

    // Vertical range (auto or manual)
    let min, max;
    if (this.autoScale) {
      [min, max] = this._computeRange(start, count);
      this.manualMin = min; this.manualMax = max;
    } else {
      min = this.manualMin; max = this.manualMax;
    }
    const range = (max - min) || 1;
    const yOf = (v) => height + this.amplitudeOffset - ((v - min) / range) * height;

    // LOD decimation target
    const buckets = Math.min(count, this._maxPoints || count);

    this._drawGrid(min, max, yOf, height);

    for (const s of this.series) {
      if (!s.visible) continue;
      this._drawSeries(s, start, count, buckets, yOf);
    }

    this._drawTimeAxis(start, count);
    this._drawLegend();

    if (this.opts.tooltip && this._hover >= 0) {
      this._drawTooltip(start, yOf);
    }
    if (this.opts.interactive) {
      this._drawScrollbar(start, count);
      this._drawFollowControl();
    }
  }

  _drawEmpty() {
    const { ctx, width, height } = this;
    ctx.fillStyle = this.ui.label;
    ctx.font = this.opts.font;
    ctx.textAlign = 'center';
    ctx.fillText('等待数据…', width / 2, height / 2);
    ctx.textAlign = 'left';
  }

  /** Compute [min, max] over every visible channel's visible window. */
  _computeRange(start, count) {
    let min = Infinity, max = -Infinity;
    for (const s of this.series) {
      if (!s.visible) continue;
      const d = s.data;
      for (let i = 0; i < count; i++) {
        const v = d[start + i];
        if (v == null || Number.isNaN(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) { min = 0; max = 1; }
    if (min === max) { min -= 1; max += 1; }
    const pad = (max - min) * this.padding;
    return [min - pad, max + pad];
  }

  /**
   * Decimate a channel to `buckets` averaged points and draw it.
   * Returns the screen points [{x,y,v}] for tooltip hit-testing.
   */
  _drawSeries(s, start, count, buckets, yOf) {
    const { ctx, width } = this;
    const d = s.data;
    const step = count / buckets;
    const pts = new Array(buckets);

    ctx.beginPath();
    for (let i = 0; i < buckets; i++) {
      const a = start + Math.floor(i * step);
      const b = Math.min(start + count, start + Math.floor((i + 1) * step));
      let sum = 0, n = 0;
      for (let j = a; j < b; j++) { const v = d[j]; if (v != null && !Number.isNaN(v)) { sum += v; n++; } }
      const v = n ? sum / n : d[Math.min(a, start + count - 1)];
      const x = (i / (buckets - 1 || 1)) * width;
      const y = yOf(v);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      pts[i] = { x, y, v };
    }
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const ps = this.opts.pointSize;
    if (ps > 0) {
      ctx.fillStyle = s.color;
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, ps, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return pts;
  }

  _drawGrid(min, max, yOf, height) {
    const { ctx, width } = this;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = this.ui.label;
    ctx.strokeStyle = this.ui.grid;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;

    // Lay grid lines out at "nice" data values (multiples of a 1/2/5 * 10^n
    // step) and map each to the screen with yOf. Because the lines are anchored
    // to data values — not to fixed screen positions — they scroll vertically
    // together with the waveform when the user pans the Y axis.
    const span = (max - min) || 1;
    const rawStep = span / 5;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const norm = rawStep / mag;
    const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
    const first = Math.ceil(min / step) * step;

    for (let v = first; v <= max + 1e-9; v += step) {
      const y = yOf(v);
      if (y < -1 || y > height + 1) continue; // clip to plotting area
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      const label = Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(Math.max(0, -Math.floor(Math.log10(step))));
      ctx.fillText(label, 4, y - 3);
    }
    ctx.globalAlpha = 1;
  }

  _drawTimeAxis(start, count) {
    const { ctx, width, height } = this;
    const steps = 10;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = this.ui.label;
    ctx.strokeStyle = this.ui.grid;
    ctx.globalAlpha = 0.5;
    for (let i = 1; i < steps; i++) {
      const x = (i / steps) * width;
      ctx.beginPath();
      ctx.moveTo(x, height);
      ctx.lineTo(x, height - 8);
      ctx.stroke();
      const label = String(Math.round(start + (i / steps) * count));
      ctx.globalAlpha = 1;
      ctx.fillText(label, x - ctx.measureText(label).width / 2, height - 11);
      ctx.globalAlpha = 0.5;
    }
    ctx.globalAlpha = 1;
  }

  _drawLegend() {
    const { ctx } = this;
    const visible = this.series.filter((s) => s.visible);
    if (visible.length === 0) return;
    const boxW = 84, rowH = 18, pad = 6;
    const x = this.width - boxW - 8;
    const y = 8;
    const boxH = pad * 2 + rowH * visible.length;

    ctx.globalAlpha = 0.85;
    ctx.fillStyle = this.ui.legendBg;
    ctx.fillRect(x, y, boxW, boxH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = this.ui.grid;
    ctx.strokeRect(x, y, boxW, boxH);

    ctx.font = '12px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    visible.forEach((s, i) => {
      const cy = y + pad + rowH / 2 + i * rowH; // vertical center of the row
      ctx.fillStyle = s.color;
      ctx.fillRect(x + 8, cy - 1.5, 14, 3);     // color swatch centered on cy
      ctx.fillStyle = this.ui.legendText;
      ctx.fillText(s.name, x + 28, cy);
    });
    ctx.textBaseline = 'alphabetic'; // restore for the other draw passes
  }

  /**
   * Draw the crosshair + value readout at the hovered sample.
   * `this._hover` is a SAMPLE index within the visible window (0..count-1),
   * so the line is positioned by sample, never by the decimated bucket array.
   */
  _drawTooltip(start, yOf) {
    const { ctx } = this;
    const hi = this._hover;
    const count = this._count(start);
    if (count <= 0) return;

    // x of the hovered sample in the visible window (independent of LOD)
    const lineX = count > 1 ? (hi / (count - 1)) * this.width : 0;

    // crosshair
    ctx.strokeStyle = this.ui.crosshair;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lineX, 0);
    ctx.lineTo(lineX, this.height);
    ctx.stroke();

    const values = [];
    this.series.forEach((s) => {
      if (!s.visible) return;
      const raw = s.data[start + hi];
      const v = raw == null || Number.isNaN(raw) ? NaN : raw;
      if (!Number.isNaN(v)) {
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(lineX, yOf(v), 4, 0, Math.PI * 2);
        ctx.fill();
      }
      values.push({ name: s.name, color: s.color, value: v });
    });

    // box
    const boxW = 120, rowH = 16, pad = 6;
    let lx = lineX + 16;
    let ly = this._hoverPos[1] + 16;
    if (lx + boxW > this.width) lx = lineX - boxW - 16;
    const boxH = pad * 2 + rowH * (values.length + 1);
    if (ly + boxH > this.height) ly = this.height - boxH - 4;
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = this.ui.tooltipBg;
    ctx.fillRect(lx, ly, boxW, boxH);
    ctx.strokeStyle = this.ui.grid;
    ctx.globalAlpha = 1;
    ctx.strokeRect(lx, ly, boxW, boxH);
    ctx.font = this.opts.font;
    ctx.fillStyle = this.ui.tooltipText;
    ctx.fillText(`T: ${start + hi}`, lx + pad, ly + pad + 12);
    values.forEach((val, i) => {
      const txt = Number.isNaN(val.value)
        ? `${val.name}: —`
        : `${val.name}: ${val.value.toFixed(2)}`;
      ctx.fillStyle = val.color;
      ctx.fillText(txt, lx + pad, ly + pad + 12 + (i + 1) * rowH);
    });
    ctx.fillStyle = this.ui.tooltipText;

    if (this.opts.onHover) {
      this.opts.onHover({ index: start + hi, values });
    }
  }

  _drawScrollbar(start, count) {
    const { ctx } = this;
    const len = this._len();
    const trackH = 6, y = this.height - trackH;
    const trackX = 0, trackW = this.width;
    ctx.fillStyle = this.ui.scrollTrack;
    ctx.fillRect(trackX, y, trackW, trackH);
    const handleW = Math.max(12, (count / len) * trackW);
    const hx = (start / Math.max(1, len - count)) * (trackW - handleW);
    ctx.fillStyle = this.palette[0];
    ctx.fillRect(hx, y, handleW, trackH);
    this._scrollbar = { y, h: trackH, handleW, trackW };
  }

  /**
   * Small, unobtrusive "follow latest / live" button pinned to the bottom-right,
   * next to the scrollbar. Inactive = semi-transparent (blends with the chart);
   * active = opaque and uses the scrollbar-handle colour so it reads as part of
   * the bottom controls. Click to toggle "pin newest samples to the right edge".
   */
  _drawFollowControl() {
    const { ctx } = this;
    const s = 16;                 // small square button
    const pad = 3;
    const x = this.width - s - pad;
    const y = this.height - s - pad - 3; // sit just above the bottom scrollbar
    this._followBox = { x, y, w: s, h: s };

    // Inactive: faint, matching the scrollbar track style. Active: opaque,
    // filled with the scrollbar handle colour (this.palette[0]).
    if (this.follow) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = this.palette[0];
    } else {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = this.theme === 'dark' ? 'rgba(203,213,225,0.5)' : 'rgba(51,51,51,0.5)';
    }
    this._roundRect(x, y, s, s, 4);
    ctx.fill();
    ctx.globalAlpha = 1;

    // icon: vertical bar + right-pointing triangle => "jump to latest / live"
    const cx = x + s / 2;
    const cy = y + s / 2;
    const iconColor = this.follow ? '#ffffff' : (this.theme === 'dark' ? '#e2e8f0' : '#333333');
    const barH = 8;
    ctx.fillStyle = iconColor;
    ctx.fillRect(cx - 4, cy - barH / 2, 1.5, barH);
    ctx.beginPath();
    ctx.moveTo(cx - 0.5, cy - barH / 2);
    ctx.lineTo(cx - 0.5, cy + barH / 2);
    ctx.lineTo(cx + 4, cy);
    ctx.closePath();
    ctx.fill();
  }

  _roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** True when (x,y) is over the right-side follow control. */
  _hitFollow(x, y) {
    const b = this._followBox;
    return !!b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  }

  /* --------------------------- Pointer ---------------------------- */

  _localPoint(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  _handleDown(e) {
    const [x, y] = this._localPoint(e);
    const onFollow = this._hitFollow(x, y);

    // Middle button: reset on the follow control (live), else plain reset.
    if (e.button === 1) {
      if (onFollow) this._resetAndFollow();
      else this.reset();
      return;
    }
    if (e.button !== 0) return;

    // Scrollbar grab?
    if (this._scrollbar && y >= this._scrollbar.y && y <= this._scrollbar.y + this._scrollbar.h) {
      this._drag = { mode: 'scroll', startX: x };
    } else if (onFollow) {
      this._resetAndFollow(); // click the live control to re-enter follow mode
    } else {
      this._drag = { mode: 'pan', startX: e.clientX, startY: e.clientY, baseIndex: this.dataIndex, baseOffset: this.amplitudeOffset, baseMin: this.manualMin, baseMax: this.manualMax };
    }
    this.canvas.setPointerCapture?.(e.pointerId);
  }

  _handleUp() {
    this._drag = null;
  }

  _handleMove(e) {
    const [x, y] = this._localPoint(e);

    if (this._drag) {
      if (this._drag.mode === 'scroll') {
        this.follow = false; // manual navigation leaves live mode
        const len = this._len();
        const count = this._count(this._start());
        const { trackW, handleW } = this._scrollbar;
        const ratio = clamp(x / trackW, 0, 1);
        this.dataIndex = this._clampIndex(Math.round(ratio * (len - count)));
      } else { // pan
        this.follow = false; // manual navigation leaves live mode
        const start = this._start();
        const count = this._count(start);
        const perSample = this.width / Math.max(1, count - 1);
        const dxSamples = Math.round((this._drag.startX - e.clientX) / perSample);
        this.dataIndex = this._clampIndex(this._drag.baseIndex + dxSamples);
        // Vertical pan: shift the visible data range (manualMin/Max) by the
        // dragged pixel amount, so the Y grid lines + value labels follow the
        // waveform instead of only the curve moving via a screen offset.
        const dyPixels = (e.clientY - this._drag.startY);
        const prevMin = this._drag.baseMin, prevMax = this._drag.baseMax;
        const prevRange = (prevMax - prevMin) || 1;
        const dVal = (dyPixels / this.height) * prevRange;
        this.manualMin = prevMin + dVal;
        this.manualMax = prevMax + dVal;
        this.autoScale = false;
        this.amplitudeOffset = 0;
      }
      this.requestDraw();
      return;
    }

    // Hover (suppress while over the follow control)
    if (this._hitFollow(x, y)) {
      if (this._hover !== -1) { this._hover = -1; this.requestDraw(); }
      return;
    }
    this._updateHover(x, y);
  }

  /** Recompute the hovered sample from a local canvas coordinate. */
  _updateHover(x, y) {
    if (!this.opts.tooltip) return;
    if (x >= 0 && x <= this.width && y >= 0 && y <= this.height) {
      const count = this._count(this._start());
      if (count <= 0) {
        if (this._hover !== -1) { this._hover = -1; this.requestDraw(); }
        return;
      }
      const hi = clamp(Math.round((x / this.width) * (count - 1)), 0, count - 1);
      if (hi !== this._hover || this._hoverPos[0] !== x || this._hoverPos[1] !== y) {
        this._hover = hi;
        this._hoverPos = [x, y];
        this.requestDraw();
      }
    } else if (this._hover !== -1) {
      this._hover = -1;
      this.requestDraw();
    }
  }

    _handleWheel(e) {
    e.preventDefault();
    const [x, y] = this._localPoint(e);
    const delta = Math.sign(e.deltaY); // >0 scroll down

    if (x < this.width * 0.1) {
      // Vertical zoom: disable auto-scale, zoom around center.
      if (this.autoScale) {
        [this.manualMin, this.manualMax] = this._computeRange(this._start(), this._count(this._start()));
        this.autoScale = false;
      }
      const center = (this.manualMax + this.manualMin) / 2;
      const half = ((this.manualMax - this.manualMin) / 2) * (delta > 0 ? 1.15 : 1 / 1.15);
      this.manualMin = center - half;
      this.manualMax = center + half;
    } else {
      this.zoom(delta > 0 ? 1.15 : 1 / 1.15, x);
    }
    // Keep the crosshair glued to the cursor while zooming.
    this._updateHover(x, y);
    this.requestDraw();
  }
}

if (typeof window !== 'undefined') window.WaveChart = WaveChart;
if (typeof module !== 'undefined') module.exports = WaveChart;



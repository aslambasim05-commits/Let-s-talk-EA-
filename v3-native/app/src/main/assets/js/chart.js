/* ================= LET'S TALK PRO — CANVAS CHART ENGINE =================
   Candle chart with pan / pinch-zoom / crosshair, indicator overlays and
   stacked oscillator panes. No dependencies. */
(function () {
  'use strict';

  var UP = '#00F0A0';
  var DOWN = '#FF3B5C';
  var GRID = 'rgba(126,178,255,0.055)';
  var GRID_STRONG = 'rgba(126,178,255,0.10)';
  var TXT = '#6F819B';
  var TXT_HI = '#C9D7EC';

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function Chart(canvas, opts) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts || {};
    this.candles = [];
    this.groups = [];
    this.meta = { symbol: 'BTCUSDT', tf: '15m', digits: 2 };
    this.view = { start: 0, end: 0, bars: 90 };
    this.cross = null;
    this.px = { w: 0, h: 0, dpr: 1 };
    this.dirty = true;
    this.pointers = new Map();
    this.lastTap = 0;
    this._raf = null;
    this._bind();
    this._resize();
    var self = this;
    if (window.ResizeObserver) {
      new ResizeObserver(function () { self._resize(); }).observe(canvas.parentNode || canvas);
    } else {
      window.addEventListener('resize', function () { self._resize(); });
    }
  }

  Chart.prototype._resize = function () {
    var r = this.cv.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.px.w = r.width; this.px.h = r.height; this.px.dpr = dpr;
    this.cv.width = Math.max(1, Math.round(r.width * dpr));
    this.cv.height = Math.max(1, Math.round(r.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.invalidate();
  };

  Chart.prototype.setMeta = function (m) {
    if (!m) return;
    if (m.symbol) this.meta.symbol = m.symbol;
    if (m.tf) this.meta.tf = m.tf;
    if (typeof m.digits === 'number') this.meta.digits = m.digits;
    this.invalidate();
  };

  Chart.prototype.setCandles = function (list, keepView) {
    var first = this.candles.length === 0;
    var atRight = this.view.end >= this.candles.length - 0.001;
    this.candles = list || [];
    if (first || !keepView || this.view.end === 0) {
      this.resetView();
    } else {
      // follow new bars only if the user is parked on the live edge
      if (atRight && this.candles.length) {
        var span = this.view.end - this.view.start;
        this.view.end = this.candles.length;
        this.view.start = Math.max(0, this.view.end - span);
      } else {
        this.view.end = Math.min(this.view.end, this.candles.length);
        this.view.start = clamp(this.view.start, 0, Math.max(0, this.candles.length - 12));
      }
    }
    this.invalidate();
  };

  Chart.prototype.setIndicators = function (groups) {
    this.groups = groups || [];
    this.invalidate();
  };

  Chart.prototype.resetView = function () {
    this.cross = null;
    var n = this.candles.length;
    var bars = Math.min(Math.max(40, this.view.bars || 90), Math.max(1, n));
    this.view.bars = bars;
    this.view.end = n;
    this.view.start = Math.max(0, n - bars);
    this.invalidate();
  };

  Chart.prototype.invalidate = function () {
    this.dirty = true;
    if (this._raf) return;
    var self = this;
    this._raf = requestAnimationFrame(function () {
      self._raf = null;
      if (self.dirty) { self.dirty = false; self.draw(); }
    });
  };

  /* ------------------------------ layout ------------------------------ */
  Chart.prototype._layout = function () {
    var w = this.px.w, h = this.px.h;
    var axisR = 58, axisB = 17, padL = 6, padT = 8;
    var plotW = Math.max(10, w - axisR - padL);
    var oscGroups = [];
    for (var g = 0; g < this.groups.length; g++) {
      if (this.groups[g].pane === 'osc') oscGroups.push(this.groups[g]);
    }
    oscGroups = oscGroups.slice(0, 2);
    var oscH = 0;
    if (oscGroups.length === 1) oscH = Math.min(86, (h - axisB) * 0.26);
    if (oscGroups.length === 2) oscH = Math.min(70, (h - axisB) * 0.21);
    var priceTop = padT, priceH = h - axisB - padT - (oscH * oscGroups.length);
    priceH = Math.max(60, priceH);
    var rects = [{ y0: priceTop, y1: priceTop + priceH, group: null }];
    for (var i = 0; i < oscGroups.length; i++) {
      var y0 = priceTop + priceH + i * oscH;
      rects.push({ y0: y0, y1: y0 + oscH, group: oscGroups[i] });
    }
    return { w: w, h: h, x0: padL, x1: padL + plotW, axisR: axisR, axisB: axisB, rects: rects, oscGroups: oscGroups };
  };

  Chart.prototype._xOf = function (i, L) {
    var n = this.view.end - this.view.start;
    var bw = (L.x1 - L.x0) / Math.max(1, n);
    return L.x0 + (i - this.view.start + 0.5) * bw;
  };
  Chart.prototype._barW = function (L) {
    var n = this.view.end - this.view.start;
    return (L.x1 - L.x0) / Math.max(1, n);
  };
  Chart.prototype._iOfX = function (x, L) {
    var n = this.view.end - this.view.start;
    var bw = (L.x1 - L.x0) / Math.max(1, n);
    return this.view.start + (x - L.x0) / bw - 0.5;
  };

  Chart.prototype._visibleRange = function () {
    var a = Math.max(0, Math.floor(this.view.start));
    var b = Math.min(this.candles.length, Math.ceil(this.view.end));
    return [a, b];
  };

  /* ------------------------------ drawing ------------------------------ */
  Chart.prototype.draw = function () {
    var ctx = this.ctx, L = this._layout();
    var w = L.w, h = L.h;
    ctx.clearRect(0, 0, w, h);
    if (!this.candles.length) {
      ctx.fillStyle = 'rgba(126,178,255,0.25)';
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('AWAITING MARKET DATA', w / 2, h / 2);
      return;
    }

    var range = this._visibleRange();
    var a = range[0], b = range[1];

    // ---- price scale over visible candles + price-pane plots
    var lo = Infinity, hi = -Infinity, i, c;
    for (i = a; i < b; i++) {
      c = this.candles[i];
      if (!c) continue;
      if (c.l < lo) lo = c.l;
      if (c.h > hi) hi = c.h;
    }
    var priceGroups = [];
    for (var g = 0; g < this.groups.length; g++) {
      if (this.groups[g].pane !== 'osc') priceGroups.push(this.groups[g]);
    }
    for (g = 0; g < priceGroups.length; g++) {
      var plots = priceGroups[g].plots || [];
      for (var p = 0; p < plots.length; p++) {
        var d = plots[p].data || [];
        for (i = a; i < b; i++) {
          var v = d[i];
          if (!v) continue;
          var v1 = (v.v1 !== undefined ? v.v1 : v.v);
          var v2 = (v.v2 !== undefined ? v.v2 : v.v);
          if (v1 !== null && v1 !== undefined) { if (v1 < lo) lo = v1; if (v1 > hi) hi = v1; }
          if (v2 !== null && v2 !== undefined) { if (v2 < lo) lo = v2; if (v2 > hi) hi = v2; }
        }
      }
    }
    if (!isFinite(lo) || !isFinite(hi)) return;
    if (hi === lo) { hi += hi * 0.001 || 1; lo -= lo * 0.001 || 1; }
    var pad = (hi - lo) * 0.10;
    lo -= pad; hi += pad;

    var priceRect = L.rects[0];
    var volH = Math.min(46, (priceRect.y1 - priceRect.y0) * 0.19);
    var priceBottom = priceRect.y1 - volH;
    var py = function (v) {
      return priceBottom - (v - lo) / (hi - lo) * (priceBottom - priceRect.y0);
    };
    var pyInv = function (y) {
      return lo + (priceBottom - y) / (priceBottom - priceRect.y0) * (hi - lo);
    };

    // ---- horizontal grid + price labels
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'left';
    var lastC = this.candles[this.candles.length - 1];
    var lastY = lastC ? py(lastC.c) : -999;
    var levels = 4;
    for (i = 0; i <= levels; i++) {
      var vv = lo + (hi - lo) * (i / levels);
      var yy = py(vv);
      if (yy < priceRect.y0 || yy > priceBottom) continue;
      ctx.strokeStyle = GRID;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(L.x0, Math.round(yy) + .5); ctx.lineTo(L.x1, Math.round(yy) + .5); ctx.stroke();
      var nearCross = this.cross && Math.abs(yy - this.cross.y) < 14;
      if (Math.abs(yy - lastY) > 13 && !nearCross) {
        ctx.fillStyle = TXT;
        ctx.fillText(this._fmtPrice(vv), L.x1 + 7, yy + 3);
      }
    }

    // ---- vertical grid + time labels
    var bw = this._barW(L);
    var step = Math.max(1, Math.ceil(76 / bw));
    var tfms = this._tfMs();
    ctx.textAlign = 'center';
    for (i = Math.ceil(a / step) * step; i < b; i += step) {
      var x = this._xOf(i, L);
      if (x < L.x0 + 10 || x > L.x1 - 10) continue;
      ctx.strokeStyle = GRID;
      ctx.beginPath(); ctx.moveTo(Math.round(x) + .5, priceRect.y0); ctx.lineTo(Math.round(x) + .5, priceRect.y1); ctx.stroke();
      if (this.candles[i]) {
        ctx.fillStyle = TXT;
        ctx.fillText(this._fmtTime(this.candles[i].t, tfms), x, h - 5);
      }
    }

    // ---- volume
    var maxVol = 0;
    for (i = a; i < b; i++) { c = this.candles[i]; if (c && c.v > maxVol) maxVol = c.v; }
    if (maxVol > 0) {
      for (i = a; i < b; i++) {
        c = this.candles[i];
        if (!c) continue;
        var vh = (c.v / maxVol) * (volH - 3);
        var up = c.c >= c.o;
        ctx.fillStyle = up ? 'rgba(0,240,160,0.16)' : 'rgba(255,59,92,0.16)';
        var bx = this._xOf(i, L);
        ctx.fillRect(bx - Math.max(1, bw * 0.29), priceRect.y1 - vh, Math.max(1.4, bw * 0.58), vh);
      }
    }

    // ---- candles (batched paths)
    var bodyW = Math.max(1.2, bw * 0.62);
    var upPath = new Path2D(), dnPath = new Path2D();
    var upBody = new Path2D(), dnBody = new Path2D();
    for (i = a; i < b; i++) {
      c = this.candles[i];
      if (!c) continue;
      var cx = this._xOf(i, L);
      var isUp = c.c >= c.o;
      var wick = isUp ? upPath : dnPath;
      wick.moveTo(cx, py(c.h));
      wick.lineTo(cx, py(c.l));
      var top = py(Math.max(c.o, c.c));
      var bot = py(Math.min(c.o, c.c));
      var bh = Math.max(1, bot - top);
      var body = isUp ? upBody : dnBody;
      body.rect(cx - bodyW / 2, top, bodyW, bh);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,240,160,0.85)'; ctx.stroke(upPath);
    ctx.strokeStyle = 'rgba(255,59,92,0.85)'; ctx.stroke(dnPath);
    ctx.fillStyle = 'rgba(0,240,160,0.92)'; ctx.fill(upBody);
    ctx.fillStyle = 'rgba(255,59,92,0.92)'; ctx.fill(dnBody);

    // glowing last candle
    var last = this.candles[this.candles.length - 1];
    if (last && this.view.end >= this.candles.length - 1) {
      var lx = this._xOf(this.candles.length - 1, L);
      if (lx > L.x0 - 20) {
        ctx.save();
        ctx.shadowBlur = 14;
        ctx.shadowColor = last.c >= last.o ? UP : DOWN;
        ctx.fillStyle = last.c >= last.o ? UP : DOWN;
        ctx.fillRect(lx - bodyW / 2, py(Math.max(last.o, last.c)), bodyW, Math.max(1.5, py(Math.min(last.o, last.c)) - py(Math.max(last.o, last.c))));
        ctx.restore();
      }
    }

    // ---- price-pane indicator overlays
    this._drawPlots(ctx, L, priceGroups, a, b, py, null);

    // ---- last price line
    if (last) {
      var lp = py(last.c);
      var upLast = last.c >= last.o;
      ctx.save();
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = upLast ? 'rgba(0,240,160,0.55)' : 'rgba(255,59,92,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(L.x0, Math.round(lp) + .5); ctx.lineTo(L.x1, Math.round(lp) + .5); ctx.stroke();
      ctx.restore();
      // pill
      var label = this._fmtPrice(last.c);
      ctx.font = '600 9.5px ui-monospace, monospace';
      var tw = ctx.measureText(label).width + 12;
      var ph = 16;
      var px0 = L.x1 + 2;
      ctx.fillStyle = upLast ? UP : DOWN;
      this._roundRect(ctx, px0, lp - ph / 2, Math.min(tw, L.axisR - 6), ph, 4);
      ctx.fill();
      ctx.fillStyle = '#04121A';
      ctx.textAlign = 'left';
      ctx.fillText(label, px0 + 5, lp + 3.4);
    }

    // ---- oscillator panes
    for (var ri = 1; ri < L.rects.length; ri++) {
      var rect = L.rects[ri];
      var grp = rect.group;
      if (!grp) continue;
      ctx.strokeStyle = GRID_STRONG;
      ctx.beginPath();
      ctx.moveTo(L.x0, Math.round(rect.y0) + .5);
      ctx.lineTo(L.x1, Math.round(rect.y0) + .5);
      ctx.stroke();

      var olo = Infinity, ohi = -Infinity;
      var gplots = grp.plots || [];
      for (var q = 0; q < gplots.length; q++) {
        var gd = gplots[q].data || [];
        for (i = a; i < b; i++) {
          var gv = gd[i];
          if (!gv || gv.v === null || gv.v === undefined) continue;
          if (gv.v < olo) olo = gv.v;
          if (gv.v > ohi) ohi = gv.v;
        }
      }
      if (!isFinite(olo)) { olo = 0; ohi = 1; }
      if (ohi === olo) { ohi += 1; olo -= 1; }
      var op = (ohi - olo) * 0.12;
      olo -= op; ohi += op;
      var oy = function (v) { return rect.y1 - (v - olo) / (ohi - olo) * (rect.y1 - rect.y0); };

      // zero line
      if (olo < 0 && ohi > 0) {
        var zy = oy(0);
        ctx.save(); ctx.setLineDash([2, 4]);
        ctx.strokeStyle = 'rgba(126,178,255,0.12)';
        ctx.beginPath(); ctx.moveTo(L.x0, zy); ctx.lineTo(L.x1, zy); ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.beginPath(); ctx.rect(L.x0, rect.y0, L.x1 - L.x0, rect.y1 - rect.y0); ctx.clip();
      this._drawPlots(ctx, L, [grp], a, b, oy, olo);
      ctx.restore();

      // pane label + last values
      ctx.textAlign = 'left';
      var tx = L.x0 + 4;
      for (q = 0; q < gplots.length; q++) {
        var pl = gplots[q];
        var arr = pl.data || [];
        var prev = null;
        for (i = Math.min(b, arr.length) - 1; i >= a; i--) { if (arr[i] && arr[i].v !== null && arr[i].v !== undefined) { prev = arr[i].v; break; } }
        ctx.font = '8.5px ui-monospace, monospace';
        ctx.fillStyle = pl.color || TXT;
        var t = pl.label + (prev !== null ? ' ' + this._fmtOsc(prev) : '');
        ctx.fillText(t, tx, rect.y0 + 11);
        tx += ctx.measureText(t).width + 12;
      }
      ctx.textAlign = 'left';
      ctx.fillStyle = TXT;
      ctx.fillText(this._fmtOsc(ohi), L.x1 + 7, rect.y0 + 9);
      ctx.fillText(this._fmtOsc(olo), L.x1 + 7, rect.y1 - 3);
    }

    // ---- watermark
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '700 15px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(126,178,255,0.05)';
    ctx.fillText(this.meta.symbol + '  ·  ' + this.meta.tf, (L.x0 + L.x1) / 2, priceRect.y0 + (priceBottom - priceRect.y0) * 0.42);
    ctx.restore();

    // ---- crosshair
    if (this.cross) this._drawCrosshair(ctx, L, py, pyInv, priceRect);
  };

  Chart.prototype._drawPlots = function (ctx, L, groups, a, b, yFn, paneLo) {
    for (var g = 0; g < groups.length; g++) {
      var plots = groups[g].plots || [];
      for (var p = 0; p < plots.length; p++) {
        var pl = plots[p], data = pl.data || [];
        var color = pl.color || '#00E5FF';
        ctx.lineWidth = pl.width || 1.3;
        ctx.strokeStyle = color;

        if (pl.type === 'band') {
          var started = false;
          ctx.beginPath();
          for (var i = a; i < b; i++) {
            var v = data[i];
            if (!v || v.v1 === null || v.v2 === null || v.v1 === undefined) { started = false; continue; }
            var x = this._xOf(i, L);
            if (!started) { ctx.moveTo(x, yFn(v.v1)); started = true; } else ctx.lineTo(x, yFn(v.v1));
          }
          for (i = b - 1; i >= a; i--) {
            var v2 = data[i];
            if (!v2 || v2.v2 === null || v2.v2 === undefined) continue;
            ctx.lineTo(this._xOf(i, L), yFn(v2.v2));
          }
          ctx.closePath();
          ctx.save();
          ctx.globalAlpha = 0.07;
          ctx.fillStyle = color; ctx.fill();
          ctx.restore();
          // edges
          this._strokeSeries(ctx, L, data, 'v1', a, b, yFn, color, 0.75, 1);
          this._strokeSeries(ctx, L, data, 'v2', a, b, yFn, color, 0.75, 1);
          continue;
        }

        if (pl.type === 'hist') {
          var bwid = Math.max(1, this._barW(L) * 0.6);
          var zeroY = yFn(0);
          for (i = a; i < b; i++) {
            var hv = data[i];
            if (!hv || hv.v === null || hv.v === undefined) continue;
            var hx = this._xOf(i, L);
            var yv = yFn(hv.v);
            ctx.fillStyle = hv.v >= 0 ? this._alpha(color, 0.55) : 'rgba(255,59,92,0.5)';
            ctx.fillRect(hx - bwid / 2, Math.min(yv, zeroY), bwid, Math.max(1, Math.abs(yv - zeroY)));
          }
          continue;
        }

        if (pl.type === 'area') {
          var firstX = null, lastX = null;
          ctx.beginPath();
          var open = false;
          for (i = a; i < b; i++) {
            var av = data[i];
            if (!av || av.v === null || av.v === undefined) { open = false; continue; }
            var ax = this._xOf(i, L);
            if (!open) { ctx.moveTo(ax, yFn(av.v)); open = true; }
            else ctx.lineTo(ax, yFn(av.v));
            if (firstX === null) firstX = ax;
            lastX = ax;
          }
          if (firstX !== null) {
            ctx.lineTo(lastX, L.rects[0].y1);
            ctx.lineTo(firstX, L.rects[0].y1);
            ctx.closePath();
            var grad = ctx.createLinearGradient(0, L.rects[0].y0, 0, L.rects[0].y1);
            grad.addColorStop(0, this._alpha(color, 0.26));
            grad.addColorStop(1, this._alpha(color, 0));
            ctx.fillStyle = grad; ctx.fill();
          }
        }

        // line / level
        var dashed = pl.type === 'level';
        if (dashed) ctx.setLineDash([2, 4]);
        this._strokeSeries(ctx, L, data, 'v', a, b, yFn, color, pl.opacity || 1, pl.width || 1.3);
        if (dashed) ctx.setLineDash([]);
      }
    }
  };

  Chart.prototype._strokeSeries = function (ctx, L, data, key, a, b, yFn, color, alpha, width) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    var open = false, x, v;
    for (var i = a; i < b; i++) {
      v = data[i];
      if (!v) { open = false; continue; }
      var val = v[key];
      if (val === null || val === undefined || !isFinite(val)) { open = false; continue; }
      x = this._xOf(i, L);
      if (!open) { ctx.moveTo(x, yFn(val)); open = true; }
      else ctx.lineTo(x, yFn(val));
    }
    ctx.stroke();
    ctx.restore();
  };

  Chart.prototype._drawCrosshair = function (ctx, L, py, pyInv, rect) {
    var x = this.cross.x, y = this.cross.y;
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(190,220,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(Math.round(x) + .5, L.rects[0].y0); ctx.lineTo(Math.round(x) + .5, L.rects[L.rects.length - 1].y1); ctx.stroke();
    if (y >= rect.y0 && y <= rect.y1) {
      ctx.beginPath(); ctx.moveTo(L.x0, Math.round(y) + .5); ctx.lineTo(L.x1, Math.round(y) + .5); ctx.stroke();
    }
    ctx.restore();

    var idx = Math.round(this._iOfX(x, L));
    var candle = this.candles[idx];
    if (candle) {
      var cx = this._xOf(idx, L);
      ctx.fillStyle = 'rgba(0,229,255,0.9)';
      ctx.beginPath(); ctx.arc(cx, py(candle.c), 2.4, 0, Math.PI * 2); ctx.fill();

      var label = this._fmtPrice(pyInv(y));
      ctx.font = '600 9px ui-monospace, monospace';
      var tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = '#0B1220';
      ctx.strokeStyle = 'rgba(0,229,255,0.5)';
      this._roundRect(ctx, L.x1 + 2, y - 7.5, Math.min(tw, L.axisR - 6), 15, 3);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = TXT_HI;
      ctx.textAlign = 'left';
      ctx.fillText(label, L.x1 + 6, y + 3);

      var tl = this._fmtTimeFull(candle.t);
      ctx.font = '9px ui-monospace, monospace';
      var ttw = ctx.measureText(tl).width + 12;
      ctx.fillStyle = '#0B1220';
      ctx.strokeStyle = 'rgba(0,229,255,0.4)';
      this._roundRect(ctx, clamp(cx - ttw / 2, L.x0, L.x1 - ttw), this.px.h - 16, ttw, 14, 3);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = TXT_HI;
      ctx.textAlign = 'center';
      ctx.fillText(tl, clamp(cx, L.x0 + ttw / 2, L.x1 - ttw / 2), this.px.h - 6);
    }
  };

  Chart.prototype._roundRect = function (ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  Chart.prototype._alpha = function (hex, a) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  };

  /* ---------------------------- formatting ---------------------------- */
  Chart.prototype._fmtPrice = function (v) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    var d = this.meta.digits;
    if (v >= 1000) return v.toFixed(Math.max(0, d - 1));
    if (v >= 1) return v.toFixed(d);
    if (v >= 0.01) return v.toFixed(Math.max(d, 4));
    return v.toFixed(Math.max(d, 6));
  };
  Chart.prototype._fmtOsc = function (v) {
    if (!isFinite(v)) return '—';
    var a = Math.abs(v);
    if (a >= 1000) return (v / 1000).toFixed(1) + 'k';
    if (a >= 100) return v.toFixed(0);
    if (a >= 1) return v.toFixed(2);
    return v.toFixed(3);
  };
  Chart.prototype._tfMs = function () {
    var m = { '1m': 6e4, '3m': 18e4, '5m': 3e5, '15m': 9e5, '30m': 18e5, '1h': 36e5, '4h': 144e5, '1d': 864e5 };
    return m[this.meta.tf] || 9e5;
  };
  Chart.prototype._fmtTime = function (t, tfms) {
    var d = new Date(t);
    if (tfms >= 864e5) return (d.getUTCMonth() + 1) + '/' + d.getUTCDate();
    var hh = String(d.getUTCHours()).padStart(2, '0');
    var mm = String(d.getUTCMinutes()).padStart(2, '0');
    return hh + ':' + mm;
  };
  Chart.prototype._fmtTimeFull = function (t) {
    var d = new Date(t);
    return String(d.getUTCDate()).padStart(2, '0') + ' ' +
      ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getUTCMonth()] +
      ' ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
  };

  /* --------------------------- interaction --------------------------- */
  Chart.prototype._bind = function () {
    var self = this;
    var cv = this.cv;

    function pos(e) {
      var r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    cv.addEventListener('pointerdown', function (e) {
      cv.setPointerCapture(e.pointerId);
      self.pointers.set(e.pointerId, pos(e));
      self.drag = { x: self.pointers.get(e.pointerId).x, moved: 0, start: { start: self.view.start, end: self.view.end } };
      self.pinch = null;
      if (self.pointers.size === 2) {
        var pts = Array.from(self.pointers.values());
        self.pinch = { dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), mid: (pts[0].x + pts[1].x) / 2 };
      }
    });

    cv.addEventListener('pointermove', function (e) {
      if (!self.pointers.has(e.pointerId)) return;
      var p = pos(e);
      self.pointers.set(e.pointerId, p);

      if (self.pointers.size >= 2 && self.pinch) {
        var pts = Array.from(self.pointers.values());
        var dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        var L = self._layout();
        var ratio = self.pinch.dist / Math.max(1, dist);
        var span = (self.drag.start.end - self.drag.start.start) * ratio;
        span = clamp(span, 14, Math.max(14, self.candles.length));
        var midIdx = self._iOfX(self.pinch.mid, L);
        var newStart = midIdx - (midIdx - self.drag.start.start) * (span / Math.max(1, (self.drag.start.end - self.drag.start.start)));
        self.view.start = clamp(newStart, 0, Math.max(0, self.candles.length - span));
        self.view.end = self.view.start + span;
        self.view.bars = span;
        self.invalidate();
        return;
      }

      if (self.drag) {
        var dx = p.x - self.drag.x;
        self.drag.moved = Math.max(self.drag.moved, Math.abs(dx));
        if (Math.abs(dx) > 2) {
          var L2 = self._layout();
          var bw = self._barW(L2);
          var span2 = self.drag.start.end - self.drag.start.start;
          var delta = -dx / bw;
          var s = self.drag.start.start + delta;
          s = clamp(s, 0, Math.max(0, self.candles.length - span2));
          self.view.start = s;
          self.view.end = s + span2;
          self.cross = null;
          self.invalidate();
        }
      }
    });

    function endPointer(e) {
      var wasTap = self.drag && self.drag.moved < 8 && self.pointers.size === 1;
      self.pointers.delete(e.pointerId);
      if (self.pointers.size < 2) self.pinch = null;
      if (self.pointers.size === 0) self.drag = null;

      if (wasTap) {
        var now = Date.now();
        var p = pos(e);
        var L = self._layout();
        var rect = L.rects[0];
        if (p.x >= L.x0 && p.x <= L.x1 + 2) {
          if (self.cross && self.cross.x === p.x && self.cross.y === p.y) {
            self.cross = null;
          } else {
            self.cross = { x: p.x, y: p.y };
          }
          if (now - self.lastTap < 280 && Math.abs(p.x - (self.cross ? self.cross.x : 0)) < 30) {
            self.cross = null;
            self.resetView();
          }
          self.lastTap = now;
          self.invalidate();
          if (self.opts.onCrosshair) {
            var idx = Math.round(self._iOfX(p.x, L));
            self.opts.onCrosshair(self.candles[idx] || null, self.cross != null);
          }
        }
      }
    }
    cv.addEventListener('pointerup', endPointer);
    cv.addEventListener('pointercancel', endPointer);
  };

  window.Chart = Chart;
})();

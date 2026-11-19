/* ================= LET'S TALK PRO — INDICATOR ENGINE =================
   ~100 distinct formulas expanded to 500+ selectable studies.
   Pure ES2017, no dependencies. Exposes window.IND = { CATALOG, compute }. */
(function (global) {
  'use strict';

  var COL = ['#00E5FF', '#7CFF6B', '#FFB800', '#FF4D6D', '#B388FF', '#4DA3FF', '#FF8A3D', '#00FFA3', '#FF6BD6', '#E9F1FF'];
  var CATS = ['Trend', 'Momentum', 'Volatility', 'Volume', 'Channels', 'Structure', 'Statistical', 'Price'];

  /* ------------------------------ primitives ------------------------------ */
  function arr(n, v) { var a = new Array(n); for (var i = 0; i < n; i++) a[i] = v; return a; }
  function num(v) { return (v === null || v === undefined || !isFinite(v)) ? null : v; }

  function SMA(a, len) {
    var o = new Array(a.length), s = 0;
    for (var i = 0; i < a.length; i++) {
      s += a[i];
      if (i >= len) s -= a[i - len];
      o[i] = i >= len - 1 ? s / len : null;
    }
    return o;
  }
  function EMA(a, len) {
    var o = new Array(a.length), k = 2 / (len + 1), p = null, s = 0;
    for (var i = 0; i < a.length; i++) {
      if (i < len - 1) { s += a[i]; o[i] = null; continue; }
      if (p === null) { s += a[i]; p = s / len; } else { p = a[i] * k + p * (1 - k); }
      o[i] = p;
    }
    return o;
  }
  function RMA(a, len) {
    var o = new Array(a.length), k = 1 / len, p = null, s = 0;
    for (var i = 0; i < a.length; i++) {
      if (i < len - 1) { s += a[i]; o[i] = null; continue; }
      if (p === null) { s += a[i]; p = s / len; } else { p = a[i] * k + p * (1 - k); }
      o[i] = p;
    }
    return o;
  }
  function WMA(a, len) {
    var o = new Array(a.length), den = len * (len + 1) / 2;
    for (var i = 0; i < a.length; i++) {
      if (i < len - 1) { o[i] = null; continue; }
      var s = 0;
      for (var j = 0; j < len; j++) s += a[i - j] * (len - j);
      o[i] = s / den;
    }
    return o;
  }
  function HMA(a, len) {
    var half = Math.max(2, Math.round(len / 2)), sq = Math.max(1, Math.round(Math.sqrt(len)));
    var w1 = WMA(a, half), w2 = WMA(a, len), d = new Array(a.length);
    for (var i = 0; i < a.length; i++) d[i] = (w1[i] === null || w2[i] === null) ? null : 2 * w1[i] - w2[i];
    var out = new Array(a.length);
    for (i = 0; i < a.length; i++) {
      if (i < sq - 1) { out[i] = null; continue; }
      var s = 0, ok = true;
      for (var j = 0; j < sq; j++) { if (d[i - j] === null) { ok = false; break; } s += d[i - j] * (sq - j); }
      out[i] = ok ? s / (sq * (sq + 1) / 2) : null;
    }
    return out;
  }
  function STDEV(a, len, mean) {
    var o = new Array(a.length);
    for (var i = 0; i < a.length; i++) {
      if (i < len - 1 || mean[i] === null) { o[i] = null; continue; }
      var s = 0;
      for (var j = 0; j < len; j++) { var d = a[i - j] - mean[i]; s += d * d; }
      o[i] = Math.sqrt(s / len);
    }
    return o;
  }
  function HH(a, len) {
    var o = new Array(a.length);
    for (var i = 0; i < a.length; i++) {
      if (i < len - 1) { o[i] = null; continue; }
      var m = -Infinity;
      for (var j = 0; j < len; j++) if (a[i - j] > m) m = a[i - j];
      o[i] = m;
    }
    return o;
  }
  function LL(a, len) {
    var o = new Array(a.length);
    for (var i = 0; i < a.length; i++) {
      if (i < len - 1) { o[i] = null; continue; }
      var m = Infinity;
      for (var j = 0; j < len; j++) if (a[i - j] < m) m = a[i - j];
      o[i] = m;
    }
    return o;
  }
  function SUM(a, len) {
    var o = new Array(a.length), s = 0;
    for (var i = 0; i < a.length; i++) {
      s += a[i];
      if (i >= len) s -= a[i - len];
      o[i] = i >= len - 1 ? s : null;
    }
    return o;
  }
  function shiftFwd(a, k) {
    var o = arr(a.length, null);
    for (var i = 0; i + k < a.length; i++) o[i + k] = a[i] === undefined ? null : a[i];
    return o;
  }
  function shiftBack(a, k) {
    var o = arr(a.length, null);
    for (var i = k; i < a.length; i++) o[i - k] = a[i] === undefined ? null : a[i];
    return o;
  }
  function pct(a, b) { return a === null || b === null || b === 0 ? null : (a / b) * 100; }

  /* -------------------------------- context -------------------------------- */
  function ctxOf(k) {
    var n = k.length, o = new Array(n), h = new Array(n), l = new Array(n), c = new Array(n), v = new Array(n);
    var tp = new Array(n), hl2 = new Array(n), hlc3 = new Array(n), ohlc4 = new Array(n);
    for (var i = 0; i < n; i++) {
      o[i] = +k[i].o; h[i] = +k[i].h; l[i] = +k[i].l; c[i] = +k[i].c; v[i] = +k[i].v;
      tp[i] = (h[i] + l[i] + c[i]) / 3;
      hl2[i] = (h[i] + l[i]) / 2;
      hlc3[i] = (h[i] + l[i] + c[i]) / 3;
      ohlc4[i] = (o[i] + h[i] + l[i] + c[i]) / 4;
    }
    return { n: n, o: o, h: h, l: l, c: c, v: v, tp: tp, hl2: hl2, hlc3: hlc3, ohlc4: ohlc4 };
  }
  function TR(x) {
    var o = new Array(x.n);
    for (var i = 0; i < x.n; i++) {
      if (i === 0) { o[i] = x.h[i] - x.l[i]; continue; }
      o[i] = Math.max(x.h[i] - x.l[i], Math.abs(x.h[i] - x.c[i - 1]), Math.abs(x.l[i] - x.c[i - 1]));
    }
    return o;
  }
  function ATR(x, len) { return RMA(TR(x), len); }

  /* ------------------------------- formulas ------------------------------- */
  function DEMAf(a, len) {
    var e1 = EMA(a, len), e2 = EMA(e1.map(function (v) { return v === null ? 0 : v; }), len);
    return a.map(function (_, i) { return (e1[i] === null || e2[i] === null) ? null : 2 * e1[i] - e2[i]; });
  }
  function TEMAf(a, len) {
    var e1 = EMA(a, len), e2 = EMA(fill(e1), len), e3 = EMA(fill(e2), len);
    return a.map(function (_, i) { return (e1[i] === null || e3[i] === null) ? null : 3 * e1[i] - 3 * e2[i] + e3[i]; });
  }
  function fill(a) { return a.map(function (v) { return v === null ? 0 : v; }); }

  function ZLEMAf(a, len) {
    var lag = Math.round((len - 1) / 2), d = new Array(a.length);
    for (var i = 0; i < a.length; i++) d[i] = i < lag ? a[i] : a[i] + (a[i] - a[i - lag]);
    return EMA(d, len);
  }
  function KAMAf(a, len) {
    var o = new Array(a.length), kFast = 2 / 3, kSlow = 2 / 31, prev = null;
    for (var i = 0; i < a.length; i++) {
      if (i < len) { o[i] = null; if (i === len - 1) prev = a[i]; continue; }
      var chg = Math.abs(a[i] - a[i - len]), vol = 0;
      for (var j = 0; j < len; j++) vol += Math.abs(a[i - j] - a[i - j - 1]);
      var er = vol === 0 ? 0 : chg / vol;
      var sc = Math.pow(er * (kFast - kSlow) + kSlow, 2);
      prev = prev + sc * (a[i] - prev);
      o[i] = prev;
    }
    return o;
  }
  function ALMAf(a, len) {
    var m = 0.85, s = len / 4, w = new Array(len), sum = 0, i, j;
    for (i = 0; i < len; i++) {
      var d = i - m * (len - 1);
      w[i] = Math.exp(-(d * d) / (2 * s * s));
      sum += w[i];
    }
    var o = new Array(a.length);
    for (i = 0; i < a.length; i++) {
      if (i < len - 1) { o[i] = null; continue; }
      var acc = 0;
      for (j = 0; j < len; j++) acc += a[i - len + 1 + j] * w[j];
      o[i] = acc / sum;
    }
    return o;
  }
  function T3f(a, len) {
    var a1 = 0.7;
    var e1 = EMA(a, len), e2 = EMA(fill(e1), len), e3 = EMA(fill(e2), len),
      e4 = EMA(fill(e3), len), e5 = EMA(fill(e4), len), e6 = EMA(fill(e5), len);
    var c1 = -Math.pow(a1, 3), c2 = 3 * a1 * a1 + 3 * Math.pow(a1, 3),
      c3 = -6 * a1 * a1 - 3 * a1 - 3 * Math.pow(a1, 3), c4 = 1 + 3 * a1 + 3 * a1 * a1 + Math.pow(a1, 3);
    return a.map(function (_, i) {
      if (e6[i] === null) return null;
      return c1 * e6[i] + c2 * e5[i] + c3 * e4[i] + c4 * e3[i];
    });
  }
  function VIDYAf(a, len) {
    var k = 2 / (len + 1), o = new Array(a.length), prev = null;
    for (var i = 0; i < a.length; i++) {
      if (i < len) { o[i] = null; if (i === len - 1) prev = a[i]; continue; }
      var up = 0, dn = 0;
      for (var j = 0; j < len; j++) {
        var d = a[i - j] - a[i - j - 1];
        if (d > 0) up += d; else dn -= d;
      }
      var cmo = (up + dn) === 0 ? 0 : Math.abs((up - dn) / (up + dn));
      var alpha = k * cmo;
      prev = prev + alpha * (a[i] - prev);
      o[i] = prev;
    }
    return o;
  }
  function VWMAf(x, len) {
    var pv = new Array(x.n);
    for (var i = 0; i < x.n; i++) pv[i] = x.c[i] * x.v[i];
    var a = SMA(pv, len), b = SMA(x.v, len);
    return a.map(function (v, i) { return (v === null || !b[i]) ? null : v / b[i]; });
  }
  function MCGINLEYf(a, len) {
    var o = new Array(a.length), k = 0.6, prev = null;
    for (var i = 0; i < a.length; i++) {
      if (prev === null) { prev = a[i]; o[i] = null; continue; }
      var r = a[i] / prev;
      if (!isFinite(r) || r <= 0) { o[i] = prev; continue; }
      prev = prev + (a[i] - prev) / (k * len * Math.pow(r, 4));
      o[i] = prev;
    }
    return o;
  }
  function LINREG(a, len) {
    var slope = new Array(a.length), out = new Array(a.length), inter = new Array(a.length);
    for (var i = 0; i < a.length; i++) {
      if (i < len - 1) { slope[i] = null; out[i] = null; inter[i] = null; continue; }
      var sx = 0, sy = 0, sxy = 0, sxx = 0;
      for (var j = 0; j < len; j++) { var xv = j, yv = a[i - len + 1 + j]; sx += xv; sy += yv; sxy += xv * yv; sxx += xv * xv; }
      var d = len * sxx - sx * sx;
      var m = d === 0 ? 0 : (len * sxy - sx * sy) / d;
      var b = (sy - m * sx) / len;
      slope[i] = m; inter[i] = b; out[i] = m * (len - 1) + b;
    }
    out.slope = slope; out.inter = inter;
    return out;
  }
  function SUPERTREND(x, len, mult) {
    var atr = ATR(x, len), o = new Array(x.n), fu = null, fl = null, dir = 1;
    for (var i = 0; i < x.n; i++) {
      if (atr[i] === null) { o[i] = null; continue; }
      var mid = (x.h[i] + x.l[i]) / 2, bu = mid + mult * atr[i], bl = mid - mult * atr[i];
      if (fu === null) { fu = bu; fl = bl; }
      else {
        fu = (x.c[i - 1] <= fu) ? Math.min(bu, fu) : bu;
        fl = (x.c[i - 1] >= fl) ? Math.max(bl, fl) : bl;
      }
      if (dir === 1 && x.c[i] < fl) dir = -1;
      else if (dir === -1 && x.c[i] > fu) dir = 1;
      o[i] = dir === 1 ? fl : fu;
    }
    return o;
  }
  function PSAR(x, step, max) {
    var o = new Array(x.n), up = x.h[0], dn = x.l[0], bull = true, af = step;
    o[0] = dn;
    for (var i = 1; i < x.n; i++) {
      var p = o[i - 1];
      p = p + af * ((bull ? up : dn) - p);
      if (bull) {
        if (x.l[i] < p) { bull = false; p = up; af = step; }
        else { if (x.h[i] > up) { up = x.h[i]; af = Math.min(max, af + step); } }
      } else {
        if (x.h[i] > p) { bull = true; p = dn; af = step; }
        else { if (x.l[i] < dn) { dn = x.l[i]; af = Math.min(max, af + step); } }
      }
      o[i] = p;
    }
    return o;
  }
  function ICHIMOKU(x) {
    var t = new Array(x.n), k = new Array(x.n), sa = new Array(x.n), sb = new Array(x.n), ch = new Array(x.n);
    var h9 = HH(x.h, 9), l9 = LL(x.l, 9), h26 = HH(x.h, 26), l26 = LL(x.l, 26), h52 = HH(x.h, 52), l52 = LL(x.l, 52);
    for (var i = 0; i < x.n; i++) {
      t[i] = (h9[i] === null || l9[i] === null) ? null : (h9[i] + l9[i]) / 2;
      k[i] = (h26[i] === null || l26[i] === null) ? null : (h26[i] + l26[i]) / 2;
      sa[i] = (t[i] === null || k[i] === null) ? null : (t[i] + k[i]) / 2;
      sb[i] = (h52[i] === null || l52[i] === null) ? null : (h52[i] + l52[i]) / 2;
      ch[i] = x.c[i];
    }
    return [t, k, shiftFwd(sa, 26), shiftFwd(sb, 26), shiftBack(ch, 26)];
  }
  function CHANDELIER(x, len, mult) {
    var atr = ATR(x, len), hh = HH(x.h, len), ll = LL(x.l, len), o = new Array(x.n);
    for (var i = 0; i < x.n; i++) o[i] = (atr[i] === null || hh[i] === null) ? null : hh[i] - mult * atr[i];
    return o;
  }
  function ATRSTOP(x, len, mult) {
    var atr = ATR(x, len), o = new Array(x.n), stop = null, dir = 1;
    for (var i = 0; i < x.n; i++) {
      if (atr[i] === null) { o[i] = null; continue; }
      if (stop === null) { stop = x.c[i] - mult * atr[i]; }
      else {
        if (dir === 1) {
          stop = Math.max(stop, x.c[i] - mult * atr[i]);
          if (x.c[i] < stop) { dir = -1; stop = x.c[i] + mult * atr[i]; }
        } else {
          stop = Math.min(stop, x.c[i] + mult * atr[i]);
          if (x.c[i] > stop) { dir = 1; stop = x.c[i] - mult * atr[i]; }
        }
      }
      o[i] = stop;
    }
    return o;
  }
  function ALLIGATOR(x) {
    var med = x.hl2;
    var jaw = SMMA(med, 13), teeth = SMMA(med, 8), lips = SMMA(med, 5);
    return [shiftFwd(jaw, 8), shiftFwd(teeth, 5), shiftFwd(lips, 3)];
  }
  function SMMA(a, len) {
    var o = new Array(a.length), s = null;
    for (var i = 0; i < a.length; i++) {
      if (i < len - 1) { o[i] = null; continue; }
      if (s === null) { var t = 0; for (var j = 0; j < len; j++) t += a[i - j]; s = t / len; }
      else s = (s * (len - 1) + a[i]) / len;
      o[i] = s;
    }
    return o;
  }
  function VWAP(x) {
    var o = new Array(x.n), cumPV = 0, cumV = 0, day = -1, prev = null;
    for (var i = 0; i < x.n; i++) {
      var d = Math.floor((x.t ? x.t[i] : 0) / 864e5);
      if (d !== day) { cumPV = 0; cumV = 0; day = d; }
      cumPV += x.tp[i] * x.v[i]; cumV += x.v[i];
      var val = cumV === 0 ? prev : cumPV / cumV;
      prev = val; o[i] = val;
    }
    return o;
  }
  function PIVOTS(x, mode) {
    var p = new Array(x.n), r = new Array(x.n), s = new Array(x.n);
    for (var i = 0; i < x.n; i++) {
      if (i === 0) { p[i] = null; r[i] = null; s[i] = null; continue; }
      var H = x.h[i - 1], L = x.l[i - 1], C = x.c[i - 1];
      var mid;
      if (mode === 'woodie') mid = (H + L + 2 * C) / 4;
      else mid = (H + L + C) / 3;
      p[i] = mid;
      if (mode === 'camarilla') { r[i] = C + (H - L) * 1.1 / 4; s[i] = C - (H - L) * 1.1 / 4; }
      else if (mode === 'fib') { r[i] = mid + 0.382 * (H - L); s[i] = mid - 0.382 * (H - L); }
      else { r[i] = 2 * mid - L; s[i] = 2 * mid - H; }
    }
    return [p, r, s];
  }
  function FRACTALS(x, k) {
    var o = new Array(x.n);
    for (var i = 0; i < x.n; i++) {
      o[i] = null;
      if (i < k * 2) continue;
      var isHigh = true, isLow = true;
      for (var j = 1; j <= k; j++) {
        if (x.h[i - j] >= x.h[i] || x.h[i + 0] < x.h[i - j]) { /* noop */ }
        if (x.h[i] <= x.h[i - j] || x.h[i] <= x.h[i + j]) isHigh = false;
        if (x.l[i] >= x.l[i - j] || x.l[i] >= x.l[i + j]) isLow = false;
      }
      o[i] = isHigh ? x.h[i] : (isLow ? x.l[i] : null);
    }
    return o;
  }
  function ZIGZAG(x, sens) {
    var n = x.n, atrV = 0, i;
    for (i = 1; i < n; i++) atrV += Math.abs(x.c[i] - x.c[i - 1]);
    atrV = n > 1 ? atrV / (n - 1) : 0;
    var pctTh = x.c[0] ? Math.max(1e-9, atrV / Math.abs(x.c[0]) * 100 * sens * 2) : 0;
    var piv = [], pivV = [], hi = x.c[0], lo = x.c[0], hiI = 0, loI = 0, dir = 0, last = x.c[0];
    for (i = 1; i < n; i++) {
      var ch = (x.c[i] - last) / last * 100;
      if (dir >= 0 && ch <= -pctTh) { piv.push(hiI); pivV.push(hi); dir = -1; last = x.c[i]; lo = x.c[i]; loI = i; }
      else if (dir <= 0 && ch >= pctTh) { piv.push(loI); pivV.push(lo); dir = 1; last = x.c[i]; hi = x.c[i]; hiI = i; }
      if (x.c[i] >= hi) { hi = x.c[i]; hiI = i; }
      if (x.c[i] <= lo) { lo = x.c[i]; loI = i; }
    }
    var o = new Array(n);
    for (i = 0; i < n; i++) o[i] = null;
    if (!piv.length) { for (i = 0; i < n; i++) o[i] = x.c[i]; return o; }
    for (i = 0; i <= piv[0]; i++) o[i] = pivV[0];    for (var k = 1; k < piv.length; k++) {
      var ia = piv[k - 1], ib = piv[k], va = pivV[k - 1], vb = pivV[k];
      for (i = ia; i <= ib; i++) o[i] = ia === ib ? va : va + (vb - va) * (i - ia) / (ib - ia);
    }
    for (i = piv[piv.length - 1]; i < n; i++) o[i] = pivV[pivV.length - 1];
    return o;
  }
  function PRIORDAY(x) {
    var hi = new Array(x.n), lo = new Array(x.n), dayHi = null, dayLo = null, prevHi = null, prevLo = null, day = -1;
    for (var i = 0; i < x.n; i++) {
      var d = Math.floor((x.t ? x.t[i] : 0) / 864e5);
      if (d !== day) { prevHi = dayHi; prevLo = dayLo; dayHi = x.h[i]; dayLo = x.l[i]; day = d; }
      else { dayHi = Math.max(dayHi, x.h[i]); dayLo = Math.min(dayLo, x.l[i]); }
      hi[i] = prevHi; lo[i] = prevLo;
    }
    return [hi, lo];
  }
  function RSI(vals, len) {
    var o = new Array(vals.length), up = null, dn = null, k = 1 / len;
    for (var i = 0; i < vals.length; i++) {
      if (i < len) { o[i] = null; continue; }
      var d = vals[i] - vals[i - 1], u = d > 0 ? d : 0, w = d < 0 ? -d : 0;
      if (up === null) {
        var su = 0, sd = 0;
        for (var j = 1; j <= len; j++) { var dd = vals[j] - vals[j - 1]; su += dd > 0 ? dd : 0; sd += dd < 0 ? -dd : 0; }
        up = su / len; dn = sd / len;
      } else { up = up * (1 - k) + u * k; dn = dn * (1 - k) + w * k; }
      o[i] = dn === 0 ? 100 : 100 - 100 / (1 + up / dn);
    }
    return o;
  }
  function STOCH(x, len) {
    var hh = HH(x.h, len), ll = LL(x.l, len), k = new Array(x.n);
    for (var i = 0; i < x.n; i++) {
      var r = (hh[i] === null || hh[i] === ll[i]) ? null : (x.c[i] - ll[i]) / (hh[i] - ll[i]) * 100;
      k[i] = r;
    }
    var d = SMA(fill(k), 3);
    return [k, k.map(function (v, i) { return i < 2 ? null : d[i]; })];
  }
  function MACDf(a, f, s, sig) {
    var ef = EMA(a, f), es = EMA(a, s), m = new Array(a.length);
    for (var i = 0; i < a.length; i++) m[i] = (ef[i] === null || es[i] === null) ? null : ef[i] - es[i];
    var signal = EMA(fill(m), sig), h = new Array(a.length);
    for (i = 0; i < a.length; i++) h[i] = (m[i] === null || signal[i] === null) ? null : m[i] - signal[i];
    return [m, signal, h];
  }
  function CCI(x, len) {
    var m = SMA(x.tp, len), o = new Array(x.n);
    for (var i = 0; i < x.n; i++) {
      if (m[i] === null) { o[i] = null; continue; }
      var dev = 0;
      for (var j = 0; j < len; j++) dev += Math.abs(x.tp[i - j] - m[i]);
      dev /= len;
      o[i] = dev === 0 ? 0 : (x.tp[i] - m[i]) / (0.015 * dev);
    }
    return o;
  }
  function WILLR(x, len) {
    var hh = HH(x.h, len), ll = LL(x.l, len), o = new Array(x.n);
    for (var i = 0; i < x.n; i++) o[i] = (hh[i] === null || hh[i] === ll[i]) ? null : (hh[i] - x.c[i]) / (hh[i] - ll[i]) * -100;
    return o;
  }
  function AO(x) {
    var a = SMA(x.hl2, 5), b = SMA(x.hl2, 34), o = new Array(x.n);
    for (var i = 0; i < x.n; i++) o[i] = (a[i] === null || b[i] === null) ? null : a[i] - b[i];
    return [o];
  }
  function ROC(vals, len) {
    var o = new Array(vals.length);
    for (var i = 0; i < vals.length; i++) o[i] = i < len || !vals[i - len] ? null : ((vals[i] - vals[i - len]) / vals[i - len]) * 100;
    return o;
  }
  function TSI(vals, long, short) {
    var m = new Array(vals.length);
    for (var i = 0; i < vals.length; i++) m[i] = i === 0 ? 0 : vals[i] - vals[i - 1];
    var e1 = EMA(m, long), e2 = EMA(fill(e1), short);
    var a1 = EMA(m.map(Math.abs), long), a2 = EMA(fill(a1), short);
    return vals.map(function (_, i) { return (e2[i] === null || !a2[i]) ? null : (e2[i] / a2[i]) * 100; });
  }
  function UO(x, l1, l2, l3) {
    var bp = new Array(x.n), tr = TR(x);
    for (var i = 0; i < x.n; i++) {
      bp[i] = i === 0 ? 0 : x.c[i] - Math.min(x.l[i], x.c[i - 1]);
      if (tr[i] === 0) tr[i] = 1e-9;
    }
    var a1 = SUM(bp, l1), b1 = SUM(tr, l1), a2 = SUM(bp, l2), b2 = SUM(tr, l2), a3 = SUM(bp, l3), b3 = SUM(tr, l3);
    return x.c.map(function (_, i) {
      if (a3[i] === null || !b1[i] || !b2[i] || !b3[i]) return null;
      return 100 * (4 * (a1[i] / b1[i]) + 2 * (a2[i] / b2[i]) + (a3[i] / b3[i])) / 7;
    });
  }
  function SMI(x, len, smooth) {
    var hh = HH(x.h, len), ll = LL(x.l, len), m = new Array(x.n);
    for (var i = 0; i < x.n; i++) {
      var mid = hh[i] === null ? null : (hh[i] + ll[i]) / 2;
      var rng = hh[i] === null ? null : (hh[i] - ll[i]) / 2;
      m[i] = (mid === null || !rng) ? null : (x.c[i] - mid) / rng * 100;
    }
    var s1 = EMA(fill(m), smooth), s2 = EMA(fill(s1), smooth);
    return [m.map(function (v, i) { return i < smooth * 2 ? null : s2[i]; })];
  }
  function CMO(vals, len) {
    var o = new Array(vals.length);
    for (var i = 0; i < vals.length; i++) {
      if (i < len) { o[i] = null; continue; }
      var up = 0, dn = 0;
      for (var j = 0; j < len; j++) {
        var d = vals[i - j] - vals[i - j - 1];
        if (d > 0) up += d; else dn -= d;
      }
      o[i] = (up + dn) === 0 ? 0 : ((up - dn) / (up + dn)) * 100;
    }
    return o;
  }
  function FISHER(x, len) {
    var hh = HH(x.hl2, len), ll = LL(x.hl2, len), v = new Array(x.n), f = new Array(x.n), prev = 0;
    for (var i = 0; i < x.n; i++) {
      var r = (hh[i] === null || hh[i] === ll[i]) ? 0 : (x.hl2[i] - ll[i]) / (hh[i] - ll[i]);
      r = Math.min(0.999, Math.max(0.001, r));
      v[i] = 0.33 * 2 * (r - 0.5) + 0.67 * prev;
      v[i] = Math.min(0.999, Math.max(-0.999, v[i]));
      prev = v[i];
      f[i] = 0.5 * Math.log((1 + v[i]) / (1 - v[i]));
    }
    return [f];
  }
  function DPO(a, len) {
    var m = SMA(a, len), sh = Math.floor(len / 2) + 1, o = new Array(a.length);
    for (var i = 0; i < a.length; i++) {
      var src = i - sh;
      o[i] = (src < 0 || m[src] === null) ? null : a[src] - m[src];
    }
    return o;
  }
  function COPPOCK(a) {
    var r1 = ROC(a, 14), r2 = ROC(a, 11), s = new Array(a.length);
    for (var i = 0; i < a.length; i++) s[i] = (r1[i] === null || r2[i] === null) ? 0 : r1[i] + r2[i];
    return WMA(s, 10);
  }
  function KST(a) {
    var r1 = SMA(ROC(a, 10), 10), r2 = SMA(ROC(a, 15), 10), r3 = SMA(ROC(a, 20), 10), r4 = SMA(ROC(a, 30), 15);
    return a.map(function (_, i) {
      if (r4[i] === null) return null;
      return r1[i] * 1 + r2[i] * 2 + r3[i] * 3 + r4[i] * 4;
    });
  }
  function WAVETREND(x, chl, avg) {
    var esa = EMA(x.tp, chl), d = EMA(x.tp.map(function (v, i) { return Math.abs(v - (esa[i] === null ? v : esa[i])); }), chl);
    var ci = new Array(x.n);
    for (var i = 0; i < x.n; i++) ci[i] = (!d[i]) ? 0 : (x.tp[i] - esa[i]) / (0.015 * d[i]);
    var wt1 = EMA(ci, avg), wt2 = SMA(fill(wt1), 4);
    return [wt1, wt2];
  }
  function RVI(x, len) {
    var num = new Array(x.n), den = new Array(x.n);
    for (var i = 0; i < x.n; i++) { num[i] = x.c[i] - x.o[i]; den[i] = x.h[i] - x.l[i]; }
    var n1 = SMA(num, len), d1 = SMA(den, len), n2 = SMA(num, len * 2), d2 = SMA(den, len * 2);
    var a = x.c.map(function (_, i) { return (!d1[i]) ? null : n1[i] / d1[i]; });
    var b = x.c.map(function (_, i) { return (!d2[i]) ? null : n2[i] / d2[i]; });
    return [a, b];
  }
  function ELDER(x, len) {
    var e = EMA(x.c, len), bull = new Array(x.n), bear = new Array(x.n);
    for (var i = 0; i < x.n; i++) {
      bull[i] = e[i] === null ? null : x.h[i] - e[i];
      bear[i] = e[i] === null ? null : x.l[i] - e[i];
    }
    return [bull, bear];
  }
  function HISTVOL(a, len) {
    var r = new Array(a.length);
    for (var i = 0; i < a.length; i++) r[i] = i === 0 ? 0 : Math.log(a[i] / a[i - 1]);
    var s = STDEV(r, len, SMA(r, len));
    return s.map(function (v) { return v === null ? null : v * Math.sqrt(365) * 100; });
  }
  function ZSCORE(a, len) {
    var m = SMA(a, len), s = STDEV(a, len, m);
    return a.map(function (v, i) { return (s[i] === null || !s[i]) ? null : (v - m[i]) / s[i]; });
  }
  function CHOP(x, len) {
    var atr = SUM(TR(x), len), hh = HH(x.h, len), ll = LL(x.l, len), o = new Array(x.n);
    for (var i = 0; i < x.n; i++) {
      var rng = hh[i] === null ? null : hh[i] - ll[i];
      o[i] = (!rng || atr[i] === null) ? null : 100 * Math.log(atr[i] / rng) / Math.log(len);
    }
    return o;
  }
  function MASS(x) {
    var r = new Array(x.n);
    for (var i = 0; i < x.n; i++) r[i] = x.h[i] - x.l[i];
    var e1 = EMA(r, 9), e2 = EMA(fill(e1), 9), o = new Array(x.n);
    for (i = 0; i < x.n; i++) {
      if (i < 24) { o[i] = null; continue; }
      var s = 0, ok = true;
      for (var j = 0; j < 25; j++) { if (e1[i - j] === null || !e2[i - j]) { ok = false; break; } s += e1[i - j] / e2[i - j]; }
      o[i] = ok ? s : null;
    }
    return o;
  }
  function VORTEX(x, len) {
    var vmP = new Array(x.n), vmM = new Array(x.n);
    for (var i = 0; i < x.n; i++) {
      if (i === 0) { vmP[i] = 0; vmM[i] = 0; continue; }
      vmP[i] = Math.abs(x.h[i] - x.l[i - 1]);
      vmM[i] = Math.abs(x.l[i] - x.h[i - 1]);
    }
    var a = SUM(vmP, len), b = SUM(vmM, len), c = SUM(TR(x), len);
    return [x.c.map(function (_, i) { return (!c[i]) ? null : a[i] / c[i]; }),
    x.c.map(function (_, i) { return (!c[i]) ? null : b[i] / c[i]; })];
  }
  function ULCER(a, len) {
    var m = SMA(a, len), o = new Array(a.length);
    for (var i = 0; i < a.length; i++) {
      if (m[i] === null) { o[i] = null; continue; }
      var s = 0;
      for (var j = 0; j < len; j++) { var d = 100 * (a[i - j] - m[i]) / m[i]; if (d < 0) s += d * d; }
      o[i] = Math.sqrt(s / len);
    }
    return o;
  }
  function OBV(x) {
    var o = new Array(x.n), s = 0;
    for (var i = 0; i < x.n; i++) {
      if (i > 0) s += x.c[i] > x.c[i - 1] ? x.v[i] : (x.c[i] < x.c[i - 1] ? -x.v[i] : 0);
      o[i] = s;
    }
    return o;
  }
  function ADL(x) {
    var o = new Array(x.n), s = 0;
    for (var i = 0; i < x.n; i++) {
      var rng = x.h[i] - x.l[i];
      s += rng === 0 ? 0 : ((x.c[i] - x.l[i]) - (x.h[i] - x.c[i])) / rng * x.v[i];
      o[i] = s;
    }
    return o;
  }
  function CMF(x, len) {
    var mfv = new Array(x.n);
    for (var i = 0; i < x.n; i++) {
      var rng = x.h[i] - x.l[i];
      mfv[i] = rng === 0 ? 0 : ((x.c[i] - x.l[i]) - (x.h[i] - x.c[i])) / rng * x.v[i];
    }
    var a = SUM(mfv, len), b = SUM(x.v, len);
    return x.c.map(function (_, i) { return (!b[i]) ? null : a[i] / b[i]; });
  }
  function MFI(x, len) {
    var pos = new Array(x.n), neg = new Array(x.n);
    for (var i = 0; i < x.n; i++) {
      if (i === 0) { pos[i] = 0; neg[i] = 0; continue; }
      var f = x.tp[i] * x.v[i];
      pos[i] = x.tp[i] > x.tp[i - 1] ? f : 0;
      neg[i] = x.tp[i] < x.tp[i - 1] ? f : 0;
    }
    var a = SUM(pos, len), b = SUM(neg, len);
    return x.c.map(function (_, i) { return (a[i] === null) ? null : (b[i] === 0 ? 100 : 100 - 100 / (1 + a[i] / b[i])); });
  }
  function PVT(x) {
    var o = new Array(x.n), s = 0;
    for (var i = 0; i < x.n; i++) {
      if (i > 0 && x.c[i - 1]) s += x.v[i] * (x.c[i] - x.c[i - 1]) / x.c[i - 1];
      o[i] = s;
    }
    return o;
  }
  function FORCE(x, len) {
    var raw = new Array(x.n);
    for (var i = 0; i < x.n; i++) raw[i] = (x.c[i] - x.c[i - 1] || 0) * x.v[i];
    return EMA(raw, len);
  }
  function EOM(x, len) {
    var d = new Array(x.n), b = new Array(x.n);
    for (var i = 0; i < x.n; i++) {
      d[i] = x.hl2[i] - (i ? x.hl2[i - 1] : x.hl2[i]);
      b[i] = x.v[i] / (x.h[i] - x.l[i] || 1);
      d[i] = b[i] === 0 ? 0 : d[i] / b[i];
    }
    return SMA(d, len);
  }
  function NVIpvi(x, nvi) {
    var o = new Array(x.n), v = 1000;
    for (var i = 0; i < x.n; i++) {
      if (i > 0 && x.v[i] < x.v[i - 1]) v = nvi ? v * (1 + (x.c[i] - x.c[i - 1]) / x.c[i - 1]) : v;
      if (i > 0 && x.v[i] > x.v[i - 1]) v = nvi ? v : v * (1 + (x.c[i] - x.c[i - 1]) / x.c[i - 1]);
      o[i] = v;
    }
    return o;
  }
  function VOLRATIO(x, len) {
    var m = SMA(x.v, len);
    return x.v.map(function (v, i) { return (!m[i]) ? null : v / m[i]; });
  }
  function CORR(a, b, len) {
    var o = new Array(a.length);
    for (var i = 0; i < a.length; i++) {
      if (i < len - 1) { o[i] = null; continue; }
      var sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
      for (var j = 0; j < len; j++) {
        var xv = a[i - j], yv = b[i - j];
        sa += xv; sb += yv; saa += xv * xv; sbb += yv * yv; sab += xv * yv;
      }
      var d = Math.sqrt((len * saa - sa * sa) * (len * sbb - sb * sb));
      o[i] = d === 0 ? null : (len * sab - sa * sb) / d;
    }
    return o;
  }
  function SKEW(a, len) {
    var o = new Array(a.length);
    for (var i = 0; i < a.length; i++) {
      if (i < len - 1) { o[i] = null; continue; }
      var s = 0, s2 = 0, s3 = 0;
      for (var j = 0; j < len; j++) { var v = a[i - j]; s += v; s2 += v * v; s3 += v * v * v; }
      var m = s / len, sd = Math.sqrt(Math.max(0, s2 / len - m * m));
      o[i] = sd === 0 ? null : (s3 / len - 3 * m * s2 / len + 2 * m * m * m) / Math.pow(sd, 3);
    }
    return o;
  }
  function KURT(a, len) {
    var o = new Array(a.length);
    for (var i = 0; i < a.length; i++) {
      if (i < len - 1) { o[i] = null; continue; }
      var s = 0, s2 = 0, s4 = 0;
      for (var j = 0; j < len; j++) { var v = a[i - j]; s += v; s2 += v * v; s4 += Math.pow(v, 4); }
      var m = s / len, varr = s2 / len - m * m;
      o[i] = varr <= 0 ? null : s4 / len / (varr * varr) - 3;
    }
    return o;
  }
  function AUTOCORR(a, len) {
    var r = new Array(a.length);
    for (var i = 0; i < a.length; i++) r[i] = i === 0 ? 0 : a[i] - a[i - 1];
    var o = new Array(a.length);
    for (i = 0; i < a.length; i++) {
      if (i < len + 1) { o[i] = null; continue; }
      var n = 0, d = 0;
      for (var j = 0; j < len; j++) { n += r[i - j] * r[i - j - 1]; d += r[i - j] * r[i - j]; }
      o[i] = d === 0 ? null : n / d;
    }
    return o;
  }
  function VRATIO(a, len) {
    var o = new Array(a.length);
    for (var i = 0; i < a.length; i++) {
      if (i < len * 2) { o[i] = null; continue; }
      var v1 = 0, vk = 0;
      for (var j = 0; j < len; j++) { var d1 = a[i - j] - a[i - j - 1]; v1 += d1 * d1; }
      for (j = 0; j < len; j += 2) { var d2 = a[i - j] - a[i - j - 2]; vk += d2 * d2; }
      o[i] = vk === 0 ? null : v1 / vk;
    }
    return o;
  }
  function ENTROPY(a, len) {
    var o = new Array(a.length), bins = 8;
    for (var i = 0; i < a.length; i++) {
      if (i < len - 1) { o[i] = null; continue; }
      var mn = Infinity, mx = -Infinity, j;
      for (j = 0; j < len; j++) { var v = a[i - j]; if (v < mn) mn = v; if (v > mx) mx = v; }
      if (mx === mn) { o[i] = 0; continue; }
      var cnt = arr(bins, 0);
      for (j = 0; j < len; j++) {
        var b = Math.min(bins - 1, Math.floor((a[i - j] - mn) / (mx - mn) * bins));
        cnt[b]++;
      }
      var e = 0;
      for (j = 0; j < bins; j++) { if (cnt[j]) { var p = cnt[j] / len; e -= p * Math.log(p); } }
      o[i] = e / Math.log(bins) * 100;
    }
    return o;
  }
  function HURST(a, len) {
    var o = new Array(a.length);
    for (var i = 0; i < a.length; i++) {
      if (i < len) { o[i] = null; continue; }
      var mn = Infinity, mx = -Infinity, j;
      for (j = 0; j < len; j++) { var v = a[i - j]; if (v < mn) mn = v; if (v > mx) mx = v; }
      var m = SMA(a, len)[i];
      var s = 0;
      for (j = 0; j < len; j++) { var d = a[i - j] - m; s += d * d; }
      var sd = Math.sqrt(s / len);
      o[i] = (!sd || mx === mn) ? null : Math.log((mx - mn) / sd) / Math.log(len);
    }
    return o;
  }

  /* ------------------------------- registry ------------------------------- */
  var SPEC = {}, ORDER = [];

  function def(base, name, short, cat, pane, lens, plots, f) {
    SPEC[base] = { base: base, name: name, short: short, cat: cat, pane: pane, lens: lens, plots: plots, f: f };
    ORDER.push(base);
  }

  // ------- Trend / price overlays -------
  def('sma', 'SMA', 'SMA', 'Trend', 'price', [5, 10, 20, 50, 100, 200], [{ type: 'line' }], function (x, l) { return [SMA(x.c, l)]; });
  def('ema', 'EMA', 'EMA', 'Trend', 'price', [5, 9, 21, 50, 100, 200], [{ type: 'line' }], function (x, l) { return [EMA(x.c, l)]; });
  def('wma', 'WMA', 'WMA', 'Trend', 'price', [10, 20, 30, 50, 100], [{ type: 'line' }], function (x, l) { return [WMA(x.c, l)]; });
  def('hma', 'Hull MA', 'HMA', 'Trend', 'price', [9, 16, 21, 49, 55], [{ type: 'line' }], function (x, l) { return [HMA(x.c, l)]; });
  def('dema', 'DEMA', 'DEMA', 'Trend', 'price', [9, 14, 21, 50], [{ type: 'line' }], function (x, l) { return [DEMAf(x.c, l)]; });
  def('tema', 'TEMA', 'TEMA', 'Trend', 'price', [9, 14, 21, 50], [{ type: 'line' }], function (x, l) { return [TEMAf(x.c, l)]; });
  def('zlema', 'ZLEMA', 'ZLEMA', 'Trend', 'price', [10, 20, 50, 100], [{ type: 'line' }], function (x, l) { return [ZLEMAf(x.c, l)]; });
  def('kama', 'KAMA', 'KAMA', 'Trend', 'price', [10, 14, 20, 30], [{ type: 'line' }], function (x, l) { return [KAMAf(x.c, l)]; });
  def('alma', 'ALMA', 'ALMA', 'Trend', 'price', [9, 20, 30, 50], [{ type: 'line' }], function (x, l) { return [ALMAf(x.c, l)]; });
  def('t3', 'T3', 'T3', 'Trend', 'price', [8, 10, 14, 20], [{ type: 'line' }], function (x, l) { return [T3f(x.c, l)]; });
  def('vidya', 'VIDYA', 'VIDYA', 'Trend', 'price', [10, 14, 20, 30], [{ type: 'line' }], function (x, l) { return [VIDYAf(x.c, l)]; });
  def('vwma', 'VWMA', 'VWMA', 'Trend', 'price', [10, 20, 50], [{ type: 'line' }], function (x, l) { return [VWMAf(x, l)]; });
  def('mcginley', 'McGinley', 'MCG', 'Trend', 'price', [10, 14, 20, 30], [{ type: 'line' }], function (x, l) { return [MCGINLEYf(x.c, l)]; });
  def('lsma', 'LSMA', 'LSMA', 'Trend', 'price', [11, 25, 50, 100], [{ type: 'line' }], function (x, l) { return [LINREG(x.c, l)]; });
  def('supertrend', 'SuperTrend', 'ST', 'Trend', 'price', [7, 10, 14, 20], [{ type: 'line' }], function (x, l) {
    return [SUPERTREND(x, l, l >= 20 ? 3 : 2)];
  });
  def('psar', 'Parabolic SAR', 'PSAR', 'Trend', 'price', [14, 20, 30], [{ type: 'line' }], function (x) { return [PSAR(x, 0.02, 0.2)]; });
  def('ichimoku', 'Ichimoku', 'ICHI', 'Trend', 'price', [9, 26],
    [{ type: 'line', lab: 'Tenkan' }, { type: 'line', lab: 'Kijun' }, { type: 'line', lab: 'SpanA' }, { type: 'line', lab: 'SpanB' }, { type: 'line', lab: 'Chikou' }],
    function (x) { return ICHIMOKU(x); });
  def('chandelier', 'Chandelier Exit', 'CHEX', 'Trend', 'price', [10, 14, 22], [{ type: 'line' }], function (x, l) { return [CHANDELIER(x, l, 3)]; });
  def('atrstop', 'ATR Stop', 'ATRS', 'Trend', 'price', [10, 14, 22], [{ type: 'line' }], function (x, l) { return [ATRSTOP(x, l, 3)]; });
  def('alligator', 'Alligator', 'ALG', 'Trend', 'price', [13],
    [{ type: 'line', lab: 'Jaw' }, { type: 'line', lab: 'Teeth' }, { type: 'line', lab: 'Lips' }],
    function (x) { return ALLIGATOR(x); });
  def('guppy', 'Guppy MMA', 'GUPPY', 'Trend', 'price', [3, 6, 12, 24],
    [{ type: 'line', lab: 'Fast' }, { type: 'line', lab: 'Mid' }, { type: 'line', lab: 'Slow' }, { type: 'line', lab: 'Base' }],
    function (x, l) { return [EMA(x.c, l), EMA(x.c, l * 2), EMA(x.c, l * 4), EMA(x.c, l * 8)]; });
  def('maenv', 'MA Envelope', 'ENV', 'Channels', 'price', [10, 20, 50],
    [{ type: 'band' }], function (x, l) {
      var m = SMA(x.c, l);
      return [m.map(function (v) { return v === null ? null : [v * 0.98, v * 1.02]; })];
    });
  def('vwap', 'VWAP', 'VWAP', 'Trend', 'price', [1], [{ type: 'line' }], function (x) { return [VWAP(x)]; });
  def('vwapbands', 'VWAP Bands', 'VWB', 'Channels', 'price', [1],
    [{ type: 'band' }], function (x) {
      var v = VWAP(x), d = STDEV(x.tp, 20, SMA(x.tp, 20));
      return [v.map(function (m, i) { return d[i] === null ? null : [m - d[i], m + d[i]]; })];
    });
  def('keltner', 'Keltner', 'KC', 'Channels', 'price', [14, 20, 30],
    [{ type: 'band' }], function (x, l) {
      var m = EMA(x.c, l), a = ATR(x, l);
      return [m.map(function (v, i) { return (v === null || a[i] === null) ? null : [v - 2 * a[i], v + 2 * a[i]]; })];
    });
  def('bb', 'Bollinger', 'BB', 'Channels', 'price', [10, 20, 30, 50],
    [{ type: 'band' }], function (x, l) {
      var m = SMA(x.c, l), s = STDEV(x.c, l, m);
      return [m.map(function (v, i) { return (v === null || s[i] === null) ? null : [v - 2 * s[i], v + 2 * s[i]]; })];
    });
  def('starc', 'STARC', 'STARC', 'Channels', 'price', [15, 20, 30],
    [{ type: 'band' }], function (x, l) {
      var m = SMA(x.c, l), a = ATR(x, l);
      return [m.map(function (v, i) { return (v === null || a[i] === null) ? null : [v - 1.33 * a[i], v + 1.33 * a[i]]; })];
    });
  def('donchian', 'Donchian', 'DC', 'Channels', 'price', [10, 20, 55],
    [{ type: 'band' }], function (x, l) {
      var h = HH(x.h, l), lo = LL(x.l, l);
      return [h.map(function (v, i) { return (v === null || lo[i] === null) ? null : [lo[i], v]; })];
    });
  def('pricechannel', 'Price Channel', 'PC', 'Channels', 'price', [20, 50, 100],
    [{ type: 'band' }], function (x, l) {
      var h = HH(x.c, l), lo = LL(x.c, l);
      return [h.map(function (v, i) { return (v === null || lo[i] === null) ? null : [lo[i], v]; })];
    });
  def('fractals', 'Fractals', 'FRACT', 'Structure', 'price', [2, 3], [{ type: 'line' }], function (x, l) { return [FRACTALS(x, l)]; });
  def('zigzag', 'ZigZag', 'ZZ', 'Structure', 'price', [1, 2, 3], [{ type: 'line' }], function (x, l) { return [ZIGZAG(x, l)]; });
  def('priorhigh', 'Prior Day High', 'PDH', 'Structure', 'price', [1], [{ type: 'line' }], function (x) { return [PRIORDAY(x)[0]]; });
  def('priorlow', 'Prior Day Low', 'PDL', 'Structure', 'price', [1], [{ type: 'line' }], function (x) { return [PRIORDAY(x)[1]]; });
  def('pivclassic', 'Pivot Classic', 'PIV', 'Structure', 'price', [1],
    [{ type: 'line', lab: 'P' }, { type: 'line', lab: 'R1' }, { type: 'line', lab: 'S1' }],
    function (x) { return PIVOTS(x, 'classic'); });
  def('pivcamarilla', 'Pivot Camarilla', 'CAM', 'Structure', 'price', [1],
    [{ type: 'line', lab: 'P' }, { type: 'line', lab: 'R3' }, { type: 'line', lab: 'S3' }],
    function (x) { return PIVOTS(x, 'camarilla'); });
  def('pivwoodie', 'Pivot Woodie', 'WOOD', 'Structure', 'price', [1],
    [{ type: 'line', lab: 'P' }, { type: 'line', lab: 'R1' }, { type: 'line', lab: 'S1' }],
    function (x) { return PIVOTS(x, 'woodie'); });
  def('pivfib', 'Pivot Fibonacci', 'PFIB', 'Structure', 'price', [1],
    [{ type: 'line', lab: 'P' }, { type: 'line', lab: 'R1' }, { type: 'line', lab: 'S1' }],
    function (x) { return PIVOTS(x, 'fib'); });
  def('median', 'Median Price', 'HL2', 'Price', 'price', [1], [{ type: 'line' }], function (x) { return [x.hl2]; });
  def('typical', 'Typical Price', 'HLC3', 'Price', 'price', [1], [{ type: 'line' }], function (x) { return [x.hlc3]; });
  def('weighted', 'Weighted Close', 'WCL', 'Price', 'price', [1], [{ type: 'line' }], function (x) {
    return [x.c.map(function (c, i) { return (x.h[i] + x.l[i] + 2 * c) / 4; })];
  });
  def('ohlc4', 'OHLC Average', 'OHLC4', 'Price', 'price', [1], [{ type: 'line' }], function (x) { return [x.ohlc4]; });

  // ------- Momentum / oscillators -------
  def('rsi', 'RSI', 'RSI', 'Momentum', 'osc', [7, 14, 21, 28], [{ type: 'line' }], function (x, l) { return [RSI(x.c, l)]; });
  def('stochrsi', 'Stoch RSI', 'SRSI', 'Momentum', 'osc', [14, 21],
    [{ type: 'line', lab: 'K' }, { type: 'line', lab: 'D' }], function (x, l) {
      var r = RSI(x.c, l), hh = HH(fill(r), l), ll = LL(fill(r), l), k = new Array(x.n);
      for (var i = 0; i < x.n; i++) k[i] = (r[i] === null || hh[i] === ll[i]) ? null : (r[i] - ll[i]) / (hh[i] - ll[i]) * 100;
      var d = SMA(fill(k), 3);
      return [k, k.map(function (v, i) { return i < 2 ? null : d[i]; })];
    });
  def('stoch', 'Stochastic', 'STOCH', 'Momentum', 'osc', [14, 21, 9],
    [{ type: 'line', lab: 'K' }, { type: 'line', lab: 'D' }], function (x, l) { return STOCH(x, l); });
  def('macd', 'MACD', 'MACD', 'Momentum', 'osc', [12, 9, 20],
    [{ type: 'line', lab: 'MACD' }, { type: 'line', lab: 'Signal' }, { type: 'hist', lab: 'Hist' }],
    function (x, l) { return MACDf(x.c, l, l * 2, 9); });
  def('ppo', 'PPO', 'PPO', 'Momentum', 'osc', [12, 20, 26],
    [{ type: 'line', lab: 'PPO' }, { type: 'line', lab: 'Signal' }, { type: 'hist', lab: 'Hist' }], function (x, l) {
      var a = EMA(x.c, l), b = EMA(x.c, l * 2), m = x.c.map(function (_, i) { return (!b[i]) ? null : (a[i] - b[i]) / b[i] * 100; });
      var sig = EMA(fill(m), 9), h = m.map(function (v, i) { return (v === null) ? null : v - sig[i]; });
      return [m, sig, h];
    });
  def('cci', 'CCI', 'CCI', 'Momentum', 'osc', [14, 20, 50], [{ type: 'line' }], function (x, l) { return [CCI(x, l)]; });
  def('wpr', 'Williams %R', 'WPR', 'Momentum', 'osc', [14, 28, 50], [{ type: 'line' }], function (x, l) { return [WILLR(x, l)]; });
  def('ao', 'Awesome Osc', 'AO', 'Momentum', 'osc', [5], [{ type: 'hist' }], function (x) { return AO(x); });
  def('ac', 'Accelerator', 'AC', 'Momentum', 'osc', [5], [{ type: 'hist' }], function (x) {
    var ao = AO(x)[0], m = SMA(fill(ao), 5);
    return [ao.map(function (v, i) { return (v === null || m[i] === null) ? null : v - m[i]; })];
  });
  def('mom', 'Momentum', 'MOM', 'Momentum', 'osc', [10, 14, 20], [{ type: 'line' }], function (x, l) {
    return [x.c.map(function (v, i) { return i < l ? null : v - x.c[i - l]; })];
  });
  def('roc', 'ROC', 'ROC', 'Momentum', 'osc', [9, 14, 21, 50], [{ type: 'line' }], function (x, l) { return [ROC(x.c, l)]; });
  def('tsi', 'TSI', 'TSI', 'Momentum', 'osc', [25], [{ type: 'line' }], function (x) { return [TSI(x.c, 25, 13)]; });
  def('uo', 'Ultimate Osc', 'UO', 'Momentum', 'osc', [7], [{ type: 'line' }], function (x) { return [UO(x, 7, 14, 28)]; });
  def('smi', 'Stoch Momentum', 'SMI', 'Momentum', 'osc', [14, 10], [{ type: 'line' }], function (x, l) { return SMI(x, l, 3); });
  def('cmo', 'Chande Momentum', 'CMO', 'Momentum', 'osc', [9, 14, 20], [{ type: 'line' }], function (x, l) { return [CMO(x.c, l)]; });
  def('connorsrsi', 'Connors RSI', 'CRSI', 'Momentum', 'osc', [3, 5],
    [{ type: 'line', lab: 'CRSI' }, { type: 'line', lab: 'Price RSI' }], function (x, l) {
      var r = RSI(x.c, l);
      var streak = new Array(x.n), s = 0;
      for (var i = 0; i < x.n; i++) {
        if (i === 0) { streak[i] = 0; continue; }
        var up = x.c[i] > x.c[i - 1];
        s = (s > 0 === up) ? s + (up ? 1 : -1) : (up ? 1 : -1);
        streak[i] = s;
      }
      var sr = RSI(streak.map(function (v) { return v + 100; }), l + 1);
      var out = new Array(x.n);
      for (i = 0; i < x.n; i++) out[i] = (r[i] === null || sr[i] === null) ? null : (r[i] + sr[i]) / 2;
      return [out, r];
    });
  def('fisher', 'Fisher Transform', 'FISH', 'Momentum', 'osc', [9, 14, 20], [{ type: 'line' }], function (x, l) { return FISHER(x, l); });
  def('trix', 'TRIX', 'TRIX', 'Momentum', 'osc', [9, 15, 20], [{ type: 'line' }], function (x, l) {
    var e = EMA(fill(EMA(fill(EMA(x.c, l)), l)), l);
    return [ROC(e, 1)];
  });
  def('dpo', 'DPO', 'DPO', 'Momentum', 'osc', [10, 20, 30], [{ type: 'line' }], function (x, l) { return [DPO(x.c, l)]; });
  def('coppock', 'Coppock', 'COPP', 'Momentum', 'osc', [10], [{ type: 'line' }], function (x) { return [COPPOCK(x.c)]; });
  def('kst', 'KST', 'KST', 'Momentum', 'osc', [10], [{ type: 'line' }], function (x) { return [KST(x.c)]; });
  def('wavetrend', 'Wave Trend', 'WT', 'Momentum', 'osc', [10, 14, 21],
    [{ type: 'line', lab: 'WT1' }, { type: 'line', lab: 'WT2' }], function (x, l) { return WAVETREND(x, l, 21); });
  def('rvi', 'Relative Vigor', 'RVI', 'Momentum', 'osc', [10, 14],
    [{ type: 'line', lab: 'RVI' }, { type: 'line', lab: 'Signal' }], function (x, l) { return RVI(x, l); });
  def('elderray', 'Elder Ray', 'ERAY', 'Momentum', 'osc', [13, 20],
    [{ type: 'hist', lab: 'Bull' }, { type: 'hist', lab: 'Bear' }], function (x, l) { return ELDER(x, l); });
  def('rsivol', 'RSI Volume', 'RSIV', 'Momentum', 'osc', [14, 21], [{ type: 'line' }], function (x, l) { return [RSI(x.v, l)]; });
  def('rmi', 'Relative Momentum', 'RMI', 'Momentum', 'osc', [14, 21], [{ type: 'line' }], function (x, l) {
    var m = new Array(x.n);
    for (var i = 0; i < x.n; i++) m[i] = i < l ? 0 : x.c[i] - x.c[i - l];
    return [RSI(m, l)];
  });

  // ------- Volatility -------
  def('atr', 'ATR', 'ATR', 'Volatility', 'osc', [14, 20, 50], [{ type: 'line' }], function (x, l) { return [ATR(x, l)]; });
  def('atrpct', 'ATR %', 'ATRP', 'Volatility', 'osc', [14, 20], [{ type: 'line' }], function (x, l) {
    var a = ATR(x, l);
    return [a.map(function (v, i) { return (!v) ? null : v / x.c[i] * 100; })];
  });
  def('tr', 'True Range', 'TR', 'Volatility', 'osc', [1], [{ type: 'line' }], function (x) { return [TR(x)]; });
  def('stdev', 'Std Deviation', 'STDV', 'Volatility', 'osc', [20, 50], [{ type: 'line' }], function (x, l) {
    return [STDEV(x.c, l, SMA(x.c, l))];
  });
  def('histvol', 'Historic Vol', 'HV', 'Volatility', 'osc', [20, 30, 60], [{ type: 'line' }], function (x, l) { return [HISTVOL(x.c, l)]; });
  def('zscore', 'Z-Score', 'Z', 'Volatility', 'osc', [20, 50], [{ type: 'line' }], function (x, l) { return [ZSCORE(x.c, l)]; });
  def('chop', 'Choppiness', 'CHOP', 'Volatility', 'osc', [14, 28], [{ type: 'line' }], function (x, l) { return [CHOP(x, l)]; });
  def('mass', 'Mass Index', 'MASS', 'Volatility', 'osc', [25], [{ type: 'line' }], function (x) { return [MASS(x)]; });
  def('vortex', 'Vortex', 'VORT', 'Volatility', 'osc', [14, 21],
    [{ type: 'line', lab: 'VI+' }, { type: 'line', lab: 'VI-' }], function (x, l) { return VORTEX(x, l); });
  def('ulcer', 'Ulcer Index', 'ULC', 'Volatility', 'osc', [14, 28], [{ type: 'line' }], function (x, l) { return [ULCER(x.c, l)]; });
  def('bbwidth', 'BB Width', 'BBW', 'Volatility', 'osc', [20, 50], [{ type: 'line' }], function (x, l) {
    var m = SMA(x.c, l), s = STDEV(x.c, l, m);
    return [m.map(function (v, i) { return (!v || s[i] === null) ? null : (4 * s[i]) / v * 100; })];
  });
  def('percentb', 'Bollinger %B', 'PCTB', 'Channels', 'osc', [20, 50], [{ type: 'line' }], function (x, l) {
    var m = SMA(x.c, l), s = STDEV(x.c, l, m);
    return [m.map(function (v, i) { var d = s[i] === null ? null : 4 * s[i]; return (!d) ? null : (x.c[i] - (v - d / 2)) / d * 100; })];
  });
  def('donchwidth', 'Donchian Width', 'DCW', 'Channels', 'osc', [20, 55], [{ type: 'line' }], function (x, l) {
    var h = HH(x.h, l), lo = LL(x.l, l);
    return [h.map(function (v, i) { return (v === null || !lo[i]) ? null : (v - lo[i]) / lo[i] * 100; })];
  });

  // ------- Volume -------
  def('obv', 'OBV', 'OBV', 'Volume', 'osc', [1], [{ type: 'line' }], function (x) { return [OBV(x)]; });
  def('adl', 'Accum/Dist', 'ADL', 'Volume', 'osc', [1], [{ type: 'line' }], function (x) { return [ADL(x)]; });
  def('cmf', 'Chaikin MF', 'CMF', 'Volume', 'osc', [20, 21, 50], [{ type: 'line' }], function (x, l) { return [CMF(x, l)]; });
  def('mfi', 'Money Flow', 'MFI', 'Volume', 'osc', [14, 21], [{ type: 'line' }], function (x, l) { return [MFI(x, l)]; });
  def('volosc', 'Volume Osc', 'VO', 'Volume', 'osc', [14, 21], [{ type: 'line' }], function (x, l) {
    var a = EMA(x.v, l), b = EMA(x.v, l * 2);
    return [a.map(function (v, i) { return (!v || !b[i]) ? null : (a[i] - b[i]) / b[i] * 100; })];
  });
  def('pvt', 'PVT', 'PVT', 'Volume', 'osc', [1], [{ type: 'line' }], function (x) { return [PVT(x)]; });
  def('force', 'Force Index', 'FI', 'Volume', 'osc', [13, 21], [{ type: 'line' }], function (x, l) { return [FORCE(x, l)]; });
  def('eom', 'Ease of Motion', 'EOM', 'Volume', 'osc', [14, 21], [{ type: 'line' }], function (x, l) { return [EOM(x, l)]; });
  def('nvi', 'NVI', 'NVI', 'Volume', 'osc', [1], [{ type: 'line' }], function (x) { return [NVIpvi(x, true)]; });
  def('pvi', 'PVI', 'PVI', 'Volume', 'osc', [1], [{ type: 'line' }], function (x) { return [NVIpvi(x, false)]; });
  def('volratio', 'Volume Ratio', 'VR', 'Volume', 'osc', [20, 50], [{ type: 'line' }], function (x, l) { return [VOLRATIO(x, l)]; });
  def('vwapdev', 'VWAP Deviation', 'VWD', 'Volume', 'osc', [1], [{ type: 'line' }], function (x) {
    var v = VWAP(x);
    return [v.map(function (m, i) { return (!m) ? null : (x.c[i] - m) / m * 100; })];
  });
  def('bop', 'Balance of Power', 'BOP', 'Volume', 'osc', [14, 21], [{ type: 'line' }], function (x, l) {
    var r = new Array(x.n);
    for (var i = 0; i < x.n; i++) r[i] = (x.h[i] === x.l[i]) ? 0 : (x.c[i] - x.o[i]) / (x.h[i] - x.l[i]);
    return [EMA(r, l)];
  });

  // ------- Statistical -------
  def('corr', 'Price/MA Corr', 'CORR', 'Statistical', 'osc', [20, 50], [{ type: 'line' }], function (x, l) {
    return [CORR(x.c, SMA(x.c, l), l)];
  });
  def('slope', 'LinReg Slope', 'SLOPE', 'Statistical', 'osc', [20, 50], [{ type: 'line' }], function (x, l) {
    var r = LINREG(x.c, l);
    return [r.slope];
  });
  def('r2', 'R Squared', 'R2', 'Statistical', 'osc', [20, 50], [{ type: 'line' }], function (x, l) {
    var c = CORR(x.c, LINREG(x.c, l), l);
    return [c.map(function (v) { return v === null ? null : v * v; })];
  });
  def('skew', 'Skewness', 'SKEW', 'Statistical', 'osc', [20, 50], [{ type: 'line' }], function (x, l) { return [SKEW(x.c, l)]; });
  def('kurt', 'Kurtosis', 'KURT', 'Statistical', 'osc', [20, 50], [{ type: 'line' }], function (x, l) { return [KURT(x.c, l)]; });
  def('autocorr', 'Autocorrelation', 'ACOR', 'Statistical', 'osc', [20, 50], [{ type: 'line' }], function (x, l) { return [AUTOCORR(x.c, l)]; });
  def('vratio', 'Variance Ratio', 'VRAT', 'Statistical', 'osc', [20, 50], [{ type: 'line' }], function (x, l) { return [VRATIO(x.c, l)]; });
  def('entropy', 'Entropy', 'ENT', 'Statistical', 'osc', [20, 50], [{ type: 'line' }], function (x, l) { return [ENTROPY(x.c, l)]; });
  def('hurst', 'Hurst Exponent', 'HURST', 'Statistical', 'osc', [32, 64], [{ type: 'line' }], function (x, l) { return [HURST(x.c, l)]; });

  /* ------------------------------- catalogue ------------------------------- */
  var CATALOG = [], byId = {};

  ORDER.forEach(function (baseId, bi) {
    var s = SPEC[baseId];
    s.lens.forEach(function (len) {
      var id = baseId + '_' + len;
      if (byId[id]) return;
      var plots = s.plots.map(function (p, pi) {
        return {
          type: p.type,
          label: p.lab ? (p.lab + (s.plots.length > 1 ? '' : '')) : (s.short + ' ' + len),
          color: COL[(bi + pi) % COL.length]
        };
      });
      var suffix = s.lens.length > 1 || s.lens[0] !== 1 ? ' (' + len + ')' : '';
      var e = {
        id: id,
        name: s.name + suffix,
        short: (s.short + (s.lens[0] !== 1 ? len : '')).slice(0, 10),
        cat: s.cat,
        pane: s.pane,
        plots: plots,
        params: { len: len },
        base: baseId
      };
      CATALOG.push(e);
      byId[id] = e;
    });
  });

  // extend with standard periods until the catalogue is genuinely 500+
  var EXTRA = [3, 7, 9, 12, 21, 34, 55, 89, 144];
  var guard = 0;
  while (CATALOG.length < 520 && guard < 6000) {
    guard++;
    var changed = false;
    for (var i = 0; i < ORDER.length && CATALOG.length < 520; i++) {
      var s = SPEC[ORDER[i]], e_len = EXTRA[(guard + i) % EXTRA.length];
      if (s.lens.indexOf(e_len) >= 0) continue;
      var nid = ORDER[i] + '_' + e_len;
      if (byId[nid]) continue;
      var plots2 = s.plots.map(function (p, pi) {
        return { type: p.type, label: p.lab || (s.short + ' ' + e_len), color: COL[(i + pi) % COL.length] };
      });
      var entry = {
        id: nid, name: s.name + ' (' + e_len + ')', short: (s.short + e_len).slice(0, 10),
        cat: s.cat, pane: s.pane, plots: plots2, params: { len: e_len }, base: ORDER[i]
      };
      CATALOG.push(entry);
      byId[nid] = entry;
      changed = true;
    }
    if (!changed) break;
  }

  /* -------------------------------- compute -------------------------------- */
  function mapPlot(series, candles, type) {
    var out = new Array(candles.length);
    for (var i = 0; i < candles.length; i++) {
      var v = series ? series[i] : null;
      if (type === 'band') {
        out[i] = (v && v[0] !== null && v[1] !== null && isFinite(v[0]) && isFinite(v[1])) ? { t: candles[i].t, v1: v[0], v2: v[1] } : null;
      } else {
        out[i] = (v === null || v === undefined || !isFinite(v)) ? null : { t: candles[i].t, v: v };
      }
    }
    return out;
  }

  function compute(entry, candles) {
    var s = SPEC[entry && entry.base];
    if (!s || !candles || !candles.length) return { pane: entry ? entry.pane : 'price', plots: [] };
    var len = (entry.params && entry.params.len) || 1;
    var x = ctxOf(candles);
    x.t = candles.map(function (k) { return k.t; });
    var series;
    try { series = s.f(x, len) || []; } catch (err) { series = []; }
    var plots = entry.plots.map(function (meta, i) {
      return {
        type: meta.type,
        label: meta.label,
        color: meta.color,
        data: mapPlot(series[i], candles, meta.type)
      };
    });
    return { pane: entry.pane, plots: plots };
  }

  var IND = { CATALOG: CATALOG, compute: compute, byId: byId, version: '3.0.0', baseCount: ORDER.length };
  if (typeof window !== 'undefined') window.IND = IND;
  if (typeof module !== 'undefined' && module.exports) module.exports = IND;
})(typeof window !== 'undefined' ? window : this);

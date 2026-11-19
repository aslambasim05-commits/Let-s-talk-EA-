/* ================= LET'S TALK PRO — SIGNAL BACKTESTER =================
   Generic per-indicator win-rate ranking. For every catalogue entry it
   derives a direction signal from the indicator's own plots, then walks the
   candles with a 1:R risk-reward bracket (SL = 1 x ATR(14), TP = R x ATR(14))
   and counts how often TP is reached before SL. No dependencies. */
(function (root) {
  'use strict';

  function atr14(candles) {
    var n = candles.length, tr = new Array(n), out = new Array(n).fill(null), i, s = 0;
    for (i = 0; i < n; i++) {
      if (i === 0) tr[i] = candles[i].h - candles[i].l;
      else tr[i] = Math.max(candles[i].h - candles[i].l, Math.abs(candles[i].h - candles[i - 1].c), Math.abs(candles[i].l - candles[i - 1].c));
    }
    for (i = 0; i < n; i++) {
      s += tr[i];
      if (i === 13) out[i] = s / 14;
      else if (i > 13) out[i] = (out[i - 1] * 13 + tr[i]) / 14;
    }
    return out;
  }

  function valAt(plot, i) {
    var d = plot.data[i];
    if (!d) return null;
    return plot.type === 'band' ? (d.v1 + d.v2) / 2 : d.v;
  }

  /* signal direction for bar i from the entry's plot shape */
  function signalOf(entry, plot, candles, i) {
    var c = candles[i], v = valAt(plot, i), pv = i > 0 ? valAt(plot, i - 1) : null;
    if (v === null || v === undefined || !isFinite(v)) return 0;
    if (plot.type === 'band') {
      var d = plot.data[i];
      if (!d || d.v1 === null || d.v2 === null) return 0;
      if (c.c > d.v2) return -1;   // stretched above band → fade down
      if (c.c < d.v1) return 1;    // stretched below band → fade up
      return 0;
    }
    if (entry.pane === 'osc') {
      if (pv === null || pv === undefined || !isFinite(pv)) return 0;
      var diff = v - pv, pdiff = (i > 1) ? (pv - valAt(plot, i - 2)) : 0;
      var dir = diff > 0 ? 1 : (diff < 0 ? -1 : 0);
      if (!dir) return 0;
      // require the momentum to agree with the previous bar (noise filter)
      if (pdiff !== 0 && dir !== (pdiff > 0 ? 1 : -1)) return 0;
      return dir;
    }
    // price-pane overlay line: trade with price relative to the line
    if (c.c > v) return 1;
    if (c.c < v) return -1;
    return 0;
  }

  /* backtest one catalogue entry on the given candles */
  function backtest(entry, candles, opts) {
    opts = opts || {};
    var rr = opts.rr || 2, maxHold = opts.maxHold || 16;
    var IND = root.IND || (typeof window !== 'undefined' ? window.IND : null);
    if (!IND || !entry || !candles || candles.length < 40) return null;
    var res;
    try { res = IND.compute(entry, candles); } catch (e) { return null; }
    if (!res || !res.plots || !res.plots.length) return null;
    var plot = res.plots[0];
    var atrs = atr14(candles), n = candles.length;
    var wins = 0, losses = 0, i, j;
    for (i = 2; i < n - 2; i++) {
      var a = atrs[i];
      if (a === null || a <= 0) continue;
      var dir = signalOf(entry, plot, candles, i);
      if (!dir) continue;
      var entryP = candles[i].c;
      var sl = entryP - dir * a, tp = entryP + dir * a * rr;
      var win = null;
      for (j = i + 1; j <= Math.min(n - 1, i + maxHold); j++) {
        var cb = candles[j];
        if (dir > 0) {
          if (cb.l <= sl) { win = false; break; }
          if (cb.h >= tp) { win = true; break; }
        } else {
          if (cb.h >= sl) { win = false; break; }
          if (cb.l <= tp) { win = true; break; }
        }
      }
      if (win === null) {
        var lastC = candles[Math.min(n - 1, i + maxHold)].c;
        win = dir > 0 ? lastC > entryP : lastC < entryP;
      }
      if (win) wins++; else losses++;
      i += 2;
    }
    var trades = wins + losses;
    if (trades < 5) return null;
    return { trades: trades, wins: wins, losses: losses, wr: wins / trades * 100, rr: rr };
  }

  var STATS = { backtest: backtest, version: '3.1.0' };
  if (typeof window !== 'undefined') window.STATS = STATS;
  if (typeof module !== 'undefined' && module.exports) module.exports = STATS;
})(typeof window !== 'undefined' ? window : this);

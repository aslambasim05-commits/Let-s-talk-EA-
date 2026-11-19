/* ================= LET'S TALK PRO — APPLICATION SHELL ================= */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var PAIRS = [
    { s: 'BTCUSDT', n: 'BTC', full: 'Bitcoin' },
    { s: 'ETHUSDT', n: 'ETH', full: 'Ethereum' },
    { s: 'SOLUSDT', n: 'SOL', full: 'Solana' },
    { s: 'BNBUSDT', n: 'BNB', full: 'BNB' },
    { s: 'XRPUSDT', n: 'XRP', full: 'Ripple' },
    { s: 'DOGEUSDT', n: 'DOGE', full: 'Dogecoin' },
    { s: 'ADAUSDT', n: 'ADA', full: 'Cardano' },
    { s: 'AVAXUSDT', n: 'AVAX', full: 'Avalanche' },
    { s: 'LINKUSDT', n: 'LINK', full: 'Chainlink' },
    { s: 'TONUSDT', n: 'TON', full: 'Toncoin' },
    { s: 'DOTUSDT', n: 'DOT', full: 'Polkadot' },
    { s: 'LTCUSDT', n: 'LTC', full: 'Litecoin' },
    { s: 'NEARUSDT', n: 'NEAR', full: 'NEAR' },
    { s: 'SUIUSDT', n: 'SUI', full: 'Sui' },
    { s: 'ARBUSDT', n: 'ARB', full: 'Arbitrum' },
    { s: 'OPUSDT', n: 'OP', full: 'Optimism' },
    { s: 'INJUSDT', n: 'INJ', full: 'Injective' },
    { s: 'APTUSDT', n: 'APT', full: 'Aptos' },
    { s: 'TRXUSDT', n: 'TRX', full: 'TRON' },
    { s: 'ATOMUSDT', n: 'ATOM', full: 'Cosmos' },
    { s: 'FILUSDT', n: 'FIL', full: 'Filecoin' },
    { s: 'PEPEUSDT', n: 'PEPE', full: 'Pepe' }
  ];

  var TFS = ['1m', '3m', '5m', '15m', '1h', '4h', '1d'];
  var ACCENTS = [
    { id: 'cyan', c: '#00E5FF', c2: '#35F0FF', rgb: '0,229,255' },
    { id: 'mint', c: '#00F0A0', c2: '#5CFFC4', rgb: '0,240,160' },
    { id: 'gold', c: '#FFC24B', c2: '#FFD98A', rgb: '255,194,75' },
    { id: 'violet', c: '#A98BFF', c2: '#C9B6FF', rgb: '169,139,255' }
  ];

  /* ------------------------------ storage ------------------------------ */
  var store = {
    get: function (k, d) {
      try {
        var v = localStorage.getItem('ltp3_' + k);
        return v === null ? d : JSON.parse(v);
      } catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem('ltp3_' + k, JSON.stringify(v)); } catch (e) {}
    }
  };

  var state = {
    symbol: store.get('symbol', 'BTCUSDT'),
    tf: store.get('tf', '15m'),
    active: store.get('active', ['ema_21', 'bb_20', 'rsi_14']),
    accent: store.get('accent', 'cyan'),
    haptic: store.get('haptic', false),
    notif: store.get('notif', false),
    tab: 'terminal',
    cat: 'ALL',
    mq: '',
    iq: '',
    indLimit: 120,
    digits: 2,
    lastTicker: null
  };

  var pos = store.get('pos', null);         // {symbol, dir, entry, sl, tp, rr}
  var ranks = {};                            // id -> {wr, trades}
  var rankSort = false;
  var ranking = false;

  var chart = null;
  var feed = null;
  var byId = {};
  var catalogReady = false;
  var pendingInd = false;

  /* ---------------------------- formatting ---------------------------- */
  function digitsFor(p) {
    if (!p || !isFinite(p)) return 2;
    if (p >= 1000) return 1;
    if (p >= 10) return 2;
    if (p >= 1) return 3;
    if (p >= 0.1) return 4;
    if (p >= 0.01) return 5;
    if (p >= 0.001) return 6;
    if (p >= 0.0001) return 7;
    return 8;
  }

  function fmtP(p, d) {
    if (p === null || p === undefined || !isFinite(p)) return '—';
    var dd = d === undefined ? state.digits : d;
    if (p >= 1000) {
      return p.toLocaleString('en-US', { minimumFractionDigits: dd, maximumFractionDigits: dd });
    }
    return p.toFixed(dd);
  }

  function fmtQty(q) {
    if (!isFinite(q)) return '—';
    if (q >= 1000) return (q / 1000).toFixed(2) + 'K';
    if (q >= 1) return q.toFixed(3);
    return q.toFixed(4);
  }

  function fmtVol(q) {
    if (!isFinite(q)) return '—';
    if (q >= 1e9) return (q / 1e9).toFixed(2) + 'B';
    if (q >= 1e6) return (q / 1e6).toFixed(1) + 'M';
    if (q >= 1e3) return (q / 1e3).toFixed(1) + 'K';
    return q.toFixed(0);
  }

  function fmtPct(p) {
    if (!isFinite(p)) return '—';
    return (p >= 0 ? '+' : '') + p.toFixed(2) + '%';
  }

  function baseOf(sym) { return sym.replace(/USDT$/, ''); }

  /* ------------------------- notifications ------------------------- */
  function notify(title, body) {
    toast(title + (body ? ' · ' + body : ''));
    if (state.haptic && navigator.vibrate) { try { navigator.vibrate([70, 40, 70]); } catch (e) {} }
    try {
      if (window.Android && window.Android.notify) { window.Android.notify(String(title), String(body || '')); return; }
      if (state.notif && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body: body || '' });
      }
    } catch (e) {}
  }

  function refreshNotifLabel() {
    $('sysNotif').textContent = state.notif ? 'ON' : 'OFF';
    $('sysNotif').classList.toggle('on', !!state.notif);
  }

  function toggleNotif() {
    if (state.notif) {
      state.notif = false;
      store.set('notif', false);
      refreshNotifLabel();
      toast('NOTIFICATIONS OFF');
      return;
    }
    var granted = false;
    try {
      if (window.Android && window.Android.reqNotif) window.Android.reqNotif();
      if (window.Android && window.Android.notifGranted) granted = !!window.Android.notifGranted();
    } catch (e) {}
    if (granted) {
      state.notif = true;
      store.set('notif', true);
      refreshNotifLabel();
      notify('ALERTS ON', 'TP / SL notifications enabled');
      return;
    }
    if ('Notification' in window) {
      try {
        Notification.requestPermission().then(function (p) {
          state.notif = p === 'granted';
          store.set('notif', state.notif);
          refreshNotifLabel();
          if (state.notif) notify('ALERTS ON', 'TP / SL notifications enabled');
          else toast('PERMISSION DENIED');
        });
      } catch (e) { toast('NOTIFICATIONS NOT SUPPORTED'); }
    } else {
      state.notif = false;
      refreshNotifLabel();
      toast('NOTIFICATIONS NOT SUPPORTED HERE');
    }
  }

  /* ------------------------- position (TP/SL) ------------------------- */
  function posATR14() {
    var c = feed && feed.candles ? feed.candles : [], n = c.length;
    if (n < 15) return null;
    var s = 0, i;
    for (i = n - 14; i < n; i++) {
      s += Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c));
    }
    return s / 14;
  }

  function renderPos() {
    var open = pos && pos.symbol === state.symbol && pos.entry;
    if (chart) chart.setPosition(open ? pos : null);
    var chip = $('posChip');
    if (!chip) return;
    if (!open) { chip.textContent = ''; chip.className = 'pos-chip'; return; }
    var p = feed.price || pos.entry;
    var sgn = pos.dir === 'LONG' ? 1 : -1;
    var pnl = (p - pos.entry) / pos.entry * 100 * sgn;
    chip.className = 'pos-chip on ' + (pnl >= 0 ? 'up' : 'dn');
    chip.textContent = pos.dir + ' ' + fmtP(pos.entry) + '  ·  TP ' + fmtP(pos.tp) + '  ·  SL ' + fmtP(pos.sl) + '  ·  PNL ' + fmtPct(pnl);
  }

  function checkPos(c) {
    if (!pos || pos.symbol !== state.symbol || !pos.entry) return;
    var hit = null;
    if (pos.dir === 'LONG') {
      if (c.l <= pos.sl) hit = 'SL';
      else if (c.h >= pos.tp) hit = 'TP';
    } else {
      if (c.h >= pos.sl) hit = 'SL';
      else if (c.l <= pos.tp) hit = 'TP';
    }
    if (!hit) return;
    var sgn = pos.dir === 'LONG' ? 1 : -1;
    var pnl = (hit === 'TP' ? Math.abs(pos.tp - pos.entry) : -Math.abs(pos.sl - pos.entry)) / pos.entry * 100;
    notify(hit + ' HIT · ' + baseOf(state.symbol), fmtPct(pnl) + ' @ ' + fmtP(hit === 'TP' ? pos.tp : pos.sl));
    pos = null;
    store.set('pos', null);
    renderPos();
  }

  function openPosSheet() {
    var draft = { dir: pos && pos.dir === 'SHORT' ? 'SHORT' : 'LONG', rr: (pos && pos.rr) || 2, risk: 'atr1' };
    sheetOpen = true;
    $('sheetTitle').textContent = 'POSITION ENTRY';
    $('sheetSub').textContent = 'TP / SL SETUP · DEFAULT 1:2 RR';
    var body = $('sheetBody');
    function paint() {
      var p = feed.price || 0, atr = posATR14();
      var dist = draft.risk === 'atr1' ? (atr || 0) : draft.risk === 'atr2' ? (atr || 0) * 2 : p * (parseFloat(draft.risk) / 100);
      var sgn = draft.dir === 'LONG' ? 1 : -1;
      var sl = p - sgn * dist, tp = p + sgn * dist * draft.rr;
      body.innerHTML =
        '<div class="kv"><span>MARK</span><b>' + fmtP(p) + '</b></div>' +
        (atr ? '<div class="kv"><span>ATR 14</span><b>' + fmtP(atr, state.digits) + '</b></div>' : '') +
        '<div class="pos-grid">' +
        '<button class="pg ' + (draft.dir === 'LONG' ? 'on up' : '') + '" data-k="dir" data-v="LONG">LONG</button>' +
        '<button class="pg ' + (draft.dir === 'SHORT' ? 'on dn' : '') + '" data-k="dir" data-v="SHORT">SHORT</button>' +
        '</div>' +
        '<div class="pos-lbl">RISK REWARD</div><div class="pos-grid four">' +
        [1, 1.5, 2, 3].map(function (r) { return '<button class="pg ' + (draft.rr === r ? 'on' : '') + '" data-k="rr" data-v="' + r + '">1:' + r + '</button>'; }).join('') +
        '</div>' +
        '<div class="pos-lbl">STOP DISTANCE</div><div class="pos-grid four">' +
        [['atr1', 'ATR ×1'], ['atr2', 'ATR ×2'], ['0.5', '0.5%'], ['1', '1%']].map(function (o) {
          return '<button class="pg ' + (draft.risk === o[0] ? 'on' : '') + '" data-k="risk" data-v="' + o[0] + '">' + o[1] + '</button>';
        }).join('') +
        '</div>' +
        '<div class="kv"><span>EST. STOP LOSS</span><b style="color:var(--down)">' + fmtP(sl) + ' (' + fmtPct(-dist / p * 100 * sgn * sgn) + ')</b></div>' +
        '<div class="kv"><span>EST. TAKE PROFIT</span><b style="color:var(--up)">' + fmtP(tp) + ' (+' + (dist * draft.rr / p * 100).toFixed(2) + '%)</b></div>' +
        (pos && pos.symbol === state.symbol ? '<button class="btn ghost" id="posClose" style="margin-top:10px">CLOSE POSITION</button>' : '');
      body.querySelectorAll('.pg').forEach(function (b) {
        b.onclick = function () {
          var k = b.getAttribute('data-k'), v = b.getAttribute('data-v');
          draft[k] = k === 'rr' ? parseFloat(v) : v;
          paint();
        };
      });
      var pc = $('posClose');
      if (pc) pc.onclick = function () {
        pos = null; store.set('pos', null); renderPos(); closeSheet();
        toast('POSITION CLOSED');
      };
      $('sheetBtn').textContent = 'PLACE ENTRY @ MARKET';
      $('sheetBtn').onclick = function () {
        if (!p) return;
        pos = { symbol: state.symbol, dir: draft.dir, entry: p, sl: sl, tp: tp, rr: draft.rr };
        store.set('pos', pos);
        renderPos();
        closeSheet();
        notify('ENTRY PLACED · ' + draft.dir, baseOf(state.symbol) + ' @ ' + fmtP(p));
      };
    }
    paint();
    $('sheetVeil').classList.add('on');
    $('sheet').classList.add('on');
  }

  /* ------------------------------- toast ------------------------------- */
  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('on');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('on'); }, 1900);
  }

  /* ------------------------------- tabs ------------------------------- */
  function switchTab(name) {
    state.tab = name;
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('active', tabs[i].id === 'tab-' + name);
    }
    var btns = document.querySelectorAll('.dock-btn');
    for (var j = 0; j < btns.length; j++) {
      btns[j].classList.toggle('on', btns[j].getAttribute('data-tab') === name);
    }
    if (name === 'terminal' && chart) chart.invalidate();
  }

  /* ---------------------------- chart setup ---------------------------- */
  function initChart() {
    chart = new Chart($('chart'), {
      onCrosshair: function (candle, visible) {
        if (!candle) return;
        if (visible) {
          $('bigPrice').textContent = fmtP(candle.c);
          $('bigChg').textContent = 'O ' + fmtP(candle.o) + '  H ' + fmtP(candle.h) + '  L ' + fmtP(candle.l) + '  C ' + fmtP(candle.c);
          $('bigChg').className = 'chg';
        } else {
          syncPrice();
        }
      }
    });
    chart.setMeta({ symbol: state.symbol, tf: state.tf, digits: state.digits });
  }

  /* --------------------------- header syncing --------------------------- */
  function syncPrice() {
    var p = feed.price || (feed.candles.length ? feed.candles[feed.candles.length - 1].c : 0);
    if (!p) return;
    var el = $('bigPrice');
    el.textContent = fmtP(p);
    var up = p >= (feed.prevPrice || p);
    el.classList.toggle('up', up);
    el.classList.toggle('down', !up);

    var t = state.lastTicker;
    var chg = t && t.P !== undefined ? t.P : ((t && t.o) ? ((p - t.o) / t.o) * 100 : 0);
    var ce = $('bigChg');
    ce.textContent = fmtPct(chg) + '  24H';
    ce.className = 'chg ' + (chg >= 0 ? 'up' : 'down');

    if (t) {
      $('h24').textContent = fmtP(t.h);
      $('l24').textContent = fmtP(t.l);
      $('vol24').textContent = fmtVol(t.q);
    }
  }

  function syncTicker(t) {
    state.lastTicker = t;
    if (!t || !t.c) return;
    state.digits = digitsFor(t.c);
    chart.setMeta({ digits: state.digits });
    $('h24').textContent = fmtP(t.h);
    $('l24').textContent = fmtP(t.l);
    $('vol24').textContent = fmtVol(t.q);
    var chg = t.o ? ((t.c - t.o) / t.o) * 100 : 0;
    var ce = $('bigChg');
    ce.textContent = fmtPct(chg) + '  24H';
    ce.className = 'chg ' + (chg >= 0 ? 'up' : 'down');
  }

  function setPairHeader() {
    var b = baseOf(state.symbol);
    $('pairName').innerHTML = b + '<span>/USDT</span><span class="chev">▾</span>';
  }

  /* ------------------------------ universe ------------------------------ */
  function buildTfRow() {
    var row = $('tfRow');
    row.innerHTML = '';
    TFS.forEach(function (tf) {
      var b = document.createElement('button');
      b.className = 'tf' + (tf === state.tf ? ' on' : '');
      b.setAttribute('data-tf', tf);
      b.textContent = tf.toUpperCase();
      b.onclick = function () {
        if (tf === state.tf) return;
        state.tf = tf;
        store.set('tf', tf);
        var all = row.querySelectorAll('.tf');
        for (var i = 0; i < all.length; i++) all[i].classList.toggle('on', all[i].textContent === tf.toUpperCase());
        chart.setMeta({ tf: tf });
        chart.resetView();
        veil(true, 'LOADING ' + tf.toUpperCase() + ' SERIES');
        feed.switchTf(tf);
      };
      row.appendChild(b);
    });
  }

  function renderMarkets() {
    var list = $('mktList');
    var q = state.mq.toUpperCase();
    var html = '';
    var count = 0;
    PAIRS.forEach(function (p) {
      var t = feed.tickers[p.s];
      if (q && p.n.indexOf(q) < 0 && p.full.toUpperCase().indexOf(q) < 0) return;
      count++;
      var price = t ? fmtP(t.c, digitsFor(t.c)) : '—';
      var chg = t ? t.P : 0;
      var pos = t && t.h > t.l ? Math.max(2, Math.min(100, ((t.c - t.l) / (t.h - t.l)) * 100)) : 50;
      html += '<div class="mrow' + (p.s === state.symbol ? ' on' : '') + '" data-s="' + p.s + '">' +
        '<div class="glyph">' + p.n.slice(0, 4) + '</div>' +
        '<div class="mid"><div class="pair">' + p.n + '<span>/USDT</span></div>' +
        '<div class="range"><i style="width:' + pos.toFixed(1) + '%"></i></div></div>' +
        '<div class="right"><div class="px">' + price + '</div>' +
        '<div class="dv ' + (chg >= 0 ? 'up' : 'down') + '">' + fmtPct(chg) + '</div></div></div>';
    });
    list.innerHTML = html || '<div class="empty">NO MATCH</div>';
    $('mktCount').textContent = count + ' PAIRS';
  }

  function onMarkets(tickers) {
    renderMarkets();
    if (tickers[state.symbol] && !state.lastTicker) syncTicker(tickers[state.symbol]);
  }

  /* ------------------------------- tape ------------------------------- */
  function pushTrade(tr) {
    var rows = $('tapeRows');
    var d = digitsFor(tr.p);
    var row = document.createElement('div');
    row.className = 'tr';
    var buy = tr.side > 0;
    row.innerHTML = '<span class="p' + (buy ? '' : ' sell') + '">' + fmtP(tr.p, d) + '</span>' +
      '<span class="q">' + fmtQty(tr.q) + '</span>' +
      '<span class="s ' + (buy ? 'b' : 's') + '">' + (buy ? 'BUY' : 'SELL') + '</span>';
    rows.insertBefore(row, rows.firstChild);
    while (rows.children.length > 3) rows.removeChild(rows.lastChild);
  }

  function clearTape() { $('tapeRows').innerHTML = ''; }

  /* ------------------------------ veil/status ------------------------------ */
  function veil(on, txt) {
    var v = $('veil');
    if (txt) $('veilTxt').textContent = txt;
    v.classList.toggle('hide', !on);
  }

  function onStatus(st) {
    var link = $('linkBtn');
    var txt = $('linkTxt');
    link.className = 'link';
    if (st.status === 'live') { txt.textContent = 'LIVE'; veil(false); }
    else if (st.status === 'connecting' || st.status === 'loading') { txt.textContent = 'LINKING'; link.classList.add('warn'); veil(true, 'ESTABLISHING UPLINK'); }
    else if (st.status === 'failover') { txt.textContent = 'FAILOVER'; link.classList.add('warn'); toast('FAILOVER · ' + st.provider); notify('FAILOVER', st.provider + ' uplink'); }
    else if (st.status === 'unstable') { txt.textContent = 'UNSTABLE'; link.classList.add('warn'); }
    else { txt.textContent = 'OFFLINE'; link.classList.add('bad'); veil(true, 'UPLINK LOST · RETRYING'); notify('UPLINK LOST', 'reconnecting ' + state.symbol); }

    $('sysProvider').textContent = st.provider || '—';
    $('sysSocket').textContent = st.status.toUpperCase();
    $('sysCandles').textContent = String(feed.candles.length);
    if (sheetOpen) fillSheet();
  }

  function onLatency(ms) {
    $('latency').textContent = (ms !== null ? ms : '—') + ' MS';
    $('sysLatency').textContent = (ms !== null ? ms + ' ms' : '—');
  }

  /* ---------------------------- indicator engine ---------------------------- */
  function indexCatalog() {
    if (!window.IND || !IND.CATALOG) {
      catalogReady = false;
      toast('INDICATOR LIBRARY MISSING');
      return;
    }
    byId = {};
    IND.CATALOG.forEach(function (e) { byId[e.id] = e; });
    catalogReady = true;

    // keep only ids that exist in this catalogue version, then seed sensible defaults
    state.active = state.active.filter(function (id) { return !!byId[id]; });
    if (!state.active.length) {
      var auto = [autoPick(/^ema/i, 21), autoPick(/^(bb|boll)/i, 20), autoPick(/^rsi/i, 14)];
      state.active = auto.filter(Boolean);
      store.set('active', state.active);
    }
  }

  function autoPick(re, len) {
    var cands = IND.CATALOG.filter(function (e) { return re.test(e.base || '') || re.test(e.id); });
    if (!cands.length) return null;
    var exact = cands.filter(function (e) { return e.params && e.params.len === len; });
    return (exact[0] || cands[0]).id;
  }

  function recompute() {
    if (!catalogReady || !chart) return;
    var candles = feed.candles;
    var groups = [];
    state.active.forEach(function (id) {
      var entry = byId[id];
      if (!entry) return;
      try {
        var res = IND.compute(entry, candles);
        if (res && res.plots) {
          groups.push({ pane: res.pane || entry.pane, id: id, entry: entry, plots: res.plots });
        }
      } catch (e) { console.error('indicator ' + id, e); }
    });
    chart.setIndicators(groups);
    renderLegend(groups);
    updateSysInd(groups);
    $('sysCandles').textContent = String(candles.length);
  }

  function scheduleInd() {
    if (pendingInd) return;
    pendingInd = true;
    setTimeout(function () {
      pendingInd = false;
      recompute();
    }, 120);
  }

  function lastVal(plot) {
    var arr = plot && plot.data;
    if (!arr) return null;
    for (var i = arr.length - 1; i >= 0; i--) {
      var it = arr[i];
      if (!it) continue;
      if (plot.type === 'band') {
        if (it.v1 !== null && it.v1 !== undefined && it.v2 !== null && it.v2 !== undefined) return (it.v1 + it.v2) / 2;
      } else if (it.v !== null && it.v !== undefined && isFinite(it.v)) {
        return it.v;
      }
    }
    return null;
  }

  function renderLegend(groups) {
    var el = $('legend');
    var html = '';
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var p0 = g.plots[0];
      if (!p0) continue;
      var v = lastVal(p0);
      var txt = v === null ? '—' : (g.pane === 'price' ? fmtP(v, state.digits) : (Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(2)));
      html += '<div class="lg"><i style="background:' + (p0.color || '#00E5FF') + '"></i>' +
        '<span>' + (g.entry.short || g.entry.name) + '</span><b>' + txt + '</b></div>';
    }
    el.innerHTML = html;
  }

  function updateSysInd(groups) {
    var osc = 0;
    (groups || []).forEach(function (g) { if (g.pane === 'osc') osc++; });
    $('sysInd').textContent = catalogReady ? IND.CATALOG.length + ' ENTRIES' : '—';
    $('sysActive').textContent = String(state.active.length);
    $('sysOsc').textContent = String(osc);
    $('indCount').textContent = catalogReady ? (IND.CATALOG.length + ' · ' + state.active.length + ' ACTIVE') : '—';
  }

  function toggleIndicator(id) {
    var idx = state.active.indexOf(id);
    var entry = byId[id];
    if (idx >= 0) {
      state.active.splice(idx, 1);
    } else {
      if (state.active.length >= 6) { toast('MAX 6 INDICATORS'); return; }
      if (entry && entry.pane === 'osc') {
        var oscCount = state.active.filter(function (a) { return byId[a] && byId[a].pane === 'osc'; }).length;
        if (oscCount >= 2) { toast('MAX 2 OSCILLATOR PANES'); return; }
      }
      state.active.push(id);
    }
    store.set('active', state.active);
    renderIndList();
    recompute();
    if (state.haptic && navigator.vibrate) navigator.vibrate(10);
  }

  function buildCats() {
    var cats = ['ALL'];
    if (catalogReady) {
      IND.CATALOG.forEach(function (e) {
        if (cats.indexOf(e.cat) < 0) cats.push(e.cat);
      });
    }
    if (Object.keys(ranks).length) cats.unshift('BEST');
    var el = $('indCats');
    el.innerHTML = '';
    cats.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'chip' + (c === state.cat ? ' on' : '');
      b.textContent = c.toUpperCase();
      b.onclick = function () {
        state.cat = c;
        state.indLimit = 120;
        buildCats();
        renderIndList();
      };
      el.appendChild(b);
    });
  }

  /* ------------------------------ win-rate ranks ------------------------------ */
  function runRanks() {
    if (ranking) return;
    if (!catalogReady || !window.STATS) { toast('RANKER NOT READY'); return; }
    if (!feed.candles || feed.candles.length < 40) { toast('WAIT FOR DATA'); return; }
    ranking = true;
    ranks = {};
    var candles = feed.candles, cats = IND.CATALOG, i = 0, t0 = Date.now();
    $('rankProg').textContent = 'ANALYZING 0%';
    function step() {
      var n = 0;
      while (i < cats.length && n < 40) {
        try {
          var r = STATS.backtest(cats[i], candles, { rr: 2 });
          if (r) ranks[cats[i].id] = r;
        } catch (e) {}
        i++; n++;
      }
      $('rankProg').textContent = 'ANALYZING ' + Math.min(100, Math.round(i / cats.length * 100)) + '%';
      if (i < cats.length) { setTimeout(step, 0); return; }
      ranking = false;
      var ms = Date.now() - t0;
      var best = Object.keys(ranks).sort(function (a, b) { return ranks[b].wr - ranks[a].wr; });
      $('rankProg').textContent = 'DONE · ' + ms + ' MS · ' + best.length + ' RANKED';
      rankSort = true;
      if (state.cat === 'ALL') state.cat = 'BEST';
      buildCats();
      renderIndList();
      toast('TOP: ' + best.slice(0, 3).map(function (id) {
        return (byId[id] ? byId[id].short : id) + ' ' + ranks[id].wr.toFixed(0) + '%';
      }).join(' · '));
    }
    step();
  }

  function wrBadge(en) {
    var r = ranks[en.id];
    if (!r) return '';
    return '<div class="wr ' + (r.wr >= 50 ? 'hi' : 'lo') + '">' + r.wr.toFixed(0) + '%<span>' + r.trades + 'T</span></div>';
  }

  function renderIndList() {
    var list = $('indList');
    if (!catalogReady) {
      list.innerHTML = '<div class="empty">INDICATOR LIBRARY NOT LOADED</div>';
      return;
    }
    var q = state.iq.trim().toLowerCase();
    var out = [];
    if (state.cat === 'BEST') {
      var ids = Object.keys(ranks).sort(function (a, b) { return ranks[b].wr - ranks[a].wr; });
      for (var k = 0; k < ids.length && out.length < state.indLimit; k++) {
        var be = byId[ids[k]];
        if (!be) continue;
        if (q && (be.name.toLowerCase().indexOf(q) < 0 && be.id.indexOf(q) < 0 && (be.short || '').toLowerCase().indexOf(q) < 0)) continue;
        out.push(be);
      }
    } else {
      for (var i = 0; i < IND.CATALOG.length && out.length < state.indLimit; i++) {
        var e = IND.CATALOG[i];
        if (state.cat !== 'ALL' && e.cat !== state.cat) continue;
        if (q && (e.name.toLowerCase().indexOf(q) < 0 && e.id.indexOf(q) < 0 && (e.short || '').toLowerCase().indexOf(q) < 0)) continue;
        out.push(e);
      }
      if (rankSort && Object.keys(ranks).length) {
        out.sort(function (a, b) { return (ranks[b.id] ? ranks[b.id].wr : -1) - (ranks[a.id] ? ranks[a.id].wr : -1); });
      }
    }
    var html = '';
    for (i = 0; i < out.length; i++) {
      var en = out[i];
      var on = state.active.indexOf(en.id) >= 0;
      var col = (en.plots && en.plots[0] && en.plots[0].color) || '#00E5FF';
      html += '<div class="irow' + (on ? ' on' : '') + '" data-id="' + en.id + '">' +
        '<i class="bar" style="background:' + (on ? col : '') + '"></i>' +
        '<div class="nm"><b>' + en.name + '</b><span>' + en.cat.toUpperCase() + ' · ' + (en.pane === 'osc' ? 'SUB-PANE' : 'OVERLAY') + '</span></div>' +
        wrBadge(en) +
        '<div class="tgl">' + (on ? '✓' : '+') + '</div></div>';
    }
    var matches = state.cat === 'BEST' ? Object.keys(ranks).length : countMatches();
    if (out.length < matches) {
      html += '<div class="more-row" id="moreRow"><div class="nm"><b>LOAD MORE</b><span>' + out.length + ' / ' + matches + '</span></div></div>';
    }
    if (!out.length) html = '<div class="empty">NO MATCH — TAP RANK BY WIN RATE FIRST</div>';
    list.innerHTML = html;

    var rows = list.querySelectorAll('.irow[data-id]');
    for (i = 0; i < rows.length; i++) {
      (function (row) {
        row.onclick = function () { toggleIndicator(row.getAttribute('data-id')); };
      })(rows[i]);
    }
    var more = $('moreRow');
    if (more) more.onclick = function () { state.indLimit += 120; renderIndList(); list.scrollTop = list.scrollTop; };
  }

  function countMatches() {
    var q = state.iq.trim().toLowerCase();
    var n = 0;
    for (var i = 0; i < IND.CATALOG.length; i++) {
      var e = IND.CATALOG[i];
      if (state.cat !== 'ALL' && e.cat !== state.cat) continue;
      if (q && (e.name.toLowerCase().indexOf(q) < 0 && e.id.indexOf(q) < 0 && (e.short || '').toLowerCase().indexOf(q) < 0)) continue;
      n++;
    }
    return n;
  }

  /* ------------------------------- sheet ------------------------------- */
  var sheetOpen = false;
  function openSheet() {
    sheetOpen = true;
    fillSheet();
    $('sheetVeil').classList.add('on');
    $('sheet').classList.add('on');
  }
  function closeSheet() {
    sheetOpen = false;
    $('sheetVeil').classList.remove('on');
    $('sheet').classList.remove('on');
  }
  function fillSheet() {
    var st = feed.status;
    $('sheetTitle').textContent = 'UPLINK STATUS';
    $('sheetSub').textContent = 'REAL-TIME FEED DIAGNOSTICS';
    $('sheetBtn').textContent = 'RECONNECT STREAM';
    $('sheetBtn').onclick = function () {
      closeSheet();
      toast('RECONNECTING UPLINK');
      feed.retries = 0;
      feed.destroy();
      feed = new Feed();
      bindFeed();
      feed.load(state.symbol, state.tf, 500);
      feed.startMarkets(PAIRS.map(function (p) { return p.s; }));
    };
    $('sheetBody').innerHTML =
      '<div class="kv"><span>PROVIDER</span><b>' + feed.provider().label + '</b></div>' +
      '<div class="kv"><span>STATE</span><b>' + st.toUpperCase() + '</b></div>' +
      '<div class="kv"><span>LATENCY</span><b>' + (feed.latency === null ? '—' : feed.latency + ' ms') + '</b></div>' +
      '<div class="kv"><span>PAIR</span><b>' + state.symbol + '</b></div>' +
      '<div class="kv"><span>INTERVAL</span><b>' + state.tf.toUpperCase() + '</b></div>' +
      '<div class="kv"><span>CANDLES</span><b>' + feed.candles.length + '</b></div>' +
      '<div class="kv"><span>INDICATORS</span><b>' + state.active.length + (catalogReady ? ' / ' + IND.CATALOG.length : '') + '</b></div>';
  }

  /* ------------------------------ accents ------------------------------ */
  function applyAccent(id) {
    var a = ACCENTS.filter(function (x) { return x.id === id; })[0] || ACCENTS[0];
    var r = document.documentElement.style;
    r.setProperty('--acc', a.c);
    r.setProperty('--acc-2', a.c2);
    r.setProperty('--acc-rgb', a.rgb);
    state.accent = id;
    store.set('accent', id);
    var sw = document.querySelectorAll('.sw');
    for (var i = 0; i < sw.length; i++) sw[i].classList.toggle('on', sw[i].getAttribute('data-a') === id);
    if (chart) chart.invalidate();
  }

  function buildSwatches() {
    var el = $('swatches');
    el.innerHTML = '';
    ACCENTS.forEach(function (a) {
      var d = document.createElement('div');
      d.className = 'sw' + (a.id === state.accent ? ' on' : '');
      d.setAttribute('data-a', a.id);
      d.style.background = a.c;
      d.onclick = function () { applyAccent(a.id); };
      el.appendChild(d);
    });
  }

  /* ------------------------------- wiring ------------------------------- */
  function onCandles(list) {
    state.digits = digitsFor(feed.price || (list.length ? list[list.length - 1].c : 0));
    chart.setCandles(list, true);
    chart.setMeta({ digits: state.digits });
    syncPrice();
    veil(false);
    recompute();
    renderPos();
    $('sysCandles').textContent = String(list.length);
  }

  function onCandle(c) {
    chart.setCandles(feed.candles, true);
    syncPrice();
    checkPos(c);
    renderPos();
    scheduleInd();
    if (state.haptic && navigator.vibrate && Date.now() - (state._lastVib || 0) > 900) {
      state._lastVib = Date.now();
      navigator.vibrate(6);
    }
  }

  function switchSymbol(sym) {
    if (sym === state.symbol) return;
    state.symbol = sym;
    store.set('symbol', sym);
    state.lastTicker = null;
    setPairHeader();
    clearTape();
    veil(true, 'ROUTING ' + baseOf(sym) + '/USDT');
    chart.resetView();
    chart.setMeta({ symbol: sym });
    feed.switchSymbol(sym);
    renderMarkets();
    renderPos();
    switchTab('terminal');
  }

  function start() {
    if (chart) return;
    initChart();
    indexCatalog();
    setPairHeader();
    buildTfRow();
    buildCats();
    renderIndList();
    buildSwatches();
    applyAccent(state.accent);

    feed = new Feed();
    feed.on('candles', onCandles);
    feed.on('candle', onCandle);
    feed.on('tick', function () { syncPrice(); });
    feed.on('trade', function (tr) { pushTrade(tr); });
    feed.on('ticker', syncTicker);
    feed.on('status', onStatus);
    feed.on('latency', onLatency);
    feed.on('markets', onMarkets);

    state.digits = digitsFor(1000);
    feed.load(state.symbol, state.tf, 500);
    feed.startMarkets(PAIRS.map(function (p) { return p.s; }));

    // dock
    var btns = document.querySelectorAll('.dock-btn');
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.onclick = function () {
          switchTab(b.getAttribute('data-tab'));
          if (state.haptic && navigator.vibrate) navigator.vibrate(6);
        };
      })(btns[i]);
    }

    // markets search
    var ms = $('mktSearch');
    ms.addEventListener('input', function () { state.mq = ms.value; renderMarkets(); });

    // market row selection
    $('mktList').addEventListener('click', function (e) {
      var row = e.target && e.target.closest ? e.target.closest('.mrow') : null;
      if (row) switchSymbol(row.getAttribute('data-s'));
    });

    // indicator search
    var is = $('indSearch');
    is.addEventListener('input', function () {
      state.iq = is.value;
      state.indLimit = 120;
      renderIndList();
    });

    // pair name → market picker
    $('pairName').onclick = function () { switchTab('markets'); };

    // link pill → diagnostics sheet
    $('linkBtn').onclick = openSheet;
    $('sheetVeil').onclick = closeSheet;
    $('sheetBtn').onclick = function () {
      closeSheet();
      toast('RECONNECTING UPLINK');
      feed.retries = 0;
      feed.destroy();
      feed = new Feed();
      bindFeed();
      feed.load(state.symbol, state.tf, 500);
      feed.startMarkets(PAIRS.map(function (p) { return p.s; }));
    };

    // system actions
    $('btnReconnect').onclick = $('sheetBtn').onclick;
    $('btnClearInd').onclick = function () {
      state.active = [];
      store.set('active', []);
      renderIndList();
      recompute();
      toast('ALL INDICATORS CLEARED');
    };
    $('sysHaptic').onclick = function () {
      state.haptic = !state.haptic;
      store.set('haptic', state.haptic);
      $('sysHaptic').textContent = state.haptic ? 'ON' : 'OFF';
      if (state.haptic && navigator.vibrate) navigator.vibrate(12);
    };
    $('sysHaptic').textContent = state.haptic ? 'ON' : 'OFF';

    // notifications toggle
    $('sysNotif').onclick = toggleNotif;
    try {
      if (window.Android && window.Android.notifGranted && window.Android.notifGranted() && state.notif === false && store.get('notif', null) === null) {
        state.notif = true;
        store.set('notif', true);
      }
    } catch (e) {}
    refreshNotifLabel();

    // position (TP/SL) entry
    $('posBtn').onclick = openPosSheet;

    // win-rate ranker
    $('btnRanks').onclick = runRanks;

    // clock
    setInterval(function () {
      var d = new Date();
      $('clock').textContent = String(d.getUTCHours()).padStart(2, '0') + ':' +
        String(d.getUTCMinutes()).padStart(2, '0') + ':' +
        String(d.getUTCSeconds()).padStart(2, '0');
    }, 1000);

    // visibility: pause rendering work when hidden
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) chart.invalidate();
    });
  }

  function bindFeed() {
    feed.on('candles', onCandles);
    feed.on('candle', onCandle);
    feed.on('tick', function () { syncPrice(); });
    feed.on('trade', function (tr) { pushTrade(tr); });
    feed.on('ticker', syncTicker);
    feed.on('status', onStatus);
    feed.on('latency', onLatency);
    feed.on('markets', onMarkets);
  }

  // Android back button bridge
  window.handleBack = function () {
    if (sheetOpen) { closeSheet(); return 1; }
    if (state.tab !== 'terminal') { switchTab('terminal'); return 1; }
    return 0;
  };

  // minimal debug/testing surface
  window.LTP = {
    candles: function () { return feed ? feed.candles : []; },
    chart: function () { return chart; },
    testHit: function (c) { checkPos(c); return pos; },
    place: function (dir, dist, rr) {
      var p = feed.price; if (!p) return null;
      var s = dir === 'LONG' ? 1 : -1;
      pos = { symbol: state.symbol, dir: dir, entry: p, sl: p - s * dist, tp: p + s * dist * (rr || 2), rr: rr || 2 };
      store.set('pos', pos); renderPos();
      return pos;
    }
  };

  document.addEventListener('DOMContentLoaded', start);
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    // DOMContentLoaded may already have fired inside the WebView
    setTimeout(function () { if (!chart) start(); }, 0);
  }
})();

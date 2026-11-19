/* ================= LET'S TALK PRO — LIVE MARKET FEED =================
   Real-time crypto data with automatic provider failover:
   Binance  ->  Binance Vision  ->  Bybit.
   Exposes: window.Feed */
(function () {
  'use strict';

  var PROVIDERS = [
    { id: 'binance', label: 'BINANCE', ws: 'wss://stream.binance.com:9443', rest: 'https://api.binance.com/api/v3', kind: 'binance' },
    { id: 'binance-vision', label: 'BINANCE VISION', ws: 'wss://data-stream.binance.vision', rest: 'https://data-api.binance.vision/api/v3', kind: 'binance' },
    { id: 'bybit', label: 'BYBIT', ws: 'wss://stream.bybit.com/v5/public/spot', rest: 'https://api.bybit.com/v5/market', kind: 'bybit' }
  ];

  var TF_BYBIT = { '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '4h': '240', '1d': 'D' };

  function nowMs() { return Date.now(); }

  function Feed() {
    this.symbol = 'BTCUSDT';
    this.tf = '15m';
    this.pIdx = 0;
    this.candles = [];
    this.trades = [];
    this.ticker = null;
    this.price = 0;
    this.prevPrice = 0;
    this.cbs = {};
    this.ws = null;
    this.latency = null;
    this.status = 'idle';
    this.retries = 0;
    this.lastMsg = 0;
    this.intentional = false;
    this.watchdog = null;
    this.poller = null;
    this.symbols = [];
    this.tickers = {};
  }

  Feed.prototype.on = function (evt, fn) { this.cbs[evt] = fn; return this; };
  Feed.prototype.emit = function (evt, a, b, c) { if (this.cbs[evt]) { try { this.cbs[evt](a, b, c); } catch (e) { console.error(e); } } };

  Feed.prototype.provider = function () { return PROVIDERS[this.pIdx]; };

  Feed.prototype.setStatus = function (s, extra) {
    this.status = s;
    this.emit('status', { status: s, provider: this.provider().label, latency: this.latency, extra: extra });
  };

  /* ----------------------------- REST ----------------------------- */
  function fetchJson(url, ms) {
    var ctrl = new AbortController();
    var to = setTimeout(function () { ctrl.abort(); }, ms || 9000);
    return fetch(url, { signal: ctrl.signal, cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (j) { clearTimeout(to); return j; })
      .catch(function (e) { clearTimeout(to); throw e; });
  }

  Feed.prototype.fetchCandles = function (symbol, tf, limit) {
    var p = this.provider();
    var self = this;
    if (p.kind === 'bybit') {
      var iv = TF_BYBIT[tf] || '15';
      return fetchJson(p.rest + '/kline?category=spot&symbol=' + symbol + '&interval=' + iv + '&limit=' + limit)
        .then(function (j) {
          var list = (j.result && j.result.list) || [];
          var out = [];
          for (var i = list.length - 1; i >= 0; i--) {
            var r = list[i];
            out.push({ t: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] });
          }
          return out;
        });
    }
    return fetchJson(p.rest + '/klines?symbol=' + symbol + '&interval=' + tf + '&limit=' + limit)
      .then(function (rows) {
        return rows.map(function (r) {
          return { t: r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] };
        });
      });
  };

  Feed.prototype.fetchTickers = function (symbols) {
    var p = this.provider();
    var self = this;
    if (!symbols.length) return Promise.resolve({});
    if (p.kind === 'bybit') {
      return fetchJson(p.rest + '/tickers?category=spot').then(function (j) {
        var list = (j.result && j.result.list) || [];
        var map = {};
        list.forEach(function (t) {
          if (symbols.indexOf(t.symbol) >= 0) {
            map[t.symbol] = {
              c: +t.lastPrice, o: +t.open24h || 0, h: +t.highPrice24h, l: +t.lowPrice24h,
              q: +t.turnover24h, P: t.price24hPcnt ? (parseFloat(t.price24hPcnt) * 100) : 0
            };
          }
        });
        return map;
      });
    }
    var q = encodeURIComponent(JSON.stringify(symbols));
    return fetchJson(p.rest + '/ticker/24hr?symbols=' + q).then(function (rows) {
      var map = {};
      (rows || []).forEach(function (r) {
        map[r.symbol] = { c: +r.lastPrice, o: +r.openPrice, h: +r.highPrice, l: +r.lowPrice, q: +r.quoteVolume, P: +r.priceChangePercent };
      });
      return map;
    }).catch(function () {
      // endpoint variants differ: fall back to per-symbol mini requests
      return Promise.all(symbols.map(function (s) {
        return fetchJson(p.rest + '/ticker/24hr?symbol=' + s)
          .then(function (r) {
            return { symbol: s, c: +r.lastPrice, o: +r.openPrice, h: +r.highPrice, l: +r.lowPrice, q: +r.quoteVolume, P: +r.priceChangePercent };
          }).catch(function () { return null; });
      })).then(function (arr) {
        var m = {};
        arr.forEach(function (r) { if (r) m[r.symbol] = r; });
        return m;
      });
    });
  };

  /* ----------------------------- WS ----------------------------- */
  Feed.prototype._teardown = function () {
    var old = this.ws;
    this.ws = null;
    if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer = null; }
    if (!old) return;
    old.onopen = old.onmessage = old.onerror = old.onclose = null;
    try { old.close(); } catch (e) {}
  };

  Feed.prototype.connect = function () {
    var self = this;
    this.intentional = false;
    var p = this.provider();
    this.setStatus('connecting');
    this._teardown();

    var url;
    if (p.kind === 'binance') {
      url = p.ws + '/stream?streams=' + this._streamPath();
    } else {
      url = p.ws;
    }

    var ws;
    try { ws = new WebSocket(url); } catch (e) { this._retry(); return; }
    this.ws = ws;

    ws.onopen = function () {
      if (self.ws !== ws) return;
      self.retries = 0;
      self.lastMsg = nowMs();
      self.setStatus('live');
      if (p.kind === 'bybit') self._bybitSubscribe();
      self._ping();
    };

    ws.onmessage = function (ev) {
      if (self.ws !== ws) return;
      self.lastMsg = nowMs();
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (p.kind === 'binance') self._onBinance(msg);
      else self._onBybit(msg);
    };

    ws.onerror = function () {
      if (self.ws !== ws) return;
      self.setStatus('unstable');
    };

    ws.onclose = function () {
      if (self.ws !== ws || self.intentional) return;
      self.setStatus('down');
      self._retry();
    };

    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = setInterval(function () {
      if (self.status !== 'live') return;
      if (nowMs() - self.lastMsg > 30000) {
        self._retry(true);
      }
    }, 5000);
  };

  Feed.prototype._streamPath = function () {
    var s = this.symbol.toLowerCase();
    return s + '@kline_' + this.tf + '/' + s + '@trade/' + s + '@miniTicker';
  };

  Feed.prototype._retry = function (immediate) {
    var self = this;
    this.retries++;
    if (this.retries % 4 === 0 && this.pIdx < PROVIDERS.length - 1) {
      this.pIdx++;
      this.setStatus('failover', this.provider().label);
    }
    var delay = immediate ? 200 : Math.min(8000, 600 * Math.pow(1.6, Math.min(this.retries, 6)));
    if (this._retryTimer) clearTimeout(this._retryTimer);
    this._retryTimer = setTimeout(function () {
      if (self.status === 'live') return;
      self.connect();
    }, delay);
  };

  Feed.prototype._ping = function () {
    var self = this;
    if (this._pingTimer) clearInterval(this._pingTimer);
    this._pingTimer = setInterval(function () {
      if (!self.ws || self.ws.readyState !== 1) return;
      var p = self.provider();
      if (p.kind !== 'bybit') return; // binance sends its own ping frames; browsers auto-pong
      try { self.ws.send(JSON.stringify({ op: 'ping' })); } catch (e) {}
    }, 18000);
  };

  Feed.prototype._bybitSubscribe = function () {
    var iv = TF_BYBIT[this.tf] || '15';
    try {
      this.ws.send(JSON.stringify({
        op: 'subscribe',
        args: ['kline.' + iv + '.' + this.symbol, 'publicTrade.' + this.symbol]
      }));
    } catch (e) {}
  };

  Feed.prototype._onBinance = function (msg) {
    var d = msg.data || msg;
    var e = d.e;
    if (e === 'kline') {
      var k = d.k;
      this._latency(d.E);
      this._upsertCandle({ t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v });
      this._setPrice(+k.c);
    } else if (e === 'trade') {
      this._latency(d.E);
      this._addTrade({ p: +d.p, q: +d.q, t: d.T, side: d.m ? -1 : 1 });
      this._setPrice(+d.p);
    } else if (e === '24hrMiniTicker') {
      this._setTicker({ c: +d.c, o: +d.o, h: +d.h, l: +d.l, q: +d.q });
    } else if (msg.result !== undefined && msg.id !== undefined) {
      this._latency(nowMs());
    }
  };

  Feed.prototype._onBybit = function (msg) {
    if (msg.op === 'pong' || msg.ret_msg === 'pong') return;
    var topic = msg.topic || '';
    var data = msg.data || [];
    if (topic.indexOf('kline') === 0) {
      for (var i = 0; i < data.length; i++) {
        var k = data[i];
        this._latency(msg.ts || k.start);
        this._upsertCandle({ t: +k.start, o: +k.open, h: +k.high, l: +k.low, c: +k.close, v: +k.volume });
        this._setPrice(+k.close);
      }
    } else if (topic.indexOf('publicTrade') === 0) {
      for (var j = data.length - 1; j >= 0; j--) {
        var tr = data[j];
        this._addTrade({ p: +tr.p, q: +tr.v, t: +tr.T, side: tr.S === 'Buy' ? 1 : -1 });
      }
      if (data.length) this._setPrice(+data[data.length - 1].p);
    }
  };

  Feed.prototype._latency = function (eventTime) {
    if (!eventTime) return;
    var ms = Math.max(0, nowMs() - eventTime);
    // clock skew can make this negative; treat <3s as plausible network+clock delta
    if (ms < 3000) {
      this.latency = this.latency === null ? ms : Math.round(this.latency * 0.7 + ms * 0.3);
      this.emit('latency', this.latency);
    }
  };

  Feed.prototype._setPrice = function (p) {
    if (!p || !isFinite(p)) return;
    this.prevPrice = this.price;
    this.price = p;
    this.emit('tick', { price: p, prev: this.prevPrice });

    // optimistic last-candle update: chart moves on every trade, not on bar close
    var c = this.candles[this.candles.length - 1];
    if (c && p) {
      c.c = p;
      if (p > c.h) c.h = p;
      if (p < c.l) c.l = p;
      this.emit('candle', c);
    }
  };

  Feed.prototype._upsertCandle = function (nc) {
    var a = this.candles;
    if (!a.length) { a.push(nc); this.emit('candles', a); return; }
    var last = a[a.length - 1];
    if (nc.t === last.t) {
      // keep the traded price if it is fresher than the bar snapshot
      if (nc.c !== last.c && Math.abs(nc.c - last.c) > 0) { last.c = nc.c; }
      last.o = nc.o; last.h = Math.max(nc.h, last.h); last.l = Math.min(nc.l, last.l); last.v = nc.v;
      this.emit('candle', last);
    } else if (nc.t > last.t) {
      a.push(nc);
      if (a.length > 1200) a.shift();
      this.emit('candles', a);
    }
  };

  Feed.prototype._addTrade = function (tr) {
    this.trades.unshift(tr);
    if (this.trades.length > 40) this.trades.length = 40;
    this.emit('trade', tr);
  };

  Feed.prototype._setTicker = function (t) {
    this.ticker = t;
    this.emit('ticker', t);
  };

  /* ----------------------------- API ----------------------------- */
  Feed.prototype.load = function (symbol, tf, limit, quiet) {
    var self = this;
    var seq = (this._loadSeq = (this._loadSeq || 0) + 1);
    this.symbol = symbol;
    this.tf = tf;
    this.candles = [];
    this.trades = [];
    this.price = 0;
    this.setStatus('loading');
    return this.fetchCandles(symbol, tf, limit || 500)
      .then(function (rows) {
        if (seq !== self._loadSeq) return;
        self.candles = rows;
        if (rows.length) self.price = rows[rows.length - 1].c;
        self.emit('candles', rows);
        // keep the live socket when a subscribe message already switched it
        if (quiet && self.ws && self.ws.readyState <= 1) {
          if (self.ws.readyState === 1) self.setStatus('live');
        } else self.connect();
      })
      .catch(function (e) {
        if (seq !== self._loadSeq) return;
        console.error('history failed', e);
        self.setStatus('down', 'history');
        self.connect();
      });
  };

  Feed.prototype.switchSymbol = function (symbol) {
    if (symbol === this.symbol) return;
    if (this.ws && this.ws.readyState === 1) {
      var p = this.provider();
      var oldS = this.symbol.toLowerCase();
      var newS = symbol.toLowerCase();
      if (p.kind === 'binance') {
        this.ws.send(JSON.stringify({ method: 'UNSUBSCRIBE', params: [oldS + '@kline_' + this.tf, oldS + '@trade', oldS + '@miniTicker'], id: 1 }));
        this.ws.send(JSON.stringify({ method: 'SUBSCRIBE', params: [newS + '@kline_' + this.tf, newS + '@trade', newS + '@miniTicker'], id: 2 }));
      } else {
        var iv = TF_BYBIT[this.tf];
        this.ws.send(JSON.stringify({ op: 'unsubscribe', args: ['kline.' + iv + '.' + this.symbol, 'publicTrade.' + this.symbol] }));
      }
    }
    this.load(symbol, this.tf, 500, true);
  };

  Feed.prototype.switchTf = function (tf) {
    if (tf === this.tf) return;
    var oldTf = this.tf;
    this.tf = tf;
    if (this.ws && this.ws.readyState === 1) {
      var p = this.provider();
      var s = this.symbol.toLowerCase();
      if (p.kind === 'binance') {
        this.ws.send(JSON.stringify({ method: 'UNSUBSCRIBE', params: [s + '@kline_' + oldTf], id: 3 }));
        this.ws.send(JSON.stringify({ method: 'SUBSCRIBE', params: [s + '@kline_' + tf], id: 4 }));
      } else {
        var ni = TF_BYBIT[tf];
        this.ws.send(JSON.stringify({ op: 'subscribe', args: ['kline.' + ni + '.' + this.symbol] }));
      }
    }
    this.load(this.symbol, tf, 500, true);
  };

  Feed.prototype.startMarkets = function (symbols) {
    var self = this;
    this.symbols = symbols;
    var poll = function () {
      self.fetchTickers(symbols).then(function (map) {
        for (var k in map) if (map.hasOwnProperty(k)) self.tickers[k] = map[k];
        self.emit('markets', self.tickers);
      }).catch(function () {});
    };
    poll();
    if (this.poller) clearInterval(this.poller);
    this.poller = setInterval(poll, 8000);
  };

  Feed.prototype.destroy = function () {
    this.intentional = true;
    if (this.watchdog) clearInterval(this.watchdog);
    if (this._pingTimer) clearInterval(this._pingTimer);
    if (this._retryTimer) clearTimeout(this._retryTimer);
    if (this.poller) clearInterval(this.poller);
    this._teardown();
  };

  window.Feed = Feed;
})();

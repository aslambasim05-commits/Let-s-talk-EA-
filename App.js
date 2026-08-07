import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, StatusBar } from 'react-native';
import { WebView } from 'react-native-webview';

export default function App() {
  const [selectedSymbol, setSelectedSymbol] = useState('OANDA:XAUUSD');
  const [selectedTimeframe, setSelectedTimeframe] = useState('15');
  const [sessionActive] = useState(true);

  const commodities = [
    { name: 'Gold (XAUUSD)', ticker: 'OANDA:XAUUSD' },
    { name: 'Bitcoin (BTCUSD)', ticker: 'BINANCE:BTCUSDT' },
    { name: 'Silver (XAGUSD)', ticker: 'OANDA:XAGUSD' },
    { name: 'Crude Oil', ticker: 'TVC:USOIL' },
  ];

  const timeframes = ['1', '5', '15', '30', '60'];

  const tradingViewWidgetHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <style>
          body, html { margin: 0; padding: 0; width: 100%; height: 100%; background-color: #05070B; }
        </style>
      </head>
      <body>
        <div class="tradingview-widget-container" style="height:100%;width:100%">
          <div id="tradingview_chart" style="height:100%;width:100%"></div>
          <script type="text/javascript" src="https://s3.tradingview.com/tv.js"></script>
          <script type="text/javascript">
            new TradingView.widget({
              "autosize": true,
              "symbol": "${selectedSymbol}",
              "interval": "${selectedTimeframe}",
              "timezone": "Etc/UTC",
              "theme": "dark",
              "style": "1",
              "locale": "en",
              "toolbar_bg": "#f1f3f6",
              "enable_publishing": false,
              "hide_top_toolbar": false,
              "hide_legend": false,
              "save_image": false,
              "container_id": "tradingview_chart"
            });
          </script>
        </div>
      </body>
    </html>
  `;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#05070B" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>⚡ LET'S TALK V2.11</Text>
        <View style={styles.badgeContainer}>
          <Text style={styles.badgeText}>{sessionActive ? 'SESSION: ACTIVE' : 'CLOSED'}</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.watchlistBar}>
        {commodities.map((item) => (
          <TouchableOpacity
            key={item.ticker}
            style={[styles.watchButton, selectedSymbol === item.ticker && styles.watchButtonActive]}
            onPress={() => setSelectedSymbol(item.ticker)}
          >
            <Text style={[styles.watchText, selectedSymbol === item.ticker && styles.watchTextActive]}>
              {item.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={styles.timeframeBar}>
        {timeframes.map((tf) => (
          <TouchableOpacity
            key={tf}
            style={[styles.tfButton, selectedTimeframe === tf && styles.tfButtonActive]}
            onPress={() => setSelectedTimeframe(tf)}
          >
            <Text style={[styles.tfText, selectedTimeframe === tf && styles.tfTextActive]}>
              {tf}M
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.chartContainer}>
        <WebView
          source={{ html: tradingViewWidgetHtml }}
          style={styles.webView}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          scrollEnabled={false}
        />
      </View>
      <View style={styles.footer}>
        <Text style={styles.footerText}>Target: M15 Engine Active | Push Alerts Enabled</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#05070B' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1A2332' },
  headerTitle: { color: '#FFB800', fontSize: 18, fontWeight: 'bold' },
  badgeContainer: { backgroundColor: '#006400', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: 'bold' },
  watchlistBar: { maxHeight: 50, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#0D1117' },
  watchButton: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#161B22', borderRadius: 6, marginRight: 8, borderWidth: 1, borderColor: '#30363D', height: 32 },
  watchButtonActive: { backgroundColor: '#FFB800', borderColor: '#FFB800' },
  watchText: { color: '#8B949E', fontSize: 12, fontWeight: '600' },
  watchTextActive: { color: '#05070B', fontWeight: 'bold' },
  timeframeBar: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#0D1117', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1A2332' },
  tfButton: { paddingHorizontal: 16, paddingVertical: 4, borderRadius: 4, backgroundColor: '#161B22' },
  tfButtonActive: { backgroundColor: '#00FFCC' },
  tfText: { color: '#8B949E', fontSize: 12, fontWeight: 'bold' },
  tfTextActive: { color: '#05070B' },
  chartContainer: { flex: 1, backgroundColor: '#05070B' },
  webView: { flex: 1, backgroundColor: '#05070B' },
  footer: { padding: 10, alignItems: 'center', backgroundColor: '#0D1117', borderTopWidth: 1, borderTopColor: '#1A2332' },
  footerText: { color: '#8B949E', fontSize: 10 }
});

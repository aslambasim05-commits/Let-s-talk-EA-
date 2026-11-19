package com.lestalk.pro;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

public class MainActivity extends Activity {

    private static final String TAG = "LetsTalkPro";
    private static final String CH = "alerts";
    private WebView web;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.parseColor("#05070B"));
        getWindow().setNavigationBarColor(Color.parseColor("#05070B"));

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#05070B"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#05070B"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setLoadWithOverviewMode(false);
        s.setUseWideViewPort(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Let the bundled file:// app reach the exchange REST API (HTTPS).
        try {
            s.setAllowFileAccessFromFileURLs(true);
            s.setAllowUniversalAccessFromFileURLs(true);
        } catch (Throwable ignored) {
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                s.setForceDark(WebSettings.FORCE_DARK_OFF);
            } catch (Throwable ignored) {
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(false);
        }

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage cm) {
                Log.d(TAG, cm.message() + " @" + cm.lineNumber());
                return true;
            }
        });

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Single-page app: never navigate away from the bundled assets.
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                view.setBackgroundColor(Color.parseColor("#05070B"));
            }
        });

        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        web.addJavascriptInterface(this, "Android");
        web.loadUrl("file:///android_asset/index.html");
    }

    /* ------------------------- JS bridge: notifications ------------------------- */

    @JavascriptInterface
    public boolean notifGranted() {
        return Build.VERSION.SDK_INT < 33
                || checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    @JavascriptInterface
    public void reqNotif() {
        runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= 33) {
                requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 41);
            }
        });
    }

    @JavascriptInterface
    public void notify(String title, String body) {
        runOnUiThread(() -> {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (Build.VERSION.SDK_INT >= 26) {
                nm.createNotificationChannel(new NotificationChannel(CH, "Trading alerts", NotificationManager.IMPORTANCE_HIGH));
            }
            Notification.Builder b = Build.VERSION.SDK_INT >= 26
                    ? new Notification.Builder(this, CH)
                    : new Notification.Builder(this);
            b.setSmallIcon(android.R.drawable.stat_notify_sync)
                    .setContentTitle(title == null ? "Let's Talk Pro" : title)
                    .setContentText(body == null ? "" : body)
                    .setAutoCancel(true);
            if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH);
            if (Build.VERSION.SDK_INT < 33 || notifGranted()) {
                nm.notify((int) (System.currentTimeMillis() % 100000), b.build());
            }
        });
    }

    @Override
    public void onBackPressed() {
        // Let the UI swallow back (close sheets / return to terminal) first.
        web.evaluateJavascript(
                "(function(){try{return window.handleBack&&window.handleBack()?'1':'0'}catch(e){return '0'}})()",
                value -> {
                    if (!"\"1\"".equals(value) && !"1".equals(value)) {
                        moveTaskToBack(true);
                    }
                });
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }
}

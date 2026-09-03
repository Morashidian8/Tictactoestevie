package ir.codenull.mabhas17

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.webkit.WebView

/**
 * Single-screen app: loads the bundled offline web app (محاسبات گاز — مبحث ۱۷)
 * from assets. All calculations and data live in assets/pwa/index.html, so the
 * app works fully offline and stays in sync with the web version.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            // allow the bundled app to render at full width, RTL handled by the page
            useWideViewPort = true
            loadWithOverviewMode = true
        }
        setContentView(web)
        web.loadUrl("file:///android_asset/pwa/index.html")
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // navigate back through the in-app screens before exiting
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }
}

package ir.codenull.mabhas17

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import ir.codenull.mabhas17.billing.BazaarAnswer
import ir.codenull.mabhas17.billing.BazaarBilling
import ir.codenull.mabhas17.billing.Gate
import ir.codenull.mabhas17.billing.Gate.allowsPaidContent
import ir.codenull.mabhas17.billing.GateDecision

/**
 * تک‌صفحهٔ اپ: نسخهٔ آفلاینِ وب (محاسبات گاز — مبحث ۱۷) را از assets اجرا
 * می‌کند. همهٔ داده‌ها و محاسبات در assets/pwa/index.html است.
 *
 * تنها چیزی که این‌جا به صفحه اضافه می‌شود، پاسخِ «کاربر به بخش‌های پولی راه
 * دارد یا نه» است. خودِ صفحه دربارهٔ خرید و بازار چیزی نمی‌داند.
 */
class MainActivity : ComponentActivity() {

    private lateinit var web: WebView
    private lateinit var billing: BazaarBilling

    /** آخرین تصمیمِ گیت؛ پلِ جاوااسکریپت همین را می‌خواند. */
    @Volatile
    private var decision: GateDecision = GateDecision.Locked

    private val paywall = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { refreshGate() }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        billing = BazaarBilling(this)

        // تا اولین پاسخِ بازار، تصمیمِ آفلاین را می‌گذاریم. مشترکی که داخل
        // مهلت است اپ را باز می‌بیند حتی اگر بازار کند جواب بدهد.
        decision = offlineDecision()

        web = WebView(this)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            // allow the bundled app to render at full width, RTL handled by the page
            useWideViewPort = true
            loadWithOverviewMode = true
        }
        web.addJavascriptInterface(NativeBridge(), "MabhasNative")
        setContentView(web)
        web.loadUrl("file:///android_asset/pwa/index.html")

        refreshGate()
    }

    override fun onDestroy() {
        billing.release()
        super.onDestroy()
    }

    /** تصمیم بدون پرسیدن از بازار — بر پایهٔ آخرین تأییدِ ذخیره‌شده. */
    private fun offlineDecision(): GateDecision = Gate.decide(
        stored = billing.stored(),
        answer = BazaarAnswer.UNKNOWN,
        nowMillis = System.currentTimeMillis(),
        graceDays = BuildConfig.OFFLINE_GRACE_DAYS,
    )

    private fun refreshGate() {
        billing.refreshEntitlement { answer ->
            val next = Gate.decide(
                stored = billing.stored(),
                answer = answer,
                nowMillis = System.currentTimeMillis(),
                graceDays = BuildConfig.OFFLINE_GRACE_DAYS,
            )
            runOnUiThread {
                val changed = next.allowsPaidContent() != decision.allowsPaidContent()
                decision = next
                // صفحه را فقط وقتی دوباره می‌سازیم که دسترسی واقعاً عوض شده
                // باشد؛ وگرنه کاربرِ وسطِ یک محاسبه ورودی‌هایش را از دست می‌دهد.
                if (changed) web.reload()
            }
        }
    }

    /**
     * پلِ بین کاتلین و صفحه. فقط خواندنی است و هیچ راهی برای تغییرِ وضعیت از
     * سمت جاوااسکریپت ندارد.
     */
    private inner class NativeBridge {

        @JavascriptInterface
        fun isEntitled(): Boolean = decision.allowsPaidContent()

        /** اگر داخل مهلت آفلاین باشیم، چند روز مانده؛ وگرنه صفر. */
        @JavascriptInterface
        fun graceDaysLeft(): Int = (decision as? GateDecision.Grace)?.daysLeft ?: 0

        @JavascriptInterface
        fun openPaywall() {
            runOnUiThread { paywall.launch(Intent(this@MainActivity, PaywallActivity::class.java)) }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // navigate back through the in-app screens before exiting
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }
}

package ir.codenull.mabhas17

import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.TextView
import androidx.activity.ComponentActivity
import ir.codenull.mabhas17.billing.BazaarAnswer
import ir.codenull.mabhas17.billing.BazaarBilling
import ir.codenull.mabhas17.billing.PurchaseOutcome

/**
 * صفحهٔ خرید. کاربر از این‌جا به صفحهٔ پرداختِ خودِ بازار می‌رود؛ قیمت، تمدید و
 * مهلت آزمایشی همه آن‌طرف تعیین می‌شوند.
 */
class PaywallActivity : ComponentActivity() {

    private lateinit var billing: BazaarBilling
    private lateinit var statusView: TextView
    private lateinit var trialView: TextView
    private lateinit var monthlyButton: Button
    private lateinit var lifetimeButton: Button
    private lateinit var restoreButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_paywall)

        billing = BazaarBilling(this)
        statusView = findViewById(R.id.paywall_status)
        trialView = findViewById(R.id.paywall_trial)
        monthlyButton = findViewById(R.id.paywall_monthly)
        lifetimeButton = findViewById(R.id.paywall_lifetime)
        restoreButton = findViewById(R.id.paywall_restore)

        monthlyButton.setOnClickListener {
            buttonsEnabled(false)
            billing.startMonthlySubscription(activityResultRegistry, ::onPurchaseDone)
        }
        lifetimeButton.setOnClickListener {
            buttonsEnabled(false)
            billing.startLifetimePurchase(activityResultRegistry, ::onPurchaseDone)
        }
        restoreButton.setOnClickListener { verifyAndFinishIfEntitled(userAsked = true) }

        showTrialIfAvailable()
    }

    override fun onDestroy() {
        billing.release()
        super.onDestroy()
    }

    /**
     * مهلت آزمایشی را فقط وقتی نشان بده که بازار بگوید این حساب هنوز آن را
     * نگرفته — وگرنه کاربر وعده‌ای می‌بیند که به او داده نمی‌شود.
     */
    private fun showTrialIfAvailable() {
        trialView.visibility = View.GONE
        billing.checkTrial { available, days ->
            runOnUiThread {
                if (available && days > 0) {
                    trialView.text = getString(R.string.paywall_trial, days)
                    trialView.visibility = View.VISIBLE
                }
            }
        }
    }

    private fun onPurchaseDone(outcome: PurchaseOutcome) = runOnUiThread {
        buttonsEnabled(true)
        when (outcome) {
            is PurchaseOutcome.Succeeded -> verifyAndFinishIfEntitled(userAsked = false)
            is PurchaseOutcome.Canceled -> statusView.text = getString(R.string.paywall_canceled)
            is PurchaseOutcome.Failed -> statusView.text = getString(R.string.paywall_failed)
        }
    }

    /**
     * بعد از خرید، وضعیت را دوباره از بازار می‌پرسیم به‌جای اینکه صرفاً به
     * «خرید موفق بود» اعتماد کنیم — همان پرسشی که هر بار اجرای اپ می‌کند، پس
     * حالتی که این‌جا باز شود و آن‌جا بسته، وجود ندارد.
     */
    private fun verifyAndFinishIfEntitled(userAsked: Boolean) {
        statusView.text = getString(R.string.paywall_checking)
        billing.refreshEntitlement { answer ->
            runOnUiThread {
                when (answer) {
                    BazaarAnswer.ENTITLED -> {
                        setResult(RESULT_OK)
                        finish()
                    }
                    BazaarAnswer.NOT_ENTITLED ->
                        statusView.text = getString(
                            if (userAsked) R.string.paywall_nothing_to_restore
                            else R.string.paywall_not_active_yet
                        )
                    BazaarAnswer.UNKNOWN ->
                        statusView.text = getString(R.string.paywall_bazaar_unreachable)
                }
            }
        }
    }

    private fun buttonsEnabled(enabled: Boolean) {
        monthlyButton.isEnabled = enabled
        lifetimeButton.isEnabled = enabled
        restoreButton.isEnabled = enabled
    }
}

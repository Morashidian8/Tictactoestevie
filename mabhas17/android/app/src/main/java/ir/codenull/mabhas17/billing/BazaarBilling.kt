package ir.codenull.mabhas17.billing

import android.content.Context
import android.content.SharedPreferences
import androidx.activity.result.ActivityResultRegistry
import ir.cafebazaar.poolakey.Connection
import ir.cafebazaar.poolakey.Payment
import ir.cafebazaar.poolakey.config.PaymentConfiguration
import ir.cafebazaar.poolakey.config.SecurityCheck
import ir.cafebazaar.poolakey.entity.PurchaseInfo
import ir.cafebazaar.poolakey.entity.PurchaseState
import ir.cafebazaar.poolakey.request.PurchaseRequest
import ir.codenull.mabhas17.BuildConfig

/**
 * تنها جایی که با کافه‌بازار حرف می‌زند.
 *
 * پرداخت، تمدید و مهلت آزمایشی هیچ‌کدام این‌جا پیاده نشده‌اند — همه را بازار
 * انجام می‌دهد. کاری که این کلاس می‌کند فقط پرسیدنِ «این کاربر حق استفاده
 * دارد؟» و باز کردنِ صفحهٔ خریدِ بازار است.
 */
class BazaarBilling(context: Context) {

    private val appContext = context.applicationContext

    private val prefs: SharedPreferences =
        appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private val payment = Payment(
        context = appContext,
        config = PaymentConfiguration(
            localSecurityCheck = securityCheck(),
        ),
    )

    private var connection: Connection? = null

    /**
     * بررسیِ محلیِ امضای خرید با کلید عمومیِ پنل بازار.
     *
     * اگر کلید تنظیم نشده باشد بررسی خاموش می‌شود — که برای تست لازم است، ولی
     * برای نسخهٔ منتشرشده یعنی هر کسی می‌تواند پاسخِ خرید را جعل کند. مقدارش
     * با `mabhas17.rsaPublicKey` در `gradle.properties` یا `-P` داده می‌شود.
     */
    private fun securityCheck(): SecurityCheck {
        val key = BuildConfig.BAZAAR_RSA_PUBLIC_KEY
        return if (key.isBlank()) SecurityCheck.Disable
        else SecurityCheck.Enable(rsaPublicKey = key)
    }

    /**
     * وصل شدن به اپ بازار و پرسیدنِ وضعیت.
     *
     * [onResult] همیشه دقیقاً یک‌بار صدا زده می‌شود. اگر اپ بازار نصب نباشد یا
     * سرویس جواب ندهد، نتیجه [BazaarAnswer.UNKNOWN] است نه خطا — تصمیمِ
     * «حالا چه کنیم» با [Gate] است، نه با این‌جا.
     */
    fun refreshEntitlement(onResult: (BazaarAnswer) -> Unit) {
        val once = CallOnce(onResult)
        connection?.disconnect()
        connection = payment.connect {
            connectionSucceed {
                queryEntitlement { answer ->
                    if (answer == BazaarAnswer.ENTITLED) {
                        prefs.edit()
                            .putLong(KEY_LAST_VERIFIED, System.currentTimeMillis())
                            .apply()
                    } else if (answer == BazaarAnswer.NOT_ENTITLED) {
                        // تأییدِ قبلی را پاک کن، وگرنه کسی که لغو کرده با
                        // خاموش‌کردنِ اینترنت مهلت آفلاین می‌گیرد.
                        prefs.edit().remove(KEY_LAST_VERIFIED).apply()
                    }
                    once(answer)
                }
            }
            connectionFailed { once(BazaarAnswer.UNKNOWN) }
            disconnected { once(BazaarAnswer.UNKNOWN) }
        }
    }

    /**
     * اشتراک و خریدِ دائمی، هر دو پرسیده می‌شوند: اشتراک ماهانه از
     * `getSubscribedProducts` و خریدِ دائمی از `getPurchasedProducts`.
     */
    private fun queryEntitlement(onResult: (BazaarAnswer) -> Unit) {
        payment.getSubscribedProducts {
            querySucceed { subscribed ->
                if (subscribed.holds(BuildConfig.SKU_MONTHLY)) {
                    onResult(BazaarAnswer.ENTITLED)
                } else {
                    payment.getPurchasedProducts {
                        querySucceed { purchased ->
                            onResult(
                                if (purchased.holds(BuildConfig.SKU_LIFETIME)) BazaarAnswer.ENTITLED
                                else BazaarAnswer.NOT_ENTITLED
                            )
                        }
                        queryFailed { onResult(BazaarAnswer.UNKNOWN) }
                    }
                }
            }
            queryFailed { onResult(BazaarAnswer.UNKNOWN) }
        }
    }

    private fun List<PurchaseInfo>.holds(sku: String): Boolean = any {
        it.productId == sku && it.purchaseState == PurchaseState.PURCHASED
    }

    /**
     * آیا این کاربر هنوز مهلت آزمایشیِ رایگان دارد؟
     *
     * جوابش از سرورِ بازار می‌آید و به حساب کاربر گره خورده است، نه به گوشی —
     * پس پاک‌کردن و نصبِ دوبارهٔ اپ آن را برنمی‌گرداند.
     */
    fun checkTrial(onResult: (available: Boolean, days: Int) -> Unit) {
        val once = CallOnce<Pair<Boolean, Int>> { onResult(it.first, it.second) }
        payment.checkTrialSubscription {
            checkTrialSubscriptionSucceed { info -> once(info.isAvailable to info.trialPeriodDays) }
            checkTrialSubscriptionFailed { once(false to 0) }
        }
    }

    /** باز کردن صفحهٔ خریدِ بازار برای اشتراک ماهانه. */
    fun startMonthlySubscription(
        registry: ActivityResultRegistry,
        onDone: (PurchaseOutcome) -> Unit,
    ) {
        val once = CallOnce(onDone)
        payment.subscribeProduct(
            registry = registry,
            request = PurchaseRequest(
                productId = BuildConfig.SKU_MONTHLY,
                payload = null,
                dynamicPriceToken = null,
            ),
        ) {
            purchaseSucceed { once(PurchaseOutcome.Succeeded) }
            purchaseCanceled { once(PurchaseOutcome.Canceled) }
            purchaseFailed { t -> once(PurchaseOutcome.Failed(t)) }
            failedToBeginFlow { t -> once(PurchaseOutcome.Failed(t)) }
        }
    }

    /** باز کردن صفحهٔ خریدِ بازار برای خریدِ دائمی. */
    fun startLifetimePurchase(
        registry: ActivityResultRegistry,
        onDone: (PurchaseOutcome) -> Unit,
    ) {
        val once = CallOnce(onDone)
        payment.purchaseProduct(
            registry = registry,
            request = PurchaseRequest(
                productId = BuildConfig.SKU_LIFETIME,
                payload = null,
                dynamicPriceToken = null,
            ),
        ) {
            purchaseSucceed { once(PurchaseOutcome.Succeeded) }
            purchaseCanceled { once(PurchaseOutcome.Canceled) }
            purchaseFailed { t -> once(PurchaseOutcome.Failed(t)) }
            failedToBeginFlow { t -> once(PurchaseOutcome.Failed(t)) }
        }
    }

    /** آخرین تأییدِ ذخیره‌شده، برای وقتی که نمی‌شود از بازار پرسید. */
    fun stored(): StoredEntitlement =
        StoredEntitlement(prefs.getLong(KEY_LAST_VERIFIED, 0L))

    fun release() {
        connection?.disconnect()
        connection = null
    }

    /**
     * کال‌بک‌های Poolakey ممکن است بیش از یک‌بار برسند — مثلاً وقتی اتصال بعد
     * از یک پاسخِ موفق قطع می‌شود. این پوشش تضمین می‌کند رابط کاربری فقط
     * یک‌بار جواب بگیرد.
     */
    private class CallOnce<T>(private val delegate: (T) -> Unit) : (T) -> Unit {
        private var fired = false
        override fun invoke(value: T) {
            if (fired) return
            fired = true
            delegate(value)
        }
    }

    private companion object {
        const val PREFS = "mabhas17_entitlement"
        const val KEY_LAST_VERIFIED = "last_verified_entitled_at"
    }
}

sealed class PurchaseOutcome {
    object Succeeded : PurchaseOutcome()
    object Canceled : PurchaseOutcome()
    data class Failed(val cause: Throwable) : PurchaseOutcome()
}

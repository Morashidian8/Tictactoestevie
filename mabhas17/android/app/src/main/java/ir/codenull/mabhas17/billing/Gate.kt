package ir.codenull.mabhas17.billing

/**
 * تصمیمِ گیت، به‌صورت منطقِ خالص — بدون اندروید، بدون شبکه، بدون بازار.
 *
 * دلیلِ جدا بودنش: این چند خط تعیین می‌کند چه کسی به اپ راه دارد و چه کسی نه.
 * جایی که بشود بدون گوشی و بدون حساب بازار تستش کرد، تنها جایی است که
 * می‌شود مطمئن بود درست کار می‌کند.
 */

/** پاسخِ بازار به «این کاربر حق استفاده دارد؟» */
enum class BazaarAnswer {
    /** بازار جواب داد: بله، اشتراک یا خریدِ دائمیِ فعال دارد. */
    ENTITLED,

    /** بازار جواب داد: نه. (لغو کرده، تمدید نشده، یا هرگز نخریده) */
    NOT_ENTITLED,

    /** نشد پرسید — اپ بازار نصب نیست، آفلاین است، یا سرویس جواب نداد. */
    UNKNOWN,
}

/** آنچه گیت تصمیم می‌گیرد. */
sealed class GateDecision {
    /** دسترسی کامل، چون بازار همین حالا تأیید کرد. */
    object Unlocked : GateDecision()

    /**
     * دسترسی کامل، ولی بدون تأییدِ تازه — با اتکا به تأییدِ قبلی.
     * [daysLeft] برای نمایش هشدارِ نرم به کاربر است.
     */
    data class Grace(val daysLeft: Int) : GateDecision()

    /** فقط بخش‌های رایگان. */
    object Locked : GateDecision()
}

/**
 * وضعیتِ ذخیره‌شده روی دستگاه. فقط یک عدد: آخرین باری که بازار تأیید کرد.
 * صفر یعنی «هرگز تأیید نشده» — که با «تأیید شده ولی خیلی وقت پیش» فرق دارد.
 */
data class StoredEntitlement(val lastVerifiedEntitledAtMillis: Long) {
    val hasEverBeenEntitled: Boolean get() = lastVerifiedEntitledAtMillis > 0L
}

object Gate {

    const val MILLIS_PER_DAY: Long = 24L * 60L * 60L * 1000L

    /**
     * قاعدهٔ مهلت آفلاین، و تنها قاعده‌ای که این‌جا اهمیت دارد:
     *
     * **مهلت فقط به کسی می‌رسد که اشتراکِ فعالش قبلاً یک‌بار تأیید شده باشد.**
     *
     * بدون این شرط، هر نصبِ تازه‌ای می‌توانست با خاموش‌کردنِ اینترنت چند روز
     * رایگان بگیرد، و با پاک‌کردنِ دادهٔ اپ بی‌نهایت بار تکرارش کند.
     *
     * @param stored آخرین تأییدِ ذخیره‌شده
     * @param answer پاسخِ همین حالای بازار
     * @param nowMillis زمان فعلی
     * @param graceDays طول مهلت آفلاین
     */
    fun decide(
        stored: StoredEntitlement,
        answer: BazaarAnswer,
        nowMillis: Long,
        graceDays: Int,
    ): GateDecision = when (answer) {
        BazaarAnswer.ENTITLED -> GateDecision.Unlocked

        // جوابِ صریحِ «نه» مهلت را باطل می‌کند. کسی که لغو کرده و آنلاین است
        // نباید بتواند با مهلتِ آفلاین ادامه بدهد.
        BazaarAnswer.NOT_ENTITLED -> GateDecision.Locked

        BazaarAnswer.UNKNOWN -> {
            if (!stored.hasEverBeenEntitled) {
                GateDecision.Locked
            } else {
                val elapsed = nowMillis - stored.lastVerifiedEntitledAtMillis
                val graceMillis = graceDays.toLong() * MILLIS_PER_DAY
                when {
                    // ساعتِ گوشی به عقب کشیده شده. مهلت را نمی‌دهیم و نمی‌گیریم:
                    // یک بررسیِ آنلاین وضعیت را روشن می‌کند.
                    elapsed < 0L -> GateDecision.Grace(daysLeft = 0)
                    elapsed >= graceMillis -> GateDecision.Locked
                    else -> {
                        val leftMillis = graceMillis - elapsed
                        // رو به بالا: کاربری که ۱۰ ساعت مانده، «۱ روز» می‌بیند نه «۰ روز».
                        val leftDays = ((leftMillis + MILLIS_PER_DAY - 1L) / MILLIS_PER_DAY).toInt()
                        GateDecision.Grace(daysLeft = leftDays)
                    }
                }
            }
        }
    }

    /** آیا این تصمیم به بخش‌های پولی راه می‌دهد؟ */
    fun GateDecision.allowsPaidContent(): Boolean = when (this) {
        is GateDecision.Unlocked -> true
        is GateDecision.Grace -> true
        is GateDecision.Locked -> false
    }
}

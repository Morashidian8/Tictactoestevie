package ir.codenull.mabhas17.billing

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * تستِ همان قاعده‌ای که تعیین می‌کند چه کسی به بخش‌های پولی راه دارد.
 * هیچ‌کدام از این‌ها به گوشی، حساب بازار یا اینترنت نیاز ندارد.
 */
class GateTest {

    private val now = 1_700_000_000_000L
    private val grace = 5
    private fun daysAgo(d: Int) = now - d * Gate.MILLIS_PER_DAY

    private fun decide(stored: Long, answer: BazaarAnswer) =
        Gate.decide(StoredEntitlement(stored), answer, now, grace)

    @Test
    fun `تأیید بازار یعنی باز`() {
        assertEquals(GateDecision.Unlocked, decide(0L, BazaarAnswer.ENTITLED))
    }

    @Test
    fun `جواب صریح نه، مهلت را باطل می‌کند`() {
        // دیروز تأیید شده بود و هنوز داخل مهلت است — ولی بازار الان می‌گوید نه.
        assertEquals(GateDecision.Locked, decide(daysAgo(1), BazaarAnswer.NOT_ENTITLED))
    }

    @Test
    fun `نصب تازه بدون سابقه خرید، صفر روز مهلت دارد`() {
        // این همان سوراخی است که با خاموش‌کردنِ اینترنت و پاک‌کردنِ دادهٔ اپ
        // می‌شد بی‌نهایت بار تکرارش کرد.
        assertEquals(GateDecision.Locked, decide(0L, BazaarAnswer.UNKNOWN))
    }

    @Test
    fun `مشترکِ آفلاین داخل مهلت، دسترسی دارد`() {
        assertEquals(GateDecision.Grace(daysLeft = 3), decide(daysAgo(2), BazaarAnswer.UNKNOWN))
    }

    @Test
    fun `مشترکِ آفلاین بعد از پایان مهلت، بسته می‌شود`() {
        assertEquals(GateDecision.Locked, decide(daysAgo(5), BazaarAnswer.UNKNOWN))
        assertEquals(GateDecision.Locked, decide(daysAgo(9), BazaarAnswer.UNKNOWN))
    }

    @Test
    fun `روز آخرِ مهلت هنوز باز است`() {
        // یک ساعت مانده به پایانِ مهلت.
        val stored = now - (grace * Gate.MILLIS_PER_DAY - 60L * 60L * 1000L)
        assertEquals(GateDecision.Grace(daysLeft = 1), decide(stored, BazaarAnswer.UNKNOWN))
    }

    @Test
    fun `ساعتِ گوشی به عقب کشیده شود، مهلت بی‌نهایت نمی‌شود`() {
        // تأیید «در آینده» — یعنی کاربر ساعت را عقب برده.
        val decision = decide(now + 30L * Gate.MILLIS_PER_DAY, BazaarAnswer.UNKNOWN)
        assertEquals(GateDecision.Grace(daysLeft = 0), decision)
    }

    @Test
    fun `مهلت به بخش‌های پولی راه می‌دهد، قفل نه`() {
        with(Gate) {
            assertEquals(true, GateDecision.Unlocked.allowsPaidContent())
            assertEquals(true, GateDecision.Grace(2).allowsPaidContent())
            assertEquals(false, GateDecision.Locked.allowsPaidContent())
        }
    }
}

package com.morashidian.kindergarten

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import android.view.View
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * پوستهٔ اندرویدِ سامانهٔ مدیریت مهدکودک.
 *
 * ── چرا پوسته و نه اپ بومی ──────────────────────────────────────
 *
 * خواستهٔ مالک محصول دو تکه بود: «نسخهٔ قابل نصب اندروید» و «طوری که
 * با هر آپدیت خودش آپدیت بشه».
 *
 * اپ بومی تکهٔ دوم را نمی‌دهد: هر تغییرِ کوچک یعنی ساختِ APK تازه و
 * نصبِ دستیِ دوباره روی هر گوشی. این پوسته همان برنامهٔ وبی را باز
 * می‌کند که با هر پوش روی GitHub Pages منتشر می‌شود — پس نسخهٔ تازه
 * همان دفعهٔ بعد که اپ باز شود خودش می‌آید، بی هیچ نصبی.
 *
 * آفلاین هم از دست نمی‌رود: سرویس‌ورکرِ خودِ برنامه (`registerType:
 * autoUpdate`) پوسته و دارایی‌ها را پیش‌ذخیره می‌کند. WebView از API ۲۴
 * سرویس‌ورکر را اجرا می‌کند و به همین دلیل `minSdk` همان است.
 *
 * ── آنچه این کلاس واقعاً انجام می‌دهد ──────────────────────────
 *
 * سه چیز که WebViewِ خام ندارد و بدون‌شان اپ ناقص است:
 *
 *   ۱. **انتخاب فایل.** `<input type="file">` در WebView تا وقتی
 *      `onShowFileChooser` را ننویسی، بی‌صداست — یعنی بارگذاری مدرک و
 *      عکس کودک اصلاً کار نمی‌کند.
 *   ۲. **کلید برگشت.** بدونش، کلید برگشتِ گوشی اپ را می‌بندد به‌جای
 *      اینکه یک صفحه عقب برود.
 *   ۳. **حرفِ روشن وقتی اینترنت نیست.** صفحهٔ سفیدِ خالی به کسی
 *      نمی‌گوید چه شده.
 */
class MainActivity : ComponentActivity() {

    private lateinit var web: WebView
    private lateinit var offline: LinearLayout

    /** پاسخِ منتظرِ `<input type="file">`. تا نتیجه نیاید، صفحه گیر است. */
    private var pendingFiles: ValueCallback<Array<Uri>>? = null

    /** نشانیِ عکسی که دوربین قرار است بنویسد. */
    private var cameraShot: Uri? = null

    /** آیا بارگذاری اصلی شکست خورد. خطای یک تصویرِ فرعی به حساب نمی‌آید. */
    private var mainLoadFailed = false

    private val chooser = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        val callback = pendingFiles
        pendingFiles = null
        if (callback == null) return@registerForActivityResult

        /*
         * سه سرچشمه، یک جواب.
         *
         * گالری نشانی را در `data` می‌گذارد، چند-انتخابی در `clipData`،
         * و دوربین هیچ‌کدام — چون از قبل می‌دانستیم کجا بنویسد.
         */
        val picked: Array<Uri>? = when {
            result.resultCode != RESULT_OK -> null
            result.data?.clipData != null -> {
                val clip = result.data!!.clipData!!
                Array(clip.itemCount) { clip.getItemAt(it).uri }
            }
            result.data?.data != null -> arrayOf(result.data!!.data!!)
            cameraShot != null -> arrayOf(cameraShot!!)
            else -> null
        }
        callback.onReceiveValue(picked)
        cameraShot = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        web = findViewById(R.id.web)
        offline = findViewById(R.id.offline)
        findViewById<Button>(R.id.retry).setOnClickListener { load() }

        with(web.settings) {
            javaScriptEnabled = true
            /*
             * بدون این، `localStorage` کار نمی‌کند — و کل حالتِ نسخهٔ
             * نمایشی و نشستِ کاربر همان‌جا می‌نشیند. یعنی اپ هر بار از
             * صفر بالا می‌آمد.
             */
            domStorageEnabled = true
            databaseEnabled = true
            /*
             * حافظهٔ پیش‌فرض، نه «اول از حافظه».
             *
             * `LOAD_CACHE_ELSE_NETWORK` اپ را روی نسخهٔ قدیمی قفل
             * می‌کرد و دقیقاً همان چیزی را می‌شکست که این پوسته برایش
             * ساخته شده: به‌روز ماندن.
             */
            cacheMode = WebSettings.LOAD_DEFAULT
            mediaPlaybackRequiresUserGesture = false
            /*
             * زومِ دو-انگشتی می‌ماند (دسترس‌پذیری)، ولی دکمه‌های زومِ
             * روی صفحه نه — روی نوار پایین می‌افتادند.
             */
            builtInZoomControls = true
            displayZoomControls = false
            useWideViewPort = true
            loadWithOverviewMode = false
        }

        web.setBackgroundColor(0xFFFCF9F4.toInt())
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean {
                val url = request.url
                /*
                 * خودِ برنامه داخل اپ می‌ماند؛ هر چیز دیگری بیرون.
                 *
                 * لینکِ تماس و پیامک و نقشه را اپِ خودش بهتر باز می‌کند،
                 * و سایتِ غریبه‌ای که داخلِ همین پنجره باز شود، کاربر
                 * راهی برای برگشت ندارد جز کلید برگشت.
                 */
                if (url.toString().startsWith(HOME)) return false
                openOutside(url)
                return true
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                mainLoadFailed = false
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError,
            ) {
                // فقط شکستِ خودِ صفحه، نه یک عکسِ نیامده.
                if (!request.isForMainFrame) return
                mainLoadFailed = true
                showOffline(true)
            }

            override fun onPageFinished(view: WebView, url: String?) {
                if (!mainLoadFailed) showOffline(false)
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams,
            ): Boolean {
                pendingFiles?.onReceiveValue(null)
                pendingFiles = callback
                return openPicker(params)
            }
        }

        /*
         * دانلود را به مرورگر/مدیرِ دانلودِ سیستم بسپار.
         *
         * WebView خودش دانلود نمی‌کند و بدون این، لمسِ یک پیوندِ فایل
         * هیچ اتفاقی نمی‌افتد — که از خطا هم بدتر است.
         */
        web.setDownloadListener { url, _, _, _, _ -> openOutside(Uri.parse(url)) }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })

        if (savedInstanceState != null) web.restoreState(savedInstanceState) else load()
        checkForShellUpdate()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    private fun load() {
        showOffline(false)
        web.loadUrl(HOME)
    }

    private fun showOffline(on: Boolean) {
        offline.visibility = if (on) View.VISIBLE else View.GONE
    }

    private fun openOutside(url: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, url))
        } catch (_: ActivityNotFoundException) {
            // اپی برای این نشانی نیست. سکوت، بهتر از افتادنِ اپ.
        }
    }

    /**
     * صفحهٔ انتخاب: گالری، به‌علاوهٔ دوربین وقتی گوشی دوربین دارد.
     *
     * دوربین از راهِ `ACTION_IMAGE_CAPTURE` صدا زده می‌شود و عمداً
     * اجازهٔ `CAMERA` در مانیفست نیست: اگر اپ آن اجازه را **اعلام**
     * کند، اندروید برای همین intent هم اجازهٔ زمانِ-اجرا می‌خواهد. بدونِ
     * اعلام، اپِ دوربین خودش کارش را می‌کند و ما فقط نتیجه را می‌گیریم.
     */
    private fun openPicker(params: WebChromeClient.FileChooserParams): Boolean {
        val gallery = params.createIntent()
        val extras = ArrayList<Intent>()

        if (packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)) {
            val shots = File(cacheDir, "shots").apply { mkdirs() }
            val file = File(shots, "shot-${System.currentTimeMillis()}.jpg")
            val uri = FileProvider.getUriForFile(this, "$packageName.files", file)
            cameraShot = uri
            val capture = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
                .putExtra(MediaStore.EXTRA_OUTPUT, uri)
                .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            if (capture.resolveActivity(packageManager) != null) extras.add(capture)
        }

        val chooserIntent = Intent(Intent.ACTION_CHOOSER)
            .putExtra(Intent.EXTRA_INTENT, gallery)
            .putExtra(Intent.EXTRA_TITLE, getString(R.string.pick_image))
        if (extras.isNotEmpty()) {
            chooserIntent.putExtra(Intent.EXTRA_INITIAL_INTENTS, extras.toTypedArray())
        }

        return try {
            chooser.launch(chooserIntent)
            true
        } catch (_: ActivityNotFoundException) {
            pendingFiles?.onReceiveValue(null)
            pendingFiles = null
            false
        }
    }

    /**
     * به‌روزرسانیِ خودِ پوسته.
     *
     * محتوای برنامه خودش تازه می‌شود و این بررسی به آن کاری ندارد؛ فقط
     * برای وقتی است که همین پوسته عوض شود — که کم پیش می‌آید. پس
     * بی‌صداست: اگر نسخهٔ تازه‌ای نباشد، کاربر هیچ‌وقت چیزی نمی‌بیند.
     *
     * روی نخِ جداست چون شبکه روی نخِ اصلی، اپ را تا سقفِ تایم‌اوت
     * می‌خشکاند.
     */
    private fun checkForShellUpdate() {
        thread(isDaemon = true) {
            val latest = runCatching {
                val connection = (URL(RELEASE_API).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 8000
                    readTimeout = 8000
                    setRequestProperty("Accept", "application/vnd.github+json")
                }
                connection.inputStream.bufferedReader().use { it.readText() }
            }.getOrNull() ?: return@thread

            val tag = runCatching { JSONObject(latest).optString("tag_name") }.getOrNull().orEmpty()
            val newer = tag.removePrefix("android-v").trim()
            if (newer.isEmpty() || newer == BuildConfig.VERSION_NAME) return@thread

            runOnUiThread {
                if (isFinishing || isDestroyed) return@runOnUiThread
                AlertDialog.Builder(this)
                    .setTitle("نسخهٔ تازهٔ اپ")
                    .setMessage("نسخهٔ $newer آمده. محتوای برنامه خودش به‌روز می‌شود؛ این به‌روزرسانی برای خودِ اپ است.")
                    .setPositiveButton("گرفتن") { _, _ -> openOutside(Uri.parse(RELEASE_PAGE)) }
                    .setNegativeButton("بعداً", null)
                    .show()
            }
        }
    }

    private companion object {
        /**
         * نشانیِ زندهٔ برنامه.
         *
         * همان چیزی که گردش‌کارِ `pwa.yml` با هر پوش منتشرش می‌کند. اگر
         * روزی میزبانی عوض شود (بند ۱۰.۲ سند: میزبانی واقعی باید داخل
         * کشور باشد)، فقط همین یک خط عوض می‌شود.
         */
        const val HOME = "https://morashidian8.github.io/Tictactoestevie/kindergarten/"

        const val RELEASE_API =
            "https://api.github.com/repos/Morashidian8/Tictactoestevie/releases/latest"
        const val RELEASE_PAGE =
            "https://github.com/Morashidian8/Tictactoestevie/releases/latest"
    }
}

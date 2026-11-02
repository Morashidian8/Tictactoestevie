plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "com.morashidian.kindergarten"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.morashidian.kindergarten"
        /*
         * API 24 به بالا.
         *
         * پایین‌تر از آن، WebView سرویس‌ورکر را اجرا نمی‌کند — و کل
         * کارکردِ آفلاینِ اپ روی سرویس‌ورکر سوار است. اپی که آفلاین کار
         * نکند، وسط شیفت با اینترنت ضعیفِ مهد بی‌مصرف است (بخش ۱۴.۲).
         */
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        /*
         * کلید امضای ثابت — شرطِ به‌روزرسانی است، نه تزئین.
         *
         * اندروید نسخهٔ تازه را فقط وقتی روی نسخهٔ نصب‌شده می‌نشاند که
         * هر دو با یک کلید امضا شده باشند. کلیدی که هر بار در CI ساخته
         * شود یعنی کاربر هر بار «برنامه نصب نشد» می‌بیند و باید قبلی را
         * پاک کند — و با پاک شدنش، داده‌های داخل مرورگرِ اپ هم می‌رود.
         *
         * اگر در مخزن راز `KEYSTORE_BASE64` تعریف شده باشد، گردش‌کار
         * همان را می‌نویسد؛ وگرنه کلید نمایشیِ کنار همین فایل به کار
         * می‌رود. کلید نمایشی در مخزن عمومی است و رمزش هم معلوم — برای
         * انتشار واقعی باید جایش کلید خصوصی بنشیند.
         */
        create("release") {
            storeFile = file(System.getenv("KEYSTORE_PATH") ?: "../keystore/demo.jks")
            storePassword = System.getenv("KEYSTORE_PASSWORD") ?: "mahdshell"
            keyAlias = System.getenv("KEY_ALIAS") ?: "mahd"
            keyPassword = System.getenv("KEY_PASSWORD") ?: "mahdshell"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        debug {
            applicationIdSuffix = ".debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        // نسخهٔ اپ را از همین‌جا می‌خوانیم؛ در AGP ۸ پیش‌فرض خاموش است.
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.ktx)
}

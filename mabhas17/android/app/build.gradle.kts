plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// امضای نسخهٔ release از متغیرهای محیطی خوانده می‌شود، نه از داخل مخزن.
// اگر keystore در دسترس نباشد، assembleRelease یک APK امضانشده می‌سازد
// (برای تست خوب است، برای انتشار در بازار قابل استفاده نیست).
val keystorePath: String? = System.getenv("MABHAS17_KEYSTORE")
val keystorePassword: String? = System.getenv("MABHAS17_KEYSTORE_PASSWORD")
val keystoreAlias: String? = System.getenv("MABHAS17_KEY_ALIAS")
val keystoreKeyPassword: String? = System.getenv("MABHAS17_KEY_PASSWORD")
val canSignRelease = !keystorePath.isNullOrBlank() && file(keystorePath).exists()

android {
    namespace = "ir.codenull.mabhas17"
    compileSdk = 34

    defaultConfig {
        applicationId = "ir.codenull.mabhas17"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    signingConfigs {
        if (canSignRelease) {
            create("release") {
                storeFile = file(keystorePath!!)
                storePassword = keystorePassword
                keyAlias = keystoreAlias
                keyPassword = keystoreKeyPassword
            }
        }
    }

    buildTypes {
        release {
            if (canSignRelease) {
                signingConfig = signingConfigs.getByName("release")
            }
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions { jvmTarget = "1.8" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
}

pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // Poolakey (کتابخانهٔ پرداخت کافه‌بازار) فقط از JitPack منتشر می‌شود.
        maven { url = uri("https://jitpack.io") }
    }
}

rootProject.name = "Mabhas17Gas"
include(":app")

/*
 * پروژهٔ اندروید، جدا از پروژهٔ PolyBot در ریشهٔ مخزن.
 *
 * دو پروژهٔ گریدل مستقل‌اند و هیچ‌کدام دیگری را نمی‌سازد: ساخت اپ مهد
 * نباید وابسته به وضعیت اپ دیگری باشد که ربطی به آن ندارد.
 */
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
    }
}

rootProject.name = "MahdShell"
include(":app")

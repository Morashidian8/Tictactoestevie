# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class io.facilityos.app.** {
    *** Companion;
}
-keepclasseswithmembers class io.facilityos.app.** {
    kotlinx.serialization.KSerializer serializer(...);
}

package io.facilityos.app.core.model

/**
 * Convert Western digits in a string to Persian digits. Safe to apply to whole display strings —
 * only characters 0-9 are mapped, Persian text and symbols pass through unchanged.
 */
fun String.toFaDigits(): String =
    map { c -> if (c in '0'..'9') ('۰' + (c - '0')) else c }.joinToString("")

fun Int.fa(): String = toString().toFaDigits()

/** Persian (fa) display labels for status enums. */

fun FaultStatus.faLabel(): String = when (this) {
    FaultStatus.OPEN -> "باز"
    FaultStatus.ASSIGNED -> "ارجاع‌شده"
    FaultStatus.IN_PROGRESS -> "در حال انجام"
    FaultStatus.WAITING_PARTS -> "منتظر قطعه"
    FaultStatus.COMPLETED -> "تکمیل‌شده"
    FaultStatus.CLOSED -> "بسته‌شده"
}

fun WorkOrderStatus.faLabel(): String = when (this) {
    WorkOrderStatus.DRAFT -> "پیش‌نویس"
    WorkOrderStatus.SCHEDULED -> "زمان‌بندی‌شده"
    WorkOrderStatus.ASSIGNED -> "ارجاع‌شده"
    WorkOrderStatus.IN_PROGRESS -> "در حال انجام"
    WorkOrderStatus.ON_HOLD -> "متوقف"
    WorkOrderStatus.COMPLETED -> "تکمیل‌شده"
    WorkOrderStatus.CLOSED -> "بسته‌شده"
    WorkOrderStatus.CANCELLED -> "لغوشده"
}

fun ComplianceStatus.faLabel(): String = when (this) {
    ComplianceStatus.COMPLIANT -> "منطبق"
    ComplianceStatus.DUE_SOON -> "نزدیک"
    ComplianceStatus.OVERDUE -> "معوق"
    ComplianceStatus.NON_COMPLIANT -> "نامنطبق"
}

/** Work-order type code → Persian. */
fun workOrderTypeFa(type: String): String = when (type.lowercase()) {
    "pm" -> "پیشگیرانه"
    "cm" -> "اصلاحی"
    "inspection" -> "بازرسی"
    "project" -> "پروژه"
    else -> type
}

/** HSE incident type code → Persian. */
fun hseTypeFa(type: String): String = when (type) {
    "near_miss" -> "شبه‌حادثه"
    "unsafe_act" -> "عمل ناایمن"
    "unsafe_condition" -> "شرایط ناایمن"
    "accident" -> "حادثه"
    "property_damage" -> "خسارت مالی"
    else -> type
}

/** HSE incident status code → Persian. */
fun hseStatusFa(status: String): String = when (status) {
    "open" -> "باز"
    "investigating" -> "در حال بررسی"
    "capa" -> "اقدام اصلاحی"
    "closed" -> "بسته‌شده"
    else -> status
}

/** Utility code → Persian. */
fun utilityFa(utility: String): String = when (utility) {
    "electricity" -> "برق"
    "water" -> "آب"
    "gas" -> "گاز"
    "diesel" -> "گازوئیل"
    else -> utility
}

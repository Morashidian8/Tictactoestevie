package io.facilityos.app.core.report

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import io.facilityos.app.core.database.AssetDao
import io.facilityos.app.core.model.toFaDigits
import io.facilityos.app.data.BuildingRepository
import io.facilityos.app.data.DashboardRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Builds shareable reports entirely offline from the local database:
 *  - an HTML report (Persian, RTL) that any browser can open and "print to PDF",
 *  - a CSV asset export that opens in Excel.
 *
 * Files are written to the app cache (`reports/`) and shared via FileProvider.
 */
@Singleton
class ReportGenerator @Inject constructor(
    @ApplicationContext private val context: Context,
    private val dashboardRepository: DashboardRepository,
    private val buildingRepository: BuildingRepository,
    private val assetDao: AssetDao,
) {
    private val stamp = SimpleDateFormat("yyyyMMdd-HHmm", Locale.US)
    private val human = SimpleDateFormat("yyyy/MM/dd HH:mm", Locale.US)

    private fun dir(): File = File(context.cacheDir, "reports").apply { mkdirs() }

    /** Portfolio HTML report (KPIs + buildings). Returns the written file. */
    suspend fun buildingReportHtml(): File = withContext(Dispatchers.IO) {
        val data = dashboardRepository.observe().first()
        val buildings = buildingRepository.observe("").first()
        val now = human.format(Date())

        val kpis = listOf(
            "ساختمان‌ها" to data.buildings.toString(),
            "تجهیزات" to data.assets.toString(),
            "خرابی‌های باز" to data.openFaults.toString(),
            "خرابی بحرانی" to data.criticalFaults.toString(),
            "تطابق نگهداری پیشگیرانه" to "${data.pmCompliancePct}٪",
            "در دسترس بودن" to "${data.availabilityPct}٪",
            "سلامت دارایی" to "${data.assetHealthScore} از ۱۰۰",
            "امتیاز ریسک" to data.riskScore.toString(),
        )

        val kpiCards = kpis.joinToString("") { (l, v) ->
            "<div class='kpi'><div class='v'>${v.toFaDigits()}</div><div class='l'>$l</div></div>"
        }
        val rows = buildings.joinToString("") { b ->
            val light = when (b.status.name) {
                "OPERATIONAL" -> "#2E7D32"
                "PARTIAL" -> "#F9A825"
                "CRITICAL" -> "#C62828"
                else -> "#9E9E9E"
            }
            "<tr><td><span class='dot' style='background:$light'></span></td>" +
                "<td>${b.name}</td><td>${b.code}</td>" +
                "<td>${b.assetCount.toString().toFaDigits()}</td>" +
                "<td>${b.openFaults.toString().toFaDigits()}</td></tr>"
        }

        val html = """
            <!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
            <title>گزارش ساختمان‌ها</title>
            <style>
              body{font-family:Tahoma,sans-serif;margin:24px;color:#11161f}
              h1{font-size:20px} .sub{color:#666;font-size:13px;margin-bottom:18px}
              .kpis{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px}
              .kpi{border:1px solid #ddd;border-radius:10px;padding:10px 14px;min-width:120px}
              .kpi .v{font-size:22px;font-weight:bold} .kpi .l{font-size:12px;color:#666}
              table{width:100%;border-collapse:collapse} th,td{border:1px solid #ddd;padding:8px;text-align:right;font-size:13px}
              th{background:#f3f4f6} .dot{display:inline-block;width:12px;height:12px;border-radius:50%}
            </style></head><body>
            <h1>گزارش وضعیت ساختمان‌ها — سامانه نگهداری و تعمیرات</h1>
            <div class="sub">تاریخ تولید: ${now.toFaDigits()}</div>
            <div class="kpis">$kpiCards</div>
            <h3>ساختمان‌ها</h3>
            <table><thead><tr><th>وضعیت</th><th>نام</th><th>کد</th><th>تعداد تجهیزات</th><th>خرابی باز</th></tr></thead>
            <tbody>$rows</tbody></table>
            </body></html>
        """.trimIndent()

        File(dir(), "building-report-${stamp.format(Date())}.html").apply { writeText(html) }
    }

    /** Asset export as CSV (UTF-8 BOM so Excel renders Persian correctly). */
    suspend fun assetsCsv(): File = withContext(Dispatchers.IO) {
        val assets = assetDao.observeAll().first()
        val buildings = buildingRepository.observe("").first().associate { it.id to it.name }

        val sb = StringBuilder("﻿") // BOM
        sb.append("کد تجهیز,نام,دسته,ساختمان,بحرانیت,وضعیت\n")
        assets.forEach { a ->
            fun q(s: String) = "\"" + s.replace("\"", "\"\"") + "\""
            sb.append(
                listOf(
                    q(a.assetCode), q(a.name), q(a.categoryName),
                    q(buildings[a.buildingId] ?: ""), q(a.criticality), q(a.statusLabel),
                ).joinToString(","),
            ).append("\n")
        }
        File(dir(), "assets-${stamp.format(Date())}.csv").apply { writeText(sb.toString()) }
    }
}

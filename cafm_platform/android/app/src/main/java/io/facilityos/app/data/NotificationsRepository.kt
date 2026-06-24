package io.facilityos.app.data

import io.facilityos.app.core.database.AssetDao
import io.facilityos.app.core.database.ComplianceDao
import io.facilityos.app.core.database.FaultDao
import io.facilityos.app.core.database.SparePartDao
import io.facilityos.app.core.model.AppNotification
import io.facilityos.app.core.model.ComplianceStatus
import io.facilityos.app.core.model.FaultStatus
import io.facilityos.app.core.model.NotificationSeverity
import io.facilityos.app.core.model.Priority
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Derives the notification feed entirely from local data (no push needed offline): low stock,
 * compliance overdue / expiring certs, critical open faults, and warranty expiry.
 */
@Singleton
class NotificationsRepository @Inject constructor(
    private val assetDao: AssetDao,
    private val complianceDao: ComplianceDao,
    private val sparePartDao: SparePartDao,
    private val faultDao: FaultDao,
) {
    fun observe(): Flow<List<AppNotification>> = combine(
        assetDao.observeAll(),
        complianceDao.observeAll(),
        sparePartDao.observeAll(),
        faultDao.observeAll(),
    ) { assets, compliance, parts, faults ->
        val now = System.currentTimeMillis()
        val day = 24 * 60 * 60 * 1000L
        val out = mutableListOf<AppNotification>()

        faults.filter {
            it.priority == Priority.CRITICAL.name &&
                it.status != FaultStatus.CLOSED.name && it.status != FaultStatus.COMPLETED.name
        }.forEach {
            out += AppNotification(
                "fault-${it.id}", "critical_fault", "Critical fault open", it.title,
                NotificationSeverity.CRITICAL,
            )
        }

        compliance.forEach {
            when (it.status) {
                ComplianceStatus.OVERDUE.name, ComplianceStatus.NON_COMPLIANT.name ->
                    out += AppNotification(
                        "cmp-${it.id}", "compliance", "Compliance ${it.status.lowercase()}",
                        "${it.deviceType} requires attention", NotificationSeverity.CRITICAL,
                    )
                ComplianceStatus.DUE_SOON.name ->
                    out += AppNotification(
                        "cmp-${it.id}", "compliance", "Inspection due soon",
                        it.deviceType, NotificationSeverity.WARNING,
                    )
            }
        }

        parts.filter { it.qty <= it.minQty }.forEach {
            out += AppNotification(
                "part-${it.id}", "low_stock", "Low stock",
                "${it.description} (${it.qty.toInt()}/${it.minQty.toInt()})",
                NotificationSeverity.WARNING,
            )
        }

        assets.filter { it.warrantyEnd != null && it.warrantyEnd in now..(now + 90 * day) }.forEach {
            out += AppNotification(
                "wty-${it.id}", "warranty", "Warranty expiring",
                "${it.name} (${it.assetCode})", NotificationSeverity.WARNING,
            )
        }

        val rank = mapOf(
            NotificationSeverity.CRITICAL to 0,
            NotificationSeverity.WARNING to 1,
            NotificationSeverity.INFO to 2,
        )
        out.sortedBy { rank[it.severity] ?: 9 }
    }
}

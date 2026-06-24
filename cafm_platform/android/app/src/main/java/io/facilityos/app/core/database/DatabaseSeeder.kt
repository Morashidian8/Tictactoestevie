package io.facilityos.app.core.database

import io.facilityos.app.core.model.BuildingStatus
import io.facilityos.app.core.model.ChecklistItemDef
import io.facilityos.app.core.model.ComplianceStatus
import io.facilityos.app.core.model.Criticality
import io.facilityos.app.core.model.FaultStatus
import io.facilityos.app.core.model.Priority
import io.facilityos.app.core.model.ResponseType
import io.facilityos.app.core.model.SyncState
import io.facilityos.app.core.model.WorkOrderStatus
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Seeds the local database on first launch so the app is fully usable **offline**, with no
 * backend. Idempotent: only runs when the building table is empty. Replace/extend with a real
 * import (Excel/CSV) or remove once the sync engine hydrates from a server.
 */
@Singleton
class DatabaseSeeder @Inject constructor(
    private val db: FacilityDatabase,
) {
    suspend fun seedIfEmpty() {
        if (db.buildingDao().count() > 0) return
        seed()
    }

    private suspend fun seed() {
        val buildingDao = db.buildingDao()
        val assetDao = db.assetDao()
        val inspectionDao = db.inspectionDao()
        val faultDao = db.faultDao()

        val now = System.currentTimeMillis()
        val day = 24 * 60 * 60 * 1000L

        // --- Buildings (a representative slice of the 85-building portfolio) ---------------
        val buildings = listOf(
            BuildingEntity("b1", "TWR-A", "Tower A", "King Fahd Rd", 24.7136, 46.6753, 18, 0, 0, now - 2 * day, BuildingStatus.OPERATIONAL.name),
            BuildingEntity("b2", "MALL-B", "Mall B", "Olaya St", 24.6900, 46.6850, 4, 0, 0, now - 21 * day, BuildingStatus.CRITICAL.name),
            BuildingEntity("b3", "CLN-C", "Clinic C", "Takhassusi St", 24.7200, 46.6400, 6, 0, 0, now - 5 * day, BuildingStatus.PARTIAL.name),
            BuildingEntity("b4", "OFF-D", "Office D", "Imam Saud Rd", 24.6500, 46.7100, 12, 0, 0, now - 9 * day, BuildingStatus.OPERATIONAL.name),
            BuildingEntity("b5", "WHS-E", "Warehouse E", "Industrial Area 2", 24.6000, 46.8000, 2, 0, 0, now - 40 * day, BuildingStatus.OPERATIONAL.name),
        )

        // --- Assets per building (across categories, each with a QR code) -----------------
        data class Spec(val cat: String, val name: String, val mfr: String, val model: String, val crit: Criticality)
        val templates = listOf(
            Spec("Vertical Transportation", "Passenger Elevator", "KONE", "MonoSpace 500", Criticality.HIGH),
            Spec("Electrical", "Diesel Generator", "Caterpillar", "3512C", Criticality.CRITICAL),
            Spec("Electrical", "UPS System", "Schneider", "Galaxy VS", Criticality.HIGH),
            Spec("Mechanical", "Chiller", "Trane", "RTAC 140", Criticality.MEDIUM),
            Spec("Fire Protection", "Fire Pump", "Grundfos", "NK 80-250", Criticality.CRITICAL),
            Spec("Mechanical", "AHU", "Daikin", "AHU-M 22", Criticality.LOW),
        )

        val assets = buildList {
            buildings.forEachIndexed { bi, b ->
                templates.forEachIndexed { ai, s ->
                    val code = "${b.code}-${"%03d".format(ai + 1)}"
                    add(
                        AssetEntity(
                            id = "a-${b.id}-$ai",
                            buildingId = b.id,
                            categoryName = s.cat,
                            name = "${s.name} ${ai + 1}",
                            assetCode = code,
                            qrUid = "QR-$code",
                            manufacturer = s.mfr,
                            model = s.model,
                            serialNo = "SN-${b.code}-${1000 + ai}",
                            criticality = s.crit.name,
                            warrantyEnd = now + (180 + ai * 30) * day,
                            statusLabel = "In service",
                        ),
                    )
                }
            }
        }

        // --- A monthly checklist template (id matches AssetDetail's Inspect action) -------
        val template = ChecklistTemplateEntity(
            id = "tmpl-monthly-generic",
            name = "Monthly PM — Generic",
            frequency = "monthly",
            categoryName = null,
            items = listOf(
                ChecklistItemDef("i1", 1, "General condition acceptable?", ResponseType.PASS_FAIL_NA),
                ChecklistItemDef("i2", 2, "No abnormal noise/vibration?", ResponseType.PASS_FAIL_NA),
                ChecklistItemDef("i3", 3, "Operating temperature", ResponseType.NUMERIC, unit = "°C", maxValue = 80.0),
                ChecklistItemDef("i4", 4, "Control panel photo", ResponseType.PHOTO, required = false),
                ChecklistItemDef("i5", 5, "Notes", ResponseType.TEXT, required = false),
            ),
        )

        // Mark one critical asset down to make availability/status realistic.
        val assetsFinal = assets.map {
            if (it.id == "a-b2-4") it.copy(statusLabel = "Down") else it
        }

        // --- Faults: open ones (counts) + resolved ones (so MTTR computes) ----------------
        val faults = listOf(
            FaultEntity("f1", "a-b2-4", "Fire pump fails weekly test", Priority.CRITICAL.name, FaultStatus.OPEN.name, now - day, null, SyncState.SYNCED.name),
            FaultEntity("f2", "a-b2-0", "Elevator 1 door re-opening", Priority.HIGH.name, FaultStatus.ASSIGNED.name, now - 3 * day, null, SyncState.SYNCED.name),
            FaultEntity("f3", "a-b3-2", "UPS battery alarm", Priority.MEDIUM.name, FaultStatus.OPEN.name, now - 6 * day, null, SyncState.SYNCED.name),
            FaultEntity("f4", "a-b1-3", "Chiller low refrigerant", Priority.HIGH.name, FaultStatus.CLOSED.name, now - 20 * day, now - 18 * day, SyncState.SYNCED.name),
            FaultEntity("f5", "a-b4-1", "Generator battery replaced", Priority.MEDIUM.name, FaultStatus.CLOSED.name, now - 30 * day, now - 29 * day, SyncState.SYNCED.name),
        )

        // --- Work orders: PM + CM, mix of completed / overdue (drives PM compliance) ------
        val workOrders = listOf(
            WorkOrderEntity("w1", "WO-1001", "pm", "Monthly PM — Elevator", WorkOrderStatus.COMPLETED.name, "a-b1-0", now - 4 * day, 320.0),
            WorkOrderEntity("w2", "WO-1002", "pm", "Monthly PM — Generator", WorkOrderStatus.COMPLETED.name, "a-b1-1", now - 2 * day, 280.0),
            WorkOrderEntity("w3", "WO-1003", "pm", "Quarterly PM — Chiller", WorkOrderStatus.SCHEDULED.name, "a-b1-3", now - 1 * day, 450.0),
            WorkOrderEntity("w4", "WO-1004", "cm", "Repair fire pump", WorkOrderStatus.IN_PROGRESS.name, "a-b2-4", now + 1 * day, 1200.0),
            WorkOrderEntity("w5", "WO-1005", "pm", "Annual PM — UPS", WorkOrderStatus.ASSIGNED.name, "a-b3-2", now + 5 * day, 600.0),
            WorkOrderEntity("w6", "WO-1006", "pm", "Monthly PM — AHU", WorkOrderStatus.SCHEDULED.name, "a-b5-5", now - 8 * day, 180.0),
        )

        // --- Spare parts (one below reorder level → low-stock alert) ----------------------
        val parts = listOf(
            SparePartEntity("p1", "FLT-AHU-22", "AHU air filter G4", 24.0, 10.0, "WH-A · Rack 3", 18.0),
            SparePartEntity("p2", "BLT-V-1250", "V-belt 1250mm", 6.0, 8.0, "WH-A · Rack 1", 12.5),
            SparePartEntity("p3", "BAT-UPS-12", "UPS battery 12V 9Ah", 40.0, 20.0, "WH-B · Rack 5", 45.0),
            SparePartEntity("p4", "OIL-GEN-15W40", "Engine oil 15W40 (L)", 3.0, 20.0, "WH-A · Bay 2", 6.0),
        )

        // --- HSE incidents ----------------------------------------------------------------
        val incidents = listOf(
            HseIncidentEntity("h1", "b2", "near_miss", "low", "Slippery floor near pump room", "investigating", now - 2 * day),
            HseIncidentEntity("h2", "b1", "unsafe_condition", "medium", "Missing machine guard on AHU", "open", now - 5 * day),
            HseIncidentEntity("h3", "b4", "accident", "high", "Minor electrical burn during panel work", "capa", now - 12 * day),
        )

        // --- Fire compliance items --------------------------------------------------------
        val compliance = listOf(
            ComplianceItemEntity("c1", "a-b2-4", "Fire pump", now - 5 * day, now + 60 * day, ComplianceStatus.OVERDUE.name),
            ComplianceItemEntity("c2", "a-b1-4", "Fire pump", now + 20 * day, now + 200 * day, ComplianceStatus.COMPLIANT.name),
            ComplianceItemEntity("c3", "a-b3-4", "Sprinkler system", now + 10 * day, now + 25 * day, ComplianceStatus.DUE_SOON.name),
            ComplianceItemEntity("c4", "a-b4-4", "Extinguishers", now - 15 * day, now - 3 * day, ComplianceStatus.NON_COMPLIANT.name),
        )

        // --- Utility readings (last 6 months, per building/utility) -----------------------
        val months = listOf("2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06")
        val utilities = buildList {
            buildings.forEach { b ->
                months.forEachIndexed { mi, m ->
                    val base = 12000 + b.id.last().code * 50
                    add(UtilityReadingEntity("u-${b.id}-e$mi", b.id, "electricity", m, base + mi * 300.0, (base + mi * 300.0) * 0.08))
                    add(UtilityReadingEntity("u-${b.id}-w$mi", b.id, "water", m, 800 + mi * 20.0, (800 + mi * 20.0) * 0.5))
                }
            }
        }

        // Recompute denormalised counts on the buildings from the seeded data.
        val openByBuilding = faults
            .filter { it.status != FaultStatus.CLOSED.name }
            .groupingBy { it.assetId.substringBeforeLast('-').removePrefix("a-") }
            .eachCount()
        val assetsByBuilding = assetsFinal.groupingBy { it.buildingId }.eachCount()
        val withCounts = buildings.map { b ->
            b.copy(
                assetCount = assetsByBuilding[b.id] ?: 0,
                openFaults = openByBuilding[b.id] ?: 0,
            )
        }

        buildingDao.upsertAll(withCounts)
        assetDao.upsertAll(assetsFinal)
        inspectionDao.upsertTemplates(listOf(template))
        faultDao.upsertAll(faults)
        db.workOrderDao().upsertAll(workOrders)
        db.sparePartDao().upsertAll(parts)
        db.hseDao().upsertAll(incidents)
        db.complianceDao().upsertAll(compliance)
        db.utilityDao().upsertAll(utilities)
    }
}

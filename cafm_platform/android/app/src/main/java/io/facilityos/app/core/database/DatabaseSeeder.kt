package io.facilityos.app.core.database

import io.facilityos.app.core.model.BuildingStatus
import io.facilityos.app.core.model.ChecklistItemDef
import io.facilityos.app.core.model.Criticality
import io.facilityos.app.core.model.FaultStatus
import io.facilityos.app.core.model.Priority
import io.facilityos.app.core.model.ResponseType
import io.facilityos.app.core.model.SyncState
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

        // --- A couple of open faults to make status counts realistic ----------------------
        val faults = listOf(
            FaultEntity("f1", "a-b2-4", "Fire pump fails weekly test", Priority.CRITICAL.name, FaultStatus.OPEN.name, now - day, SyncState.SYNCED.name),
            FaultEntity("f2", "a-b2-0", "Elevator 1 door re-opening", Priority.HIGH.name, FaultStatus.ASSIGNED.name, now - 3 * day, SyncState.SYNCED.name),
            FaultEntity("f3", "a-b3-2", "UPS battery alarm", Priority.MEDIUM.name, FaultStatus.OPEN.name, now - 6 * day, SyncState.SYNCED.name),
        )

        // Recompute denormalised counts on the buildings from the seeded data.
        val openByBuilding = faults.groupingBy { it.assetId.substringBeforeLast('-').removePrefix("a-") }.eachCount()
        val assetsByBuilding = assets.groupingBy { it.buildingId }.eachCount()
        val withCounts = buildings.map { b ->
            b.copy(
                assetCount = assetsByBuilding[b.id] ?: 0,
                openFaults = openByBuilding[b.id] ?: 0,
            )
        }

        buildingDao.upsertAll(withCounts)
        assetDao.upsertAll(assets)
        inspectionDao.upsertTemplates(listOf(template))
        faultDao.upsertAll(faults)
    }
}

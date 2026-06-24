package io.facilityos.app.core.database

import androidx.room.TypeConverter
import io.facilityos.app.core.model.ChecklistItemDef
import io.facilityos.app.core.model.InspectionResponse
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

/** Room type converters for the JSON-backed list columns. */
class Converters {
    private val json = Json { ignoreUnknownKeys = true }

    @TypeConverter
    fun itemsToJson(items: List<ChecklistItemDef>): String =
        json.encodeToString(ListSerializer(ChecklistItemDef.serializer()), items)

    @TypeConverter
    fun jsonToItems(value: String): List<ChecklistItemDef> =
        json.decodeFromString(ListSerializer(ChecklistItemDef.serializer()), value)

    @TypeConverter
    fun responsesToJson(items: List<InspectionResponse>): String =
        json.encodeToString(ListSerializer(InspectionResponse.serializer()), items)

    @TypeConverter
    fun jsonToResponses(value: String): List<InspectionResponse> =
        json.decodeFromString(ListSerializer(InspectionResponse.serializer()), value)
}

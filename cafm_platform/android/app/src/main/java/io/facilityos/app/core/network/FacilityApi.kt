package io.facilityos.app.core.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/** REST contract mirroring docs/04-api-design.md. */
interface FacilityApi {

    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): TokenResponse

    @GET("buildings")
    suspend fun buildings(): List<BuildingDto>

    @GET("assets")
    suspend fun assets(@Query("filter[building_id]") buildingId: String): List<AssetDto>

    @GET("assets/by-qr/{qr}")
    suspend fun assetByQr(@Path("qr") qrUid: String): AssetDto

    @GET("checklist-templates/{id}")
    suspend fun template(@Path("id") id: String): ChecklistTemplateDto

    @POST("sync/push")
    suspend fun syncPush(@Body body: SyncPushRequest): SyncPushResponse

    @GET("sync/pull")
    suspend fun syncPull(@Query("since") since: Long): SyncPullResponse
}

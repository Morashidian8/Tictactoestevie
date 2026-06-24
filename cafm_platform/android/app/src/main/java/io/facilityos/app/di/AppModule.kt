package io.facilityos.app.di

import android.content.Context
import androidx.room.Room
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import io.facilityos.app.BuildConfig
import io.facilityos.app.core.database.FacilityDatabase
import io.facilityos.app.core.network.AuthInterceptor
import io.facilityos.app.core.network.FacilityApi
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): FacilityDatabase =
        Room.databaseBuilder(context, FacilityDatabase::class.java, "facilityos.db")
            // Production: wrap with SQLCipher SupportFactory (see docs/08-security.md).
            .fallbackToDestructiveMigration()
            .build()

    @Provides @Singleton fun buildingDao(db: FacilityDatabase) = db.buildingDao()
    @Provides @Singleton fun assetDao(db: FacilityDatabase) = db.assetDao()
    @Provides @Singleton fun inspectionDao(db: FacilityDatabase) = db.inspectionDao()
    @Provides @Singleton fun faultDao(db: FacilityDatabase) = db.faultDao()
    @Provides @Singleton fun workOrderDao(db: FacilityDatabase) = db.workOrderDao()
    @Provides @Singleton fun sparePartDao(db: FacilityDatabase) = db.sparePartDao()
    @Provides @Singleton fun hseDao(db: FacilityDatabase) = db.hseDao()
    @Provides @Singleton fun complianceDao(db: FacilityDatabase) = db.complianceDao()
    @Provides @Singleton fun utilityDao(db: FacilityDatabase) = db.utilityDao()
    @Provides @Singleton fun syncDao(db: FacilityDatabase) = db.syncDao()

    @Provides
    @Singleton
    fun provideJson(): Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    @Provides
    @Singleton
    fun provideOkHttp(authInterceptor: AuthInterceptor): OkHttpClient =
        OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .addInterceptor(
                HttpLoggingInterceptor().apply {
                    level = if (BuildConfig.DEBUG) {
                        HttpLoggingInterceptor.Level.BODY
                    } else {
                        HttpLoggingInterceptor.Level.NONE
                    }
                },
            )
            .build()

    @Provides
    @Singleton
    fun provideRetrofit(client: OkHttpClient, json: Json): Retrofit =
        Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()

    @Provides
    @Singleton
    fun provideApi(retrofit: Retrofit): FacilityApi = retrofit.create(FacilityApi::class.java)
}

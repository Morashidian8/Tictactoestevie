package io.facilityos.app

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import dagger.hilt.android.HiltAndroidApp
import io.facilityos.app.core.database.DatabaseSeeder
import io.facilityos.app.core.sync.SyncScheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Application entry point.
 *
 * On startup it seeds the local database so the app is usable **offline** with no backend, then
 * (only when remote sync is enabled) schedules background sync. The [HiltWorkerFactory] lets
 * WorkManager inject dependencies into [io.facilityos.app.core.sync.SyncWorker].
 */
@HiltAndroidApp
class FacilityOsApp : Application(), Configuration.Provider {

    @Inject lateinit var workerFactory: HiltWorkerFactory
    @Inject lateinit var syncScheduler: SyncScheduler
    @Inject lateinit var seeder: DatabaseSeeder

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()

    override fun onCreate() {
        super.onCreate()
        appScope.launch {
            seeder.seedIfEmpty()
            syncScheduler.schedulePeriodicSync() // no-op while offline mode is on
        }
    }
}

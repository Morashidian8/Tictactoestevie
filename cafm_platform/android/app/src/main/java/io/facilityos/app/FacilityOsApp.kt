package io.facilityos.app

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import dagger.hilt.android.HiltAndroidApp
import io.facilityos.app.core.sync.SyncScheduler
import javax.inject.Inject

/**
 * Application entry point.
 *
 * Provides the Hilt-aware [HiltWorkerFactory] so [androidx.work.WorkManager] can inject
 * dependencies into the offline [io.facilityos.app.core.sync.SyncWorker], and schedules
 * the periodic background sync on startup.
 */
@HiltAndroidApp
class FacilityOsApp : Application(), Configuration.Provider {

    @Inject lateinit var workerFactory: HiltWorkerFactory
    @Inject lateinit var syncScheduler: SyncScheduler

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()

    override fun onCreate() {
        super.onCreate()
        syncScheduler.schedulePeriodicSync()
    }
}

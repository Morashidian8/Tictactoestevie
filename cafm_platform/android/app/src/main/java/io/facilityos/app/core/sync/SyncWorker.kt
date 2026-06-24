package io.facilityos.app.core.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

/**
 * Durable background sync. Survives app death/restart; WorkManager retries with backoff while
 * offline. Scheduled by [SyncScheduler] (periodic + on connectivity).
 */
@HiltWorker
class SyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val engine: SyncEngine,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result =
        engine.sync().fold(
            onSuccess = { Result.success() },
            onFailure = { Result.retry() },
        )

    companion object {
        const val UNIQUE_PERIODIC = "facilityos_periodic_sync"
        const val ONE_OFF = "facilityos_oneoff_sync"
    }
}

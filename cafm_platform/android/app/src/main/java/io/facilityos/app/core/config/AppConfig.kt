package io.facilityos.app.core.config

import io.facilityos.app.BuildConfig
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Runtime feature flags. [remoteSyncEnabled] gates every network path so the app can run
 * fully offline from the local Room database. Injected (rather than reading BuildConfig
 * directly) so it stays testable and overridable.
 */
@Singleton
class AppConfig @Inject constructor() {
    val remoteSyncEnabled: Boolean = BuildConfig.REMOTE_SYNC_ENABLED
}

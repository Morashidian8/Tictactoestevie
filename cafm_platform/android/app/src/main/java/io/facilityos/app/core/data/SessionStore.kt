package io.facilityos.app.core.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore by preferencesDataStore(name = "session")

/**
 * Holds auth tokens and the signed-in user. In production tokens live in
 * EncryptedSharedPreferences / Keystore (see docs/08-security.md); DataStore is used here for a
 * self-contained offline scaffold.
 */
@Singleton
class SessionStore @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val accessKey = stringPreferencesKey("access_token")
    private val refreshKey = stringPreferencesKey("refresh_token")
    private val nameKey = stringPreferencesKey("user_name")
    private val roleKey = stringPreferencesKey("user_role")

    suspend fun accessToken(): String? =
        context.dataStore.data.map { it[accessKey] }.first()

    /** Persisted display name of the signed-in user (null when signed out). */
    val userName: Flow<String?> = context.dataStore.data.map { it[nameKey] }
    val userRole: Flow<String?> = context.dataStore.data.map { it[roleKey] }

    suspend fun signedInName(): String? = context.dataStore.data.map { it[nameKey] }.first()

    suspend fun signIn(name: String, role: String) {
        context.dataStore.edit {
            it[nameKey] = name
            it[roleKey] = role
        }
    }

    suspend fun save(access: String, refresh: String) {
        context.dataStore.edit {
            it[accessKey] = access
            it[refreshKey] = refresh
        }
    }

    suspend fun clear() {
        context.dataStore.edit { it.clear() }
    }
}

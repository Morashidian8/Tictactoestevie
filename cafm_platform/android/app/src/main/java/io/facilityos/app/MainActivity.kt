package io.facilityos.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import io.facilityos.app.core.designsystem.theme.FacilityOsTheme
import io.facilityos.app.navigation.FacilityOsNavGraph
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            FacilityOsTheme {
                FacilityOsNavGraph()
            }
        }
    }
}

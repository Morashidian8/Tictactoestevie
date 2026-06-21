package com.polybot.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Green = Color(0xFF16C784)
val Red = Color(0xFFEA3943)
private val Indigo = Color(0xFF6366F1)
private val IndigoDark = Color(0xFF818CF8)

private val DarkColors = darkColorScheme(
    primary = IndigoDark,
    secondary = Green,
    background = Color(0xFF0E1117),
    surface = Color(0xFF161A23),
    surfaceVariant = Color(0xFF1E2430),
)

private val LightColors = lightColorScheme(
    primary = Indigo,
    secondary = Green,
    background = Color(0xFFF7F8FA),
    surface = Color(0xFFFFFFFF),
)

@Composable
fun PolyBotTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = Typography(),
        content = content,
    )
}

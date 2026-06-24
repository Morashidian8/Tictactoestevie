package io.facilityos.app.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Apartment
import androidx.compose.material.icons.filled.Assignment
import androidx.compose.material.icons.filled.MonitorHeart
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.SpaceDashboard
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import io.facilityos.app.feature.assets.AssetDetailScreen
import io.facilityos.app.feature.buildings.BuildingDetailScreen
import io.facilityos.app.feature.buildings.BuildingListScreen
import io.facilityos.app.feature.dashboard.DashboardScreen
import io.facilityos.app.feature.inspections.ChecklistRunnerScreen
import io.facilityos.app.feature.modules.ComplianceScreen
import io.facilityos.app.feature.modules.HseScreen
import io.facilityos.app.feature.modules.InventoryScreen
import io.facilityos.app.feature.modules.MapScreen
import io.facilityos.app.feature.modules.MoreScreen
import io.facilityos.app.feature.modules.NotificationsScreen
import io.facilityos.app.feature.modules.UtilitiesScreen
import io.facilityos.app.feature.scan.ScanScreen
import io.facilityos.app.feature.status.StatusCenterScreen
import io.facilityos.app.feature.work.WorkScreen

object Routes {
    const val HOME = "home"
    const val BUILDINGS = "buildings"
    const val WORK = "work"
    const val STATUS = "status"
    const val MORE = "more"

    const val BUILDING_DETAIL = "building/{buildingId}"
    const val ASSET_DETAIL = "asset/{assetId}"
    const val INSPECTION = "inspection/{templateId}/{assetId}"
    const val SCAN = "scan"

    const val INVENTORY = "inventory"
    const val HSE = "hse"
    const val COMPLIANCE = "compliance"
    const val UTILITIES = "utilities"
    const val NOTIFICATIONS = "notifications"
    const val MAP = "map"

    fun buildingDetail(id: String) = "building/$id"
    fun assetDetail(id: String) = "asset/$id"
    fun inspection(templateId: String, assetId: String) = "inspection/$templateId/$assetId"
}

private data class TopDest(val route: String, val label: String, val icon: ImageVector)

private val topDestinations = listOf(
    TopDest(Routes.HOME, "Home", Icons.Default.SpaceDashboard),
    TopDest(Routes.BUILDINGS, "Buildings", Icons.Default.Apartment),
    TopDest(Routes.WORK, "Work", Icons.Default.Assignment),
    TopDest(Routes.STATUS, "Status", Icons.Default.MonitorHeart),
    TopDest(Routes.MORE, "More", Icons.Default.MoreHoriz),
)

@Composable
fun FacilityOsNavGraph(navController: NavHostController = rememberNavController()) {
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = backStackEntry?.destination

    Scaffold(
        bottomBar = {
            NavigationBar {
                topDestinations.forEach { dest ->
                    val selected = currentDestination?.hierarchy?.any { it.route == dest.route } == true
                    NavigationBarItem(
                        selected = selected,
                        onClick = {
                            navController.navigate(dest.route) {
                                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(dest.icon, contentDescription = dest.label) },
                        label = { Text(dest.label) },
                    )
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = Routes.HOME,
            modifier = Modifier.padding(padding),
        ) {
            composable(Routes.HOME) { DashboardScreen() }

            composable(Routes.BUILDINGS) {
                BuildingListScreen(
                    onBuildingClick = { navController.navigate(Routes.buildingDetail(it)) },
                    onScanClick = { navController.navigate(Routes.SCAN) },
                )
            }
            composable(Routes.WORK) { WorkScreen() }
            composable(Routes.STATUS) { StatusCenterScreen() }
            composable(Routes.MORE) { MoreScreen(onNavigate = { navController.navigate(it) }) }

            composable(Routes.BUILDING_DETAIL) {
                BuildingDetailScreen(
                    onAssetClick = { navController.navigate(Routes.assetDetail(it)) },
                    onBack = { navController.popBackStack() },
                )
            }
            composable(Routes.ASSET_DETAIL) {
                AssetDetailScreen(
                    onInspect = { templateId, assetId ->
                        navController.navigate(Routes.inspection(templateId, assetId))
                    },
                    onBack = { navController.popBackStack() },
                )
            }
            composable(Routes.INSPECTION) {
                ChecklistRunnerScreen(onDone = { navController.popBackStack() })
            }
            composable(Routes.SCAN) {
                ScanScreen(
                    onResolved = { assetId ->
                        navController.navigate(Routes.assetDetail(assetId)) {
                            popUpTo(Routes.BUILDINGS)
                        }
                    },
                    onBack = { navController.popBackStack() },
                )
            }

            composable(Routes.INVENTORY) { InventoryScreen(onBack = { navController.popBackStack() }) }
            composable(Routes.HSE) { HseScreen(onBack = { navController.popBackStack() }) }
            composable(Routes.COMPLIANCE) { ComplianceScreen(onBack = { navController.popBackStack() }) }
            composable(Routes.UTILITIES) { UtilitiesScreen(onBack = { navController.popBackStack() }) }
            composable(Routes.NOTIFICATIONS) { NotificationsScreen(onBack = { navController.popBackStack() }) }
            composable(Routes.MAP) {
                MapScreen(
                    onBuildingClick = { navController.navigate(Routes.buildingDetail(it)) },
                    onBack = { navController.popBackStack() },
                )
            }
        }
    }
}

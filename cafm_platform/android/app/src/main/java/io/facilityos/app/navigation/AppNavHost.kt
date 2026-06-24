package io.facilityos.app.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import io.facilityos.app.feature.assets.AssetDetailScreen
import io.facilityos.app.feature.buildings.BuildingDetailScreen
import io.facilityos.app.feature.buildings.BuildingListScreen
import io.facilityos.app.feature.inspections.ChecklistRunnerScreen
import io.facilityos.app.feature.scan.ScanScreen

object Routes {
    const val BUILDINGS = "buildings"
    const val BUILDING_DETAIL = "building/{buildingId}"
    const val ASSET_DETAIL = "asset/{assetId}"
    const val INSPECTION = "inspection/{templateId}/{assetId}"
    const val SCAN = "scan"

    fun buildingDetail(id: String) = "building/$id"
    fun assetDetail(id: String) = "asset/$id"
    fun inspection(templateId: String, assetId: String) = "inspection/$templateId/$assetId"
}

@Composable
fun FacilityOsNavGraph(navController: NavHostController = rememberNavController()) {
    NavHost(navController = navController, startDestination = Routes.BUILDINGS) {
        composable(Routes.BUILDINGS) {
            BuildingListScreen(
                onBuildingClick = { navController.navigate(Routes.buildingDetail(it)) },
                onScanClick = { navController.navigate(Routes.SCAN) },
            )
        }
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
    }
}

package com.kuncikuppi.printguard.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.kuncikuppi.printguard.data.DiskAuditRepository
import com.kuncikuppi.printguard.data.DiskCaptureRepository
import com.kuncikuppi.printguard.data.PrintGuardConfig
import com.kuncikuppi.printguard.data.SettingsDataStore
import com.kuncikuppi.printguard.domain.model.AuditEvent
import com.kuncikuppi.printguard.domain.model.PrintJobCapture
import com.kuncikuppi.printguard.network.EpsonHardwareStatus
import com.kuncikuppi.printguard.network.EpsonTcpClient
import com.kuncikuppi.printguard.parser.EscPosParser
import com.kuncikuppi.printguard.parser.ParsedReceipt
import com.kuncikuppi.printguard.parser.TextAlign as EscTextAlign
import com.kuncikuppi.printguard.service.PrintGuardService
import com.kuncikuppi.printguard.ui.theme.CyanAccent
import com.kuncikuppi.printguard.ui.theme.EmeraldSuccess
import com.kuncikuppi.printguard.ui.theme.KunciPrintGuardTheme
import com.kuncikuppi.printguard.ui.theme.RoseError
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.io.File

class MainActivity : ComponentActivity() {

    private lateinit var settingsDataStore: SettingsDataStore
    private lateinit var captureRepository: DiskCaptureRepository
    private lateinit var auditRepository: DiskAuditRepository
    private val epsonClient = EpsonTcpClient()

    private val requestNotificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (!isGranted) {
            Toast.makeText(this, "Notification permission required for Guard status bar icon", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        settingsDataStore = SettingsDataStore(applicationContext)
        captureRepository = DiskCaptureRepository(applicationContext)
        auditRepository = DiskAuditRepository(applicationContext)

        checkAndRequestPermissions()
        autoStartServiceIfEnabled()

        setContent {
            KunciPrintGuardTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    PrintGuardApp(
                        settingsDataStore = settingsDataStore,
                        captureRepository = captureRepository,
                        auditRepository = auditRepository,
                        epsonClient = epsonClient
                    )
                }
            }
        }
    }

    private fun autoStartServiceIfEnabled() {
        val scope = kotlinx.coroutines.MainScope()
        scope.launch {
            val config = settingsDataStore.configFlow.first()
            if (!PrintGuardService.isServiceRunning && !config.isServiceExplicitlyStopped) {
                PrintGuardService.startService(applicationContext)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        if (::captureRepository.isInitialized) {
            captureRepository.refreshFromDisk()
        }
    }

    private fun checkAndRequestPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                requestNotificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PrintGuardApp(
    settingsDataStore: SettingsDataStore,
    captureRepository: DiskCaptureRepository,
    auditRepository: DiskAuditRepository,
    epsonClient: EpsonTcpClient
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var selectedTab by remember { mutableStateOf(0) }
    val configState by settingsDataStore.configFlow.collectAsState(initial = PrintGuardConfig())
    val capturesList by captureRepository.getAllCaptures().collectAsState(initial = emptyList())
    val auditEventsList by auditRepository.getAllAuditEvents().collectAsState(initial = emptyList())

    var testStatusText by remember { mutableStateOf<String?>(null) }
    var isTestingConnection by remember { mutableStateOf(false) }

    var todayCapturedCount by remember { mutableStateOf(0) }
    var hardwareStatus by remember { mutableStateOf<EpsonHardwareStatus?>(null) }

    // Security Password Dialog States for STOP
    var showStopPinDialog by remember { mutableStateOf(false) }
    var enteredPin by remember { mutableStateOf("") }
    var pinErrorText by remember { mutableStateOf<String?>(null) }

    // Security Password Dialog States for AutoStart Boot Toggle
    var showBootPinDialog by remember { mutableStateOf(false) }
    var pendingBootSetting by remember { mutableStateOf(false) }

    // Change PIN Dialog States
    var showChangePinDialog by remember { mutableStateOf(false) }
    var currentPinInput by remember { mutableStateOf("") }
    var newPinText by remember { mutableStateOf("") }
    var confirmPinText by remember { mutableStateOf("") }
    var changePinErrorText by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(capturesList) {
        todayCapturedCount = captureRepository.getTodayCaptureCount()
    }

    LaunchedEffect(configState.epsonIp, configState.epsonPort) {
        scope.launch {
            hardwareStatus = epsonClient.queryPrinterStatus(configState.epsonIp, configState.epsonPort)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.Print,
                            contentDescription = null,
                            tint = CyanAccent,
                            modifier = Modifier.size(28.dp)
                        )
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text(
                                text = "Kunci Print Guard",
                                style = MaterialTheme.typography.titleMedium.copy(
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 18.sp
                                )
                            )
                            Text(
                                text = "Local TCP Proxy & Failover Service | Web: 9101",
                                style = MaterialTheme.typography.bodySmall.copy(
                                    color = Color.Gray,
                                    fontSize = 11.sp
                                )
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            TabRow(
                selectedTabIndex = selectedTab,
                containerColor = MaterialTheme.colorScheme.surface
            ) {
                Tab(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    text = { Text("Settings & Security") },
                    icon = { Icon(Icons.Default.Settings, contentDescription = null) }
                )
                Tab(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    text = { Text("Inspector (${capturesList.size})") },
                    icon = { Icon(Icons.Default.BugReport, contentDescription = null) }
                )
            }

            when (selectedTab) {
                0 -> SettingsScreen(
                    config = configState,
                    isServiceRunning = PrintGuardService.isServiceRunning,
                    todayCapturedCount = todayCapturedCount,
                    latestJob = capturesList.firstOrNull(),
                    hardwareStatus = hardwareStatus,
                    testStatusText = testStatusText,
                    isTestingConnection = isTestingConnection,
                    onSaveSettings = { ip, port, proxyPort ->
                        scope.launch {
                            settingsDataStore.updateConfig(ip, port, proxyPort)
                            auditRepository.logEvent("CONFIG_UPDATED", "Epson IP set to $ip:$port, proxy port $proxyPort")
                            Toast.makeText(context, "Settings saved", Toast.LENGTH_SHORT).show()
                            if (PrintGuardService.isServiceRunning) {
                                PrintGuardService.startService(context)
                            }
                        }
                    },
                    onTestConnection = { ip, port ->
                        scope.launch {
                            isTestingConnection = true
                            testStatusText = "Connecting to Epson $ip:$port..."
                            val status = epsonClient.queryPrinterStatus(ip, port)
                            isTestingConnection = false
                            hardwareStatus = status
                            testStatusText = if (status.isOnline) {
                                "SUCCESS: Connected to Epson (${status.paperStatus})"
                            } else {
                                "FAILED: Cannot reach Epson printer ($ip:$port)"
                            }
                        }
                    },
                    onStartGuard = {
                        scope.launch {
                            settingsDataStore.setServiceExplicitlyStopped(false)
                            PrintGuardService.startService(context)
                            Toast.makeText(context, "Print Guard Service Started", Toast.LENGTH_SHORT).show()
                        }
                    },
                    onRequestStopGuard = {
                        enteredPin = ""
                        pinErrorText = null
                        showStopPinDialog = true
                    },
                    onRequestToggleAutoStart = { targetSetting ->
                        pendingBootSetting = targetSetting
                        enteredPin = ""
                        pinErrorText = null
                        showBootPinDialog = true
                    },
                    onOpenChangePinDialog = {
                        currentPinInput = ""
                        newPinText = ""
                        confirmPinText = ""
                        changePinErrorText = null
                        showChangePinDialog = true
                    }
                )
                1 -> DiagnosticScreen(
                    captures = capturesList,
                    auditEvents = auditEventsList,
                    captureRepository = captureRepository,
                    contextDir = context.filesDir
                )
            }
        }
    }

    if (showStopPinDialog) {
        AlertDialog(
            onDismissRequest = { showStopPinDialog = false },
            icon = { Icon(Icons.Default.Lock, contentDescription = null, tint = RoseError) },
            title = { Text("Admin PIN Authorization") },
            text = {
                Column {
                    Text("Enter Admin PIN to stop Print Guard proxy service:")
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = enteredPin,
                        onValueChange = { enteredPin = it },
                        label = { Text("Admin PIN") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                        visualTransformation = PasswordVisualTransformation(),
                        modifier = Modifier.fillMaxWidth()
                    )
                    if (pinErrorText != null) {
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(pinErrorText!!, color = RoseError, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (enteredPin == configState.adminPin) {
                            showStopPinDialog = false
                            scope.launch {
                                settingsDataStore.setServiceExplicitlyStopped(true)
                                auditRepository.logEvent("PIN_VERIFICATION_SUCCESS", "Admin PIN verified for service shutdown", pinAuthorized = true)
                                PrintGuardService.stopService(context)
                                Toast.makeText(context, "Print Guard Service Stopped", Toast.LENGTH_SHORT).show()
                            }
                        } else {
                            pinErrorText = "Incorrect Admin PIN! Shutdown blocked."
                            scope.launch {
                                auditRepository.logEvent("PIN_VERIFICATION_FAILED", "Failed attempt to stop Print Guard service with invalid PIN", pinAuthorized = false)
                            }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = RoseError)
                ) {
                    Text("Verify & Stop Service")
                }
            },
            dismissButton = {
                TextButton(onClick = { showStopPinDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    if (showBootPinDialog) {
        AlertDialog(
            onDismissRequest = { showBootPinDialog = false },
            icon = { Icon(Icons.Default.Security, contentDescription = null, tint = CyanAccent) },
            title = { Text("Admin PIN Authorization") },
            text = {
                Column {
                    Text("Enter Admin PIN to change Auto-Start on Boot policy:")
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = enteredPin,
                        onValueChange = { enteredPin = it },
                        label = { Text("Admin PIN") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                        visualTransformation = PasswordVisualTransformation(),
                        modifier = Modifier.fillMaxWidth()
                    )
                    if (pinErrorText != null) {
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(pinErrorText!!, color = RoseError, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (enteredPin == configState.adminPin) {
                            showBootPinDialog = false
                            scope.launch {
                                settingsDataStore.updateSecurityAndBoot(configState.adminPin, pendingBootSetting)
                                auditRepository.logEvent("AUTOSTART_CHANGED", "AutoStart on Boot changed to $pendingBootSetting", pinAuthorized = true)
                                Toast.makeText(context, if (pendingBootSetting) "Auto-start on boot ENABLED" else "Auto-start on boot DISABLED", Toast.LENGTH_SHORT).show()
                            }
                        } else {
                            pinErrorText = "Incorrect Admin PIN!"
                            scope.launch {
                                auditRepository.logEvent("PIN_VERIFICATION_FAILED", "Failed attempt to toggle AutoStart policy with invalid PIN", pinAuthorized = false)
                            }
                        }
                    }
                ) {
                    Text("Verify & Save Setting")
                }
            },
            dismissButton = {
                TextButton(onClick = { showBootPinDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    if (showChangePinDialog) {
        AlertDialog(
            onDismissRequest = { showChangePinDialog = false },
            icon = { Icon(Icons.Default.VpnKey, contentDescription = null, tint = CyanAccent) },
            title = { Text("Change Admin PIN") },
            text = {
                Column {
                    Text("Set a new Admin PIN to protect stopping the Print Guard service:")
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = currentPinInput,
                        onValueChange = { currentPinInput = it },
                        label = { Text("Current Admin PIN") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                        visualTransformation = PasswordVisualTransformation(),
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = newPinText,
                        onValueChange = { newPinText = it },
                        label = { Text("New Admin PIN") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                        visualTransformation = PasswordVisualTransformation(),
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = confirmPinText,
                        onValueChange = { confirmPinText = it },
                        label = { Text("Confirm New Admin PIN") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                        visualTransformation = PasswordVisualTransformation(),
                        modifier = Modifier.fillMaxWidth()
                    )
                    if (changePinErrorText != null) {
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(changePinErrorText!!, color = RoseError, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (currentPinInput != configState.adminPin) {
                            changePinErrorText = "Current PIN is incorrect!"
                        } else if (newPinText.trim().isEmpty()) {
                            changePinErrorText = "New PIN cannot be empty!"
                        } else if (newPinText != confirmPinText) {
                            changePinErrorText = "New PIN and Confirm PIN do not match!"
                        } else {
                            scope.launch {
                                settingsDataStore.updateSecurityAndBoot(newPinText.trim(), configState.autoStartOnBoot)
                                auditRepository.logEvent("PIN_CHANGED", "Admin PIN updated by user", pinAuthorized = true)
                                showChangePinDialog = false
                                Toast.makeText(context, "Admin PIN updated successfully", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                ) {
                    Text("Save New PIN")
                }
            },
            dismissButton = {
                TextButton(onClick = { showChangePinDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}

@Composable
fun SettingsScreen(
    config: PrintGuardConfig,
    isServiceRunning: Boolean,
    todayCapturedCount: Int,
    latestJob: PrintJobCapture?,
    hardwareStatus: EpsonHardwareStatus?,
    testStatusText: String?,
    isTestingConnection: Boolean,
    onSaveSettings: (String, Int, Int) -> Unit,
    onTestConnection: (String, Int) -> Unit,
    onStartGuard: () -> Unit,
    onRequestStopGuard: () -> Unit,
    onRequestToggleAutoStart: (Boolean) -> Unit,
    onOpenChangePinDialog: () -> Unit
) {
    val context = LocalContext.current
    var epsonIpText by remember(config.epsonIp) { mutableStateOf(config.epsonIp) }
    var epsonPortText by remember(config.epsonPort) { mutableStateOf(config.epsonPort.toString()) }
    var proxyPortText by remember(config.localProxyPort) { mutableStateOf(config.localProxyPort.toString()) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = if (isServiceRunning) EmeraldSuccess.copy(alpha = 0.15f) else MaterialTheme.colorScheme.surfaceVariant
            ),
            shape = RoundedCornerShape(12.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = if (isServiceRunning) Icons.Default.CheckCircle else Icons.Default.PauseCircle,
                    contentDescription = null,
                    tint = if (isServiceRunning) EmeraldSuccess else Color.Gray,
                    modifier = Modifier.size(36.dp)
                )
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                    Text(
                        text = if (isServiceRunning) "Kunci Print Guard ACTIVE 24/7" else "Service Stopped",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                    )
                    Text(
                        text = if (isServiceRunning) "Proxy: 0.0.0.0:${config.localProxyPort} | Web: port 9101" else "Tap Start to launch TCP proxy",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.Gray
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Live Telemetry & Hardware Health",
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold)
                )
                Spacer(modifier = Modifier.height(12.dp))

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Local Proxy Server:", color = Color.Gray)
                    Text(if (isServiceRunning) "Listening (0.0.0.0:${config.localProxyPort})" else "Inactive", fontWeight = FontWeight.Medium)
                }
                Spacer(modifier = Modifier.height(6.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Epson Target IP:", color = Color.Gray)
                    Text("${config.epsonIp}:${config.epsonPort}", fontWeight = FontWeight.Medium)
                }
                Spacer(modifier = Modifier.height(6.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Epson Hardware Sensor:", color = Color.Gray)
                    Text(
                        text = hardwareStatus?.let { if (it.isOnline) "Online (${it.paperStatus})" else "Offline / Unreachable" } ?: "Querying...",
                        fontWeight = FontWeight.Bold,
                        color = if (hardwareStatus?.isOnline == true) EmeraldSuccess else RoseError
                    )
                }
                Spacer(modifier = Modifier.height(6.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Web Dashboard URL:", color = Color.Gray)
                    Text("http://${config.epsonIp.take(11)}:9101", fontWeight = FontWeight.Bold, color = CyanAccent)
                }
                Spacer(modifier = Modifier.height(6.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Captured Jobs Today:", color = Color.Gray)
                    Text("$todayCapturedCount jobs", fontWeight = FontWeight.Bold, color = CyanAccent)
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Security, contentDescription = null, tint = CyanAccent)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Security & Persistence Policy",
                        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold)
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Auto-Start on Device Reboot", fontWeight = FontWeight.Medium, fontSize = 14.sp)
                        Text("Requires Admin PIN to modify", fontSize = 11.sp, color = Color.Gray)
                    }
                    Switch(
                        checked = config.autoStartOnBoot,
                        onCheckedChange = { targetSetting ->
                            onRequestToggleAutoStart(targetSetting)
                        }
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("1-Click Battery Exemption", fontWeight = FontWeight.Medium, fontSize = 14.sp)
                        Text("Exempt app from OS Doze battery limits", fontSize = 11.sp, color = Color.Gray)
                    }
                    OutlinedButton(
                        onClick = {
                            try {
                                val intent = Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                                    data = android.net.Uri.parse("package:${context.packageName}")
                                }
                                context.startActivity(intent)
                            } catch (e: Exception) {
                                val intent = Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                                context.startActivity(intent)
                            }
                        },
                        shape = RoundedCornerShape(6.dp)
                    ) {
                        Icon(Icons.Default.BatteryFull, contentDescription = null, modifier = Modifier.size(16.dp), tint = EmeraldSuccess)
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Exempt", fontSize = 12.sp)
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Admin Protection PIN", fontWeight = FontWeight.Medium, fontSize = 14.sp)
                        Text("Protected against unauthorized service shutdown", fontSize = 11.sp, color = Color.Gray)
                    }
                    OutlinedButton(
                        onClick = onOpenChangePinDialog,
                        shape = RoundedCornerShape(6.dp)
                    ) {
                        Icon(Icons.Default.Edit, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Change PIN", fontSize = 12.sp)
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        Text(
            text = "Printer & Proxy Settings",
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
        )
        Spacer(modifier = Modifier.height(8.dp))

        OutlinedTextField(
            value = epsonIpText,
            onValueChange = { epsonIpText = it },
            label = { Text("Epson Printer IP Address") },
            placeholder = { Text("192.168.8.225") },
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            singleLine = true
        )

        Spacer(modifier = Modifier.height(10.dp))

        Row(modifier = Modifier.fillMaxWidth()) {
            OutlinedTextField(
                value = epsonPortText,
                onValueChange = { epsonPortText = it },
                label = { Text("Epson Port") },
                modifier = Modifier.weight(1f),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true
            )
            Spacer(modifier = Modifier.width(10.dp))
            OutlinedTextField(
                value = proxyPortText,
                onValueChange = { proxyPortText = it },
                label = { Text("Local Proxy Port") },
                modifier = Modifier.weight(1f),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        Button(
            onClick = {
                val p = epsonPortText.toIntOrNull() ?: 9100
                val lp = proxyPortText.toIntOrNull() ?: 9100
                onSaveSettings(epsonIpText, p, lp)
            },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(8.dp)
        ) {
            Icon(Icons.Default.Save, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Save Network Configuration")
        }

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedButton(
            onClick = {
                val p = epsonPortText.toIntOrNull() ?: 9100
                onTestConnection(epsonIpText, p)
            },
            enabled = !isTestingConnection,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(8.dp)
        ) {
            if (isTestingConnection) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Testing Connection...")
            } else {
                Icon(Icons.Default.NetworkCheck, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Test Epson Connection")
            }
        }

        testStatusText?.let { status ->
            Spacer(modifier = Modifier.height(8.dp))
            Surface(
                color = if (status.startsWith("SUCCESS")) EmeraldSuccess.copy(alpha = 0.2f) else RoseError.copy(alpha = 0.2f),
                shape = RoundedCornerShape(6.dp)
            ) {
                Text(
                    text = status,
                    modifier = Modifier.padding(10.dp),
                    style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium)
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        if (isServiceRunning) {
            Button(
                onClick = onRequestStopGuard,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = RoseError),
                shape = RoundedCornerShape(8.dp)
            ) {
                Icon(Icons.Default.Stop, contentDescription = null, tint = Color.White)
                Spacer(modifier = Modifier.width(8.dp))
                Text("STOP PRINT GUARD (Requires PIN)", color = Color.White, fontWeight = FontWeight.Bold)
            }
        } else {
            Button(
                onClick = onStartGuard,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = EmeraldSuccess),
                shape = RoundedCornerShape(8.dp)
            ) {
                Icon(Icons.Default.PlayArrow, contentDescription = null, tint = Color.White)
                Spacer(modifier = Modifier.width(8.dp))
                Text("START PRINT GUARD", color = Color.White, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
fun DiagnosticScreen(
    captures: List<PrintJobCapture>,
    auditEvents: List<AuditEvent>,
    captureRepository: DiskCaptureRepository,
    contextDir: File
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var selectedJobId by remember(captures) { mutableStateOf(captures.firstOrNull()?.id) }
    var selectedFormatTab by remember { mutableStateOf(0) } // 0: Paper Preview, 1: ASCII, 2: HEX, 3: RAW, 4: Audit

    var asciiContent by remember { mutableStateOf("Loading ASCII preview...") }
    var hexContent by remember { mutableStateOf("Loading HEX preview...") }
    var parsedReceipt by remember { mutableStateOf<ParsedReceipt?>(null) }

    val activeJob = captures.find { it.id == selectedJobId } ?: captures.firstOrNull()

    LaunchedEffect(selectedJobId) {
        activeJob?.let { job ->
            asciiContent = captureRepository.getAsciiPreview(job.id)
            hexContent = captureRepository.getHexPreview(job.id)

            val rawFile = File(contextDir, "captures/${job.rawFilename}")
            if (rawFile.exists()) {
                val bytes = rawFile.readBytes()
                parsedReceipt = EscPosParser.parse(bytes)
            } else {
                parsedReceipt = null
            }
        }
    }

    var isZipping by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxSize().padding(12.dp)) {

        Button(
            onClick = {
                scope.launch {
                    isZipping = true
                    val zipUri = captureRepository.exportAllCapturesZip()
                    isZipping = false
                    if (zipUri != null) {
                        val shareIntent = Intent(Intent.ACTION_SEND).apply {
                            type = "application/zip"
                            putExtra(Intent.EXTRA_STREAM, zipUri)
                            putExtra(Intent.EXTRA_SUBJECT, "Kunci Print Guard - Bulk Captures Audit (.zip)")
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        }
                        context.startActivity(Intent.createChooser(shareIntent, "Export All Captures & Audit (.zip)"))
                    } else {
                        Toast.makeText(context, "No captures available to export", Toast.LENGTH_SHORT).show()
                    }
                }
            },
            enabled = !isZipping && captures.isNotEmpty(),
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = EmeraldSuccess),
            shape = RoundedCornerShape(8.dp)
        ) {
            if (isZipping) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Bundling Captures & Audit Logs into ZIP...")
            } else {
                Icon(Icons.Default.Archive, contentDescription = null, tint = Color.White)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Export ALL Captures & Security Log (${captures.size} jobs .ZIP)", color = Color.White, fontWeight = FontWeight.Bold)
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        if (captures.isEmpty()) {
            Box(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Default.Inbox, contentDescription = null, modifier = Modifier.size(64.dp), tint = Color.Gray)
                    Spacer(modifier = Modifier.height(12.dp))
                    Text("No print captures recorded yet.", style = MaterialTheme.typography.bodyLarge, color = Color.Gray)
                    Text("Send a receipt print job from Luna POS to capture payload.", style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                }
            }
            return
        }

        Text("Select Individual Job:", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
        Spacer(modifier = Modifier.height(6.dp))

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
        ) {
            captures.take(25).forEach { job ->
                val isSelected = job.id == activeJob?.id
                FilterChip(
                    selected = isSelected,
                    onClick = { selectedJobId = job.id },
                    label = { Text("${job.capturedAt.takeLast(14).take(8)} (${job.byteCount}B)") },
                    modifier = Modifier.padding(end = 6.dp)
                )
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        activeJob?.let { job ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp)
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Job ID: ${job.id}", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        Text("${job.byteCount} Bytes", fontWeight = FontWeight.Bold, color = CyanAccent, fontSize = 13.sp)
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    Text("Captured: ${job.capturedAt}", fontSize = 11.sp, color = Color.Gray)
                    Text("Target: ${job.printerIp}:${job.printerPort}", fontSize = 11.sp, color = Color.Gray)
                    Text("SHA256: ${job.sha256}", fontSize = 10.sp, fontFamily = FontFamily.Monospace, color = Color.LightGray)
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            TabRow(
                selectedTabIndex = selectedFormatTab,
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            ) {
                Tab(selected = selectedFormatTab == 0, onClick = { selectedFormatTab = 0 }, text = { Text("Receipt Preview") })
                Tab(selected = selectedFormatTab == 1, onClick = { selectedFormatTab = 1 }, text = { Text("ASCII Text") })
                Tab(selected = selectedFormatTab == 2, onClick = { selectedFormatTab = 2 }, text = { Text("HEX Dump") })
                Tab(selected = selectedFormatTab == 3, onClick = { selectedFormatTab = 3 }, text = { Text("RAW Details") })
                Tab(selected = selectedFormatTab == 4, onClick = { selectedFormatTab = 4 }, text = { Text("Audit (${auditEvents.size})") })
            }

            Spacer(modifier = Modifier.height(8.dp))

            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color(0xFF0F172A))
                    .padding(10.dp)
            ) {
                when (selectedFormatTab) {
                    0 -> { // Paper Receipt Card Preview
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .background(Color(0xFFFFFBEB))
                                .clip(RoundedCornerShape(4.dp))
                                .padding(12.dp)
                                .verticalScroll(rememberScrollState())
                        ) {
                            Column(modifier = Modifier.fillMaxWidth()) {
                                parsedReceipt?.lines?.forEach { line ->
                                    if (line.isCutLine) {
                                        Spacer(modifier = Modifier.height(8.dp))
                                        Text(
                                            text = line.text,
                                            color = Color.Red,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 11.sp,
                                            textAlign = TextAlign.Center,
                                            modifier = Modifier.fillMaxWidth()
                                        )
                                        Spacer(modifier = Modifier.height(8.dp))
                                    } else {
                                        val composeAlign = when (line.align) {
                                            EscTextAlign.CENTER -> TextAlign.Center
                                            EscTextAlign.RIGHT -> TextAlign.End
                                            else -> TextAlign.Start
                                        }
                                        Text(
                                            text = line.text,
                                            color = Color.Black,
                                            fontFamily = FontFamily.Monospace,
                                            fontWeight = if (line.isBold) FontWeight.Bold else FontWeight.Normal,
                                            fontSize = if (line.isDoubleSize) 15.sp else 12.sp,
                                            textAlign = composeAlign,
                                            modifier = Modifier.fillMaxWidth()
                                        )
                                    }
                                }
                            }
                        }
                    }
                    1 -> {
                        Box(modifier = Modifier.verticalScroll(rememberScrollState())) {
                            Text(
                                text = asciiContent,
                                fontFamily = FontFamily.Monospace,
                                fontSize = 12.sp,
                                color = Color(0xFF38BDF8)
                            )
                        }
                    }
                    2 -> {
                        Box(modifier = Modifier.verticalScroll(rememberScrollState()).horizontalScroll(rememberScrollState())) {
                            Text(
                                text = hexContent,
                                fontFamily = FontFamily.Monospace,
                                fontSize = 11.sp,
                                color = Color(0xFFA7F3D0)
                            )
                        }
                    }
                    3 -> {
                        Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                            Text("Filename: ${job.rawFilename}", color = Color.White, fontFamily = FontFamily.Monospace)
                            Spacer(modifier = Modifier.height(6.dp))
                            Text("Source Address: ${job.sourceAddress}", color = Color.White, fontFamily = FontFamily.Monospace)
                            Spacer(modifier = Modifier.height(6.dp))
                            Text("Full SHA256:\n${job.sha256}", color = Color.Yellow, fontFamily = FontFamily.Monospace)
                            Spacer(modifier = Modifier.height(12.dp))
                            Text(
                                "Raw ESC/POS bytes contain exact commands sent by Luna POS.\nUse Export Single RAW to share this specific receipt file.",
                                color = Color.Gray,
                                fontSize = 12.sp
                            )
                        }
                    }
                    4 -> {
                        Box(modifier = Modifier.verticalScroll(rememberScrollState())) {
                            Column {
                                Text("System Security & Lifecycle Audit Log:", color = CyanAccent, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                Spacer(modifier = Modifier.height(8.dp))
                                auditEvents.take(50).forEach { event ->
                                    val eventColor = when {
                                        event.eventType.contains("FAILED") -> RoseError
                                        event.eventType.contains("STOPPED") -> RoseError
                                        event.eventType.contains("SUCCESS") -> EmeraldSuccess
                                        else -> Color.Yellow
                                    }
                                    Text(
                                        text = "[${event.timestamp.take(19).replace("T", " ")}] ${event.eventType}\n  └ ${event.details}",
                                        fontFamily = FontFamily.Monospace,
                                        fontSize = 11.sp,
                                        color = eventColor
                                    )
                                    Spacer(modifier = Modifier.height(6.dp))
                                }
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            OutlinedButton(
                onClick = {
                    val shareUri = captureRepository.getShareableUri(job.id)
                    if (shareUri != null) {
                        val shareIntent = Intent(Intent.ACTION_SEND).apply {
                            type = "application/octet-stream"
                            putExtra(Intent.EXTRA_STREAM, shareUri)
                            putExtra(Intent.EXTRA_SUBJECT, "Kunci Print Guard RAW Payload ${job.id}")
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        }
                        context.startActivity(Intent.createChooser(shareIntent, "Share Single RAW Capture"))
                    } else {
                        Toast.makeText(context, "Failed to locate .raw capture file", Toast.LENGTH_SHORT).show()
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(8.dp)
            ) {
                Icon(Icons.Default.Share, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Export Selected Single Receipt (.raw)")
            }
        }
    }
}

import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val printguardProps = Properties().apply {
    val propsFile = rootProject.file("printguard.properties")
    if (propsFile.exists()) {
        propsFile.inputStream().use { load(it) }
    }
}

val defaultAdminPin = printguardProps.getProperty("PRINT_GUARD_ADMIN_PIN", "1011")
val defaultEpsonIp = printguardProps.getProperty("PRINT_GUARD_EPSON_IP", "192.168.8.225")
val defaultEpsonPort = printguardProps.getProperty("PRINT_GUARD_EPSON_PORT", "9100").toInt()
val defaultLocalProxyPort = printguardProps.getProperty("PRINT_GUARD_LOCAL_PROXY_PORT", "9100").toInt()
val defaultWebPort = printguardProps.getProperty("PRINT_GUARD_WEB_PORT", "9101").toInt()

android {
    namespace = "com.kuncikuppi.printguard"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.kuncikuppi.printguard"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }

        buildConfigField("String", "DEFAULT_ADMIN_PIN", "\"$defaultAdminPin\"")
        buildConfigField("String", "DEFAULT_EPSON_IP", "\"$defaultEpsonIp\"")
        buildConfigField("int", "DEFAULT_EPSON_PORT", "$defaultEpsonPort")
        buildConfigField("int", "DEFAULT_LOCAL_PROXY_PORT", "$defaultLocalProxyPort")
        buildConfigField("int", "DEFAULT_WEB_PORT", "$defaultWebPort")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.8"
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("androidx.lifecycle:lifecycle-service:2.7.0")

    val composeBom = platform("androidx.compose:compose-bom:2024.02.00")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.activity:activity-compose:1.8.2")

    implementation("androidx.datastore:datastore-preferences:1.0.0")

    implementation("com.google.code.gson:gson:2.10.1")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
    androidTestImplementation(composeBom)
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}

plugins {
    id("com.android.application")
}

// GitHub Actions가 빌드할 때마다 번호가 올라가서, 새 APK를 기존 앱 위에 덮어 설치할 수 있어요.
val buildNumber = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
// 빌드할 때 최신 GeckoView 버전을 찾아서 넘겨줘요. 못 찾으면 최신 버전을 자동 선택.
val geckoVersion = (findProperty("geckoVersion") as String?)?.takeIf { it.isNotBlank() } ?: "+"

android {
    namespace = "com.horan.malkkeum"
    // GeckoView 159는 안드로이드 API 37.2 이상으로 컴파일해야 해요.
    compileSdk {
        version = release(37) {
            minorApiLevel = 2
        }
    }

    defaultConfig {
        applicationId = "com.horan.malkkeum"
        minSdk = 26
        targetSdk = 35
        versionCode = buildNumber
        versionName = "1.0.$buildNumber"
        // 대부분의 최신 폰은 arm64-v8a. 앱 용량을 줄이려고 이것만 넣어요.
        ndk { abiFilters += listOf("arm64-v8a") }
    }

    // 서명 키: GitHub Actions가 비밀번호(Secrets)로 암호화된 키를 풀어서 경로를 넘겨줌.
    // 키가 없으면(직접 빌드 등) 디버그 키로 서명 → 이 APK는 기존 앱 위에 덮어 설치되지 않음.
    val keystorePath = System.getenv("MALKKEUM_KEYSTORE")
    val keystorePassword = System.getenv("MALKKEUM_KEYSTORE_PASSWORD")
    val hasReleaseKey = keystorePath != null && keystorePassword != null && file(keystorePath).exists()
    signingConfigs {
        create("release") {
            if (hasReleaseKey) {
                storeFile = file(keystorePath!!)
                storePassword = keystorePassword
                keyAlias = "malkkeum"
                keyPassword = keystorePassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (hasReleaseKey) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    // 엔진 파일을 압축해서 넣어 APK 용량을 줄여요.
    packaging {
        jniLibs { useLegacyPackaging = true }
    }

    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("org.mozilla.geckoview:geckoview:$geckoVersion")
}

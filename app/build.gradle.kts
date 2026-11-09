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

    // 항상 같은 키로 서명해야 업데이트가 덮어 설치돼요. (저장소는 비공개로 유지하세요)
    signingConfigs {
        create("release") {
            storeFile = file("malkkeum.keystore")
            storePassword = "malkkeum"
            keyAlias = "malkkeum"
            keyPassword = "malkkeum"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
        debug {
            signingConfig = signingConfigs.getByName("release")
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

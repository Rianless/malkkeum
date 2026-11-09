pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // 파이어폭스 엔진(GeckoView)이 올라와 있는 모질라 저장소
        maven("https://maven.mozilla.org/maven2/")
    }
}

rootProject.name = "Malkkeum"
include(":app")

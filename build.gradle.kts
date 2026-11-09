// GeckoView가 Kotlin 2.4로 만들어져 있어서, 내장 Kotlin 버전을 2.4.20으로 올려요.
buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.4.20")
    }
}

plugins {
    // AGP 9부터 Kotlin 지원이 내장돼서 kotlin-android 플러그인은 따로 넣지 않아요.
    id("com.android.application") version "9.2.0" apply false
}

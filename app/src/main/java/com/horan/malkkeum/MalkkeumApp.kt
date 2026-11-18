package com.horan.malkkeum

import android.app.Application
import android.os.Build
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 앱이 갑자기 꺼질 때 그 이유를 파일로 남겨둠.
 * 다음에 켜면 MainActivity가 보여주고 복사할 수 있게 함 (새 기기에서 안 켜지는 원인 찾기용).
 */
class MalkkeumApp : Application() {
    override fun onCreate() {
        super.onCreate()
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            try {
                val sw = StringWriter()
                error.printStackTrace(PrintWriter(sw))
                val info = buildString {
                    append("[말끔 오류 기록] ")
                    append(SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.KOREA).format(Date()))
                    append("\n기기: ${Build.MANUFACTURER} ${Build.MODEL} / 안드로이드 ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
                    append("\n앱 버전: ${packageManager.getPackageInfo(packageName, 0).versionName}")
                    append("\n스레드: ${thread.name}\n\n")
                    append(sw.toString().take(6000))
                }
                File(filesDir, "last_crash.txt").writeText(info)
            } catch (e: Throwable) { /* 기록 실패는 무시 */ }
            previous?.uncaughtException(thread, error)
        }
    }
}

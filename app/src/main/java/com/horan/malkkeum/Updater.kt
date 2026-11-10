package com.horan.malkkeum

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * 자동 업데이트: 앱을 켤 때 GitHub에 새 버전이 있는지 확인하고,
 * 있으면 알림 → '받기'를 누르면 브라우저로 새 APK 다운로드 (앱이 직접 설치하지 않음 → 다른 앱 설치 권한 불필요)
 */
object Updater {
    private const val TAG = "MalkkeumUpdate"
    private const val API = "https://api.github.com/repos/Rianless/malkkeum/releases/latest"

    private var checkedThisLaunch = false
    private var busy = false

    private fun currentVersion(activity: AppCompatActivity): Long {
        val info = activity.packageManager.getPackageInfo(activity.packageName, 0)
        return if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
    }

    /** manual=true면 '최신 버전이에요'도 알려줌 (제목 길게 누르기) */
    fun check(activity: AppCompatActivity, manual: Boolean = false) {
        if (busy) return
        if (!manual && checkedThisLaunch) return
        checkedThisLaunch = true
        busy = true
        if (manual) Toast.makeText(activity, "새 버전 확인 중…", Toast.LENGTH_SHORT).show()

        Thread {
            try {
                val conn = (URL(API).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 10000
                    readTimeout = 10000
                    setRequestProperty("Accept", "application/vnd.github+json")
                    setRequestProperty("User-Agent", "Malkkeum-Updater")
                }
                val body = conn.inputStream.bufferedReader().use { it.readText() }
                conn.disconnect()
                val json = JSONObject(body)
                val tag = json.optString("tag_name")               // 예: build-28
                val latest = tag.substringAfter("build-", "").toLongOrNull() ?: 0L
                val assets = json.optJSONArray("assets")
                var apkUrl: String? = null
                if (assets != null) {
                    for (i in 0 until assets.length()) {
                        val a = assets.getJSONObject(i)
                        if (a.optString("name").endsWith(".apk")) { apkUrl = a.optString("browser_download_url"); break }
                    }
                }
                val current = currentVersion(activity)
                activity.runOnUiThread {
                    busy = false
                    if (activity.isFinishing) return@runOnUiThread
                    if (latest > current && apkUrl != null) {
                        askUpdate(activity, latest, apkUrl)
                    } else if (manual) {
                        Toast.makeText(activity, "최신 버전이에요 (${current})", Toast.LENGTH_SHORT).show()
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "업데이트 확인 실패", e)
                activity.runOnUiThread {
                    busy = false
                    if (manual) Toast.makeText(activity, "업데이트 확인에 실패했어요", Toast.LENGTH_SHORT).show()
                }
            }
        }.start()
    }

    private fun askUpdate(activity: AppCompatActivity, version: Long, url: String) {
        MaterialAlertDialogBuilder(activity)
            .setTitle("새 버전이 있어요")
            .setMessage("말끔 $version 버전이 나왔어요.\n'받기'를 누르면 다운로드가 시작돼요. 받은 파일을 눌러 설치하면 로그인과 기록은 그대로 남아요.")
            .setPositiveButton("받기") { _, _ ->
                // 앱이 직접 설치하지 않고 브라우저로 받게 함 (다른 앱 설치 권한 없이)
                activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
            }
            .setNegativeButton("나중에", null)
            .show()
    }
}

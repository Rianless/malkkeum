package com.horan.malkkeum

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * 자동 업데이트: 앱을 켤 때 GitHub에 새 버전이 있는지 확인하고,
 * 있으면 알림 → 다운로드 → 설치 화면까지 띄워줌. (마지막 '설치' 확인은 안드로이드 규칙상 직접 눌러야 함)
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
            .setMessage("말끔 $version 버전으로 업데이트할까요?\n로그인과 기록은 그대로 남아요.")
            .setPositiveButton("업데이트") { _, _ -> download(activity, version, url) }
            .setNegativeButton("나중에", null)
            .show()
    }

    private fun download(activity: AppCompatActivity, version: Long, url: String) {
        busy = true
        val dialog: AlertDialog = MaterialAlertDialogBuilder(activity)
            .setTitle("업데이트 받는 중")
            .setMessage("0%")
            .setCancelable(false)
            .show()

        Thread {
            try {
                val dir = File(activity.cacheDir, "update").apply { mkdirs() }
                dir.listFiles()?.forEach { it.delete() }
                val out = File(dir, "Malkkeum-$version.apk")

                var conn = URL(url).openConnection() as HttpURLConnection
                conn.instanceFollowRedirects = true
                conn.setRequestProperty("User-Agent", "Malkkeum-Updater")
                // GitHub 다운로드는 다른 주소로 한 번 넘겨주는 경우가 있어서 직접 따라감
                var hops = 0
                while (conn.responseCode in 300..399 && hops < 5) {
                    val next = conn.getHeaderField("Location")
                    conn.disconnect()
                    conn = URL(next).openConnection() as HttpURLConnection
                    conn.setRequestProperty("User-Agent", "Malkkeum-Updater")
                    hops++
                }
                val total = conn.contentLengthLong
                var done = 0L
                var lastPct = -1
                conn.inputStream.use { input ->
                    out.outputStream().use { output ->
                        val buf = ByteArray(64 * 1024)
                        while (true) {
                            val n = input.read(buf)
                            if (n < 0) break
                            output.write(buf, 0, n)
                            done += n
                            if (total > 0) {
                                val pct = (done * 100 / total).toInt()
                                if (pct != lastPct) {
                                    lastPct = pct
                                    activity.runOnUiThread { dialog.setMessage("$pct%") }
                                }
                            }
                        }
                    }
                }
                conn.disconnect()
                activity.runOnUiThread {
                    busy = false
                    dialog.dismiss()
                    install(activity, out)
                }
            } catch (e: Exception) {
                Log.e(TAG, "업데이트 다운로드 실패", e)
                activity.runOnUiThread {
                    busy = false
                    dialog.dismiss()
                    Toast.makeText(activity, "업데이트를 받지 못했어요. 잠시 후 다시 시도해주세요.", Toast.LENGTH_LONG).show()
                }
            }
        }.start()
    }

    private fun install(activity: AppCompatActivity, apk: File) {
        // 처음 한 번은 '이 출처의 앱 설치 허용'을 켜야 함
        if (Build.VERSION.SDK_INT >= 26 && !activity.packageManager.canRequestPackageInstalls()) {
            Toast.makeText(activity, "'이 출처 허용'을 켜고 뒤로 돌아오면 설치가 이어져요", Toast.LENGTH_LONG).show()
            pendingApk = apk
            activity.startActivity(
                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}"))
            )
            return
        }
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", apk)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        activity.startActivity(intent)
    }

    private var pendingApk: File? = null

    /** 설정에서 '이 출처 허용'을 켜고 돌아왔을 때 설치 이어하기 */
    fun resumePendingInstall(activity: AppCompatActivity) {
        val apk = pendingApk ?: return
        if (Build.VERSION.SDK_INT >= 26 && !activity.packageManager.canRequestPackageInstalls()) return
        pendingApk = null
        if (apk.exists()) install(activity, apk)
    }
}

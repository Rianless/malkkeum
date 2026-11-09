package com.horan.malkkeum

import android.content.Intent
import android.content.pm.ActivityInfo
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.google.android.material.button.MaterialButton
import com.google.android.material.materialswitch.MaterialSwitch
import org.json.JSONObject
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoSessionSettings
import org.mozilla.geckoview.GeckoView
import org.mozilla.geckoview.WebExtension

class MainActivity : AppCompatActivity() {

    companion object {
        private const val HOME_MOBILE = "https://m.youtube.com/"
        private const val HOME_PC = "https://www.youtube.com/"
        private const val NATIVE_APP = "malkkeum"
    }

    private lateinit var runtime: GeckoRuntime
    private lateinit var geckoView: GeckoView
    private lateinit var topBar: View
    private lateinit var counter: TextView
    private lateinit var toggle: MaterialSwitch
    private lateinit var logButton: MaterialButton
    private lateinit var pcButton: MaterialButton
    private val prefs by lazy { getSharedPreferences("malkkeum", MODE_PRIVATE) }
    private var pcMode: Boolean
        get() = prefs.getBoolean("pcMode", false)
        set(v) { prefs.edit().putBoolean("pcMode", v).apply() }
    private val home get() = if (pcMode) HOME_PC else HOME_MOBILE

    private lateinit var mainSession: GeckoSession
    private var logSession: GeckoSession? = null
    private var showingLog = false
    private var canGoBack = false
    private var fullScreen = false
    private var started = false
    private var pendingUrl: String? = null

    // 확장 프로그램(유튜브 페이지 안)과 연결된 통로
    private var port: WebExtension.Port? = null
    private var updatingToggle = false
    private var pendingEnabled: Boolean? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        // 상단바 아이콘(시간·와이파이)을 흰색으로 (배경은 테마에서 검정)
        WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars = false

        geckoView = findViewById(R.id.gecko)
        topBar = findViewById(R.id.topBar)
        counter = findViewById(R.id.counter)
        toggle = findViewById(R.id.toggle)
        logButton = findViewById(R.id.logButton)
        pcButton = findViewById(R.id.pcButton)

        runtime = Gecko.runtime(this)
        mainSession = GeckoSession().apply {
            navigationDelegate = navDelegate
            contentDelegate = makeContentDelegate()
            open(runtime)
        }
        applyPcMode()
        geckoView.setSession(mainSession)

        pendingUrl = urlFromIntent(intent)

        toggle.setOnCheckedChangeListener { _, checked ->
            if (updatingToggle) return@setOnCheckedChangeListener
            sendEnabled(checked)
            Toast.makeText(this, if (checked) "광고 차단 켜짐" else "광고 차단 꺼짐", Toast.LENGTH_SHORT).show()
        }
        logButton.setOnClickListener { if (showingLog) showMain() else showLog() }
        pcButton.setOnClickListener {
            pcMode = !pcMode
            applyPcMode()
            if (showingLog) showMain()
            Toast.makeText(this, if (pcMode) "PC 버전으로 열어요" else "모바일 버전으로 열어요", Toast.LENGTH_SHORT).show()
            val cur = currentUrl
            mainSession.loadUri(if (cur != null) toSiteUrl(cur) else home)
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    fullScreen -> mainSession.exitFullScreen()
                    showingLog -> showMain()
                    canGoBack -> mainSession.goBack()
                    else -> {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                        isEnabled = true
                    }
                }
            }
        })

        // 광고 차단 확장이 준비된 뒤에 유튜브를 열어야 첫 화면부터 광고가 걸러져요.
        Gecko.withExtension(this) { ext ->
            if (ext != null) {
                mainSession.webExtensionController.setMessageDelegate(ext, messageDelegate, NATIVE_APP)
            } else {
                Toast.makeText(this, R.string.ext_failed, Toast.LENGTH_LONG).show()
            }
            start()
        }
        // 혹시 확장 준비가 너무 늦어지면 그냥 열어요.
        geckoView.postDelayed({ start() }, 8000)
    }

    private fun start() {
        if (started) return
        started = true
        mainSession.loadUri(pendingUrl ?: home)
        pendingUrl = null
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val url = urlFromIntent(intent) ?: return
        if (showingLog) showMain()
        if (started) mainSession.loadUri(url) else pendingUrl = url
    }

    // ---------- 링크/공유로 들어온 주소를 모바일 유튜브 주소로 바꾸기 ----------
    private fun urlFromIntent(intent: Intent?): String? {
        intent ?: return null
        val raw = when (intent.action) {
            Intent.ACTION_VIEW -> intent.dataString
            Intent.ACTION_SEND -> intent.getStringExtra(Intent.EXTRA_TEXT)
                ?.let { Regex("https?://\\S+").find(it)?.value }
            else -> null
        } ?: return null
        return toSiteUrl(raw)
    }

    // PC/모바일 설정에 맞는 유튜브 주소로 바꾸기
    private fun toSiteUrl(raw: String): String {
        val uri = Uri.parse(raw)
        val host = uri.host?.lowercase() ?: return raw
        val target = if (pcMode) "www.youtube.com" else "m.youtube.com"
        if (host == "youtu.be") {
            val id = uri.pathSegments.firstOrNull() ?: return home
            val t = uri.getQueryParameter("t")
            return "https://$target/watch?v=$id" + (if (t != null) "&t=$t" else "")
        }
        if (host.endsWith("youtube.com")) {
            return uri.buildUpon().scheme("https").authority(target).build().toString()
        }
        return raw
    }

    // PC 버전: PC 브라우저로 소개하고 PC 화면 폭으로 그림
    private fun applyPcMode() {
        mainSession.settings.userAgentMode =
            if (pcMode) GeckoSessionSettings.USER_AGENT_MODE_DESKTOP else GeckoSessionSettings.USER_AGENT_MODE_MOBILE
        mainSession.settings.viewportMode =
            if (pcMode) GeckoSessionSettings.VIEWPORT_MODE_DESKTOP else GeckoSessionSettings.VIEWPORT_MODE_MOBILE
        pcButton.setText(if (pcMode) R.string.pc_on else R.string.pc_off)
    }

    private var currentUrl: String? = null

    // ---------- 기록·설정 화면 (확장 프로그램 페이지) ----------
    private fun showLog() {
        val ext = Gecko.extension
        if (ext == null) {
            Toast.makeText(this, R.string.ext_failed, Toast.LENGTH_SHORT).show()
            return
        }
        val session = logSession ?: GeckoSession().also {
            it.open(runtime)
            logSession = it
        }
        session.loadUri(ext.metaData.baseUrl.trimEnd('/') + "/popup.html")
        geckoView.releaseSession()
        geckoView.setSession(session)
        showingLog = true
        logButton.setText(R.string.back_to_youtube)
    }

    private fun showMain() {
        geckoView.releaseSession()
        geckoView.setSession(mainSession)
        showingLog = false
        logButton.setText(R.string.log)
    }

    // ---------- 확장 프로그램과 주고받기 ----------
    private fun sendEnabled(enabled: Boolean) {
        val p = port
        if (p == null) {
            pendingEnabled = enabled
            return
        }
        p.postMessage(JSONObject().put("type", "setEnabled").put("value", enabled))
    }

    private val portDelegate = object : WebExtension.PortDelegate {
        override fun onPortMessage(message: Any, port: WebExtension.Port) {
            val json = message as? JSONObject ?: return
            if (json.optString("type") != "state") return
            val enabled = json.optBoolean("enabled", true)
            val blocked = json.optInt("blocked", 0)
            updatingToggle = true
            toggle.isChecked = enabled
            updatingToggle = false
            counter.text = if (enabled) getString(R.string.blocked_count, blocked) else getString(R.string.block_off)
        }

        override fun onDisconnect(port: WebExtension.Port) {
            if (this@MainActivity.port === port) this@MainActivity.port = null
        }
    }

    private val messageDelegate = object : WebExtension.MessageDelegate {
        override fun onConnect(port: WebExtension.Port) {
            this@MainActivity.port = port
            port.setDelegate(portDelegate)
            pendingEnabled?.let {
                pendingEnabled = null
                sendEnabled(it)
            }
        }
    }

    // ---------- 화면 이동 / 전체 화면 ----------
    private val navDelegate = object : GeckoSession.NavigationDelegate {
        override fun onLocationChange(
            session: GeckoSession,
            url: String?,
            perms: MutableList<GeckoSession.PermissionDelegate.ContentPermission>,
            hasUserGesture: Boolean
        ) {
            if (session === mainSession) currentUrl = url
        }

        override fun onCanGoBack(session: GeckoSession, canGoBack: Boolean) {
            if (session === mainSession) this@MainActivity.canGoBack = canGoBack
        }

        // 새 창으로 열려는 링크는 지금 화면에서 열어요.
        override fun onNewSession(session: GeckoSession, uri: String): GeckoResult<GeckoSession>? {
            session.loadUri(uri)
            return null
        }
    }

    private fun makeContentDelegate() = object : GeckoSession.ContentDelegate {
        override fun onFullScreen(session: GeckoSession, fullScreen: Boolean) {
            this@MainActivity.fullScreen = fullScreen
            val controller = WindowCompat.getInsetsController(window, window.decorView)
            if (fullScreen) {
                topBar.visibility = View.GONE
                controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                controller.hide(WindowInsetsCompat.Type.systemBars())
                requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            } else {
                topBar.visibility = View.VISIBLE
                controller.show(WindowInsetsCompat.Type.systemBars())
                controller.isAppearanceLightStatusBars = false
                requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            }
        }
    }
}

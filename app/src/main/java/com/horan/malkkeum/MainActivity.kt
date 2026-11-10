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
import org.json.JSONObject
import org.mozilla.geckoview.AllowOrDeny
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoSessionSettings
import org.mozilla.geckoview.GeckoView
import org.mozilla.geckoview.WebExtension

class MainActivity : AppCompatActivity() {

    companion object {
        // app=m / app=desktop + persist_app=1 : 유튜브가 쿠키에 기억한 PC/모바일 선택을 덮어씀
        private const val HOME_MOBILE = "https://m.youtube.com/?app=m&persist_app=1"
        private const val HOME_PC = "https://www.youtube.com/?app=desktop&persist_app=1"
        private const val NATIVE_APP = "malkkeum"
    }

    private lateinit var runtime: GeckoRuntime
    private lateinit var geckoView: GeckoView
    private lateinit var topBar: View
    private lateinit var counter: TextView
    private lateinit var toggle: PillToggle
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
        // 기록 버튼 길게 누르기: 지금 화면 구조를 진단에 남김 (UI를 정확히 고치기 위한 자료)
        logButton.setOnLongClickListener {
            val p = port
            if (p == null || showingLog) {
                Toast.makeText(this, "유튜브 화면에서 길게 눌러주세요", Toast.LENGTH_SHORT).show()
            } else {
                p.postMessage(JSONObject().put("type", "snapshot"))
                Toast.makeText(this, "지금 화면 구조를 진단에 기록했어요", Toast.LENGTH_SHORT).show()
            }
            true
        }
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
        // 새 버전 확인 (제목을 길게 누르면 직접 확인)
        Updater.check(this)
        findViewById<View>(R.id.titleLogo).setOnLongClickListener { Updater.check(this, manual = true); true }

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
            return withAppParam(Uri.parse("https://$target/watch?v=$id" + (if (t != null) "&t=$t" else "")))
        }
        if (host.endsWith("youtube.com")) {
            return withAppParam(uri.buildUpon().scheme("https").authority(target).build())
        }
        return raw
    }

    // 버전 선택 신호를 주소에 붙임 (이미 있으면 바꿔 씀)
    private fun withAppParam(uri: Uri): String {
        val b = uri.buildUpon().clearQuery()
        for (name in uri.queryParameterNames) {
            if (name == "app" || name == "persist_app") continue
            for (v in uri.getQueryParameters(name)) b.appendQueryParameter(name, v)
        }
        b.appendQueryParameter("app", if (pcMode) "desktop" else "m")
        b.appendQueryParameter("persist_app", "1")
        return b.build().toString()
    }

    // PC 버전: PC 브라우저로 소개하고 PC 화면 폭으로 그림
    private fun applyPcMode() {
        mainSession.settings.userAgentMode =
            if (pcMode) GeckoSessionSettings.USER_AGENT_MODE_DESKTOP else GeckoSessionSettings.USER_AGENT_MODE_MOBILE
        // 화면은 PC/모바일 모두 폰 폭으로 (PC 유튜브는 viewport.js가 폰 폭에 맞춤)
        mainSession.settings.viewportMode = GeckoSessionSettings.VIEWPORT_MODE_MOBILE
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

        // 고른 버전과 다른 쪽(PC↔모바일)으로 가려 하면 고른 버전으로 바꿔서 열어요.
        override fun onLoadRequest(
            session: GeckoSession,
            request: GeckoSession.NavigationDelegate.LoadRequest
        ): GeckoResult<AllowOrDeny>? {
            if (session !== mainSession) return null
            val host = Uri.parse(request.uri).host?.lowercase() ?: return null
            val wrong = (pcMode && host == "m.youtube.com") || (!pcMode && host == "www.youtube.com")
            if (!wrong) return null
            val fixed = toSiteUrl(request.uri)
            geckoView.post { mainSession.loadUri(fixed) }
            return GeckoResult.fromValue(AllowOrDeny.DENY)
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

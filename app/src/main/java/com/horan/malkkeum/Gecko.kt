package com.horan.malkkeum

import android.content.Context
import android.util.Log
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoRuntimeSettings
import org.mozilla.geckoview.WebExtension

/**
 * 파이어폭스 엔진은 앱 전체에서 딱 하나만 만들어야 해서 여기서 관리해요.
 * 광고 차단 확장 프로그램(assets/ytab)도 여기서 앱에 내장 설치해요.
 */
object Gecko {
    private const val TAG = "Malkkeum"
    private const val EXT_URL = "resource://android/assets/ytab/"
    private const val EXT_ID = "ytab@malkkeum"

    private var runtime: GeckoRuntime? = null
    var extension: WebExtension? = null
        private set

    private var installing = false
    private val waiters = mutableListOf<(WebExtension?) -> Unit>()

    fun runtime(context: Context): GeckoRuntime {
        runtime?.let { return it }
        val settings = GeckoRuntimeSettings.Builder()
            .consoleOutput(true)
            .build()
        return GeckoRuntime.create(context.applicationContext, settings).also { runtime = it }
    }

    /** 확장 프로그램이 준비되면 콜백을 불러요. 실패하면 null. */
    fun withExtension(context: Context, callback: (WebExtension?) -> Unit) {
        extension?.let { callback(it); return }
        waiters += callback
        if (installing) return
        installing = true

        runtime(context).webExtensionController
            .ensureBuiltIn(EXT_URL, EXT_ID)
            .accept({ ext ->
                extension = ext
                Log.i(TAG, "확장 프로그램 설치됨: ${ext?.id}")
                flush(ext)
            }, { e ->
                Log.e(TAG, "확장 프로그램 설치 실패", e)
                installing = false
                flush(null)
            })
    }

    private fun flush(ext: WebExtension?) {
        val list = waiters.toList()
        waiters.clear()
        list.forEach { it(ext) }
    }
}

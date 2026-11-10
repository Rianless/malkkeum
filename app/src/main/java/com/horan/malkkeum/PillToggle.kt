package com.horan.malkkeum

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import android.view.animation.DecelerateInterpolator
import androidx.core.content.res.ResourcesCompat

/**
 * 가로로 긴 알약 모양 스위치. 안에 흰 글씨("차단")가 들어가고, 동그라미가 좌우로 미끄러짐.
 * 켜짐: 빨강 바탕 · 글씨 왼쪽 · 동그라미 오른쪽 / 꺼짐: 회색 바탕 · 글씨 오른쪽 · 동그라미 왼쪽
 */
class PillToggle @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    var label: String = "차단"
        set(value) { field = value; invalidate() }

    private var checkedState = true
    private var listener: ((PillToggle, Boolean) -> Unit)? = null
    private var position = 1f            // 0 = 꺼짐(왼쪽), 1 = 켜짐(오른쪽)
    private var animator: ValueAnimator? = null

    private val onColor = Color.parseColor("#E5322D")
    private val offColor = Color.parseColor("#9E9E9E")

    private val dp = resources.displayMetrics.density
    private val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val thumbPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textSize = 14 * resources.displayMetrics.scaledDensity
        typeface = try {
            ResourcesCompat.getFont(context, R.font.roboto_bold) ?: Typeface.DEFAULT_BOLD
        } catch (e: Exception) { Typeface.DEFAULT_BOLD }
    }
    private val rect = RectF()

    init {
        isClickable = true
        isFocusable = true
        contentDescription = label
    }

    var isChecked: Boolean
        get() = checkedState
        set(value) = setCheckedInternal(value, animate = isLaidOut, fromUser = false)

    fun setOnCheckedChangeListener(l: (PillToggle, Boolean) -> Unit) { listener = l }

    private fun setCheckedInternal(value: Boolean, animate: Boolean, fromUser: Boolean) {
        if (value == checkedState && (animator == null || !animator!!.isRunning) && position == (if (value) 1f else 0f)) return
        checkedState = value
        val target = if (value) 1f else 0f
        animator?.cancel()
        if (animate) {
            animator = ValueAnimator.ofFloat(position, target).apply {
                duration = 180
                interpolator = DecelerateInterpolator()
                addUpdateListener { position = it.animatedValue as Float; invalidate() }
                start()
            }
        } else {
            position = target
            invalidate()
        }
        if (fromUser) listener?.invoke(this, value)
    }

    override fun performClick(): Boolean {
        super.performClick()
        setCheckedInternal(!checkedState, animate = true, fromUser = true)
        return true
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (event.action == MotionEvent.ACTION_UP) performClick()
        return true
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val w = resolveSize((76 * dp).toInt(), widthMeasureSpec)
        val h = resolveSize((32 * dp).toInt(), heightMeasureSpec)
        setMeasuredDimension(w, h)
    }

    private fun blend(a: Int, b: Int, t: Float): Int {
        val r = (Color.red(a) + (Color.red(b) - Color.red(a)) * t).toInt()
        val g = (Color.green(a) + (Color.green(b) - Color.green(a)) * t).toInt()
        val bl = (Color.blue(a) + (Color.blue(b) - Color.blue(a)) * t).toInt()
        return Color.rgb(r, g, bl)
    }

    override fun onDraw(canvas: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()
        val radius = h / 2f
        // 바탕
        trackPaint.color = blend(offColor, onColor, position)
        rect.set(0f, 0f, w, h)
        canvas.drawRoundRect(rect, radius, radius, trackPaint)
        // 동그라미
        val pad = 3 * dp
        val thumbR = radius - pad
        val leftX = pad + thumbR
        val rightX = w - pad - thumbR
        val cx = leftX + (rightX - leftX) * position
        canvas.drawCircle(cx, h / 2f, thumbR, thumbPaint)
        // 글씨: 동그라미 반대편 빈 공간 가운데
        val textW = textPaint.measureText(label)
        val freeLeft = if (position >= 0.5f) 0f else cx + thumbR
        val freeRight = if (position >= 0.5f) cx - thumbR else w
        val tx = freeLeft + (freeRight - freeLeft - textW) / 2f
        val fm = textPaint.fontMetrics
        val ty = h / 2f - (fm.ascent + fm.descent) / 2f
        textPaint.alpha = (255 * (0.35f + 0.65f * kotlin.math.abs(position - 0.5f) * 2f)).toInt().coerceIn(0, 255)
        canvas.drawText(label, tx, ty, textPaint)
    }
}

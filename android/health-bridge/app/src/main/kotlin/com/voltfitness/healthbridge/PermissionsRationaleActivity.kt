package com.voltfitness.healthbridge

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.text.method.LinkMovementMethod
import android.widget.LinearLayout
import android.widget.TextView

class PermissionsRationaleActivity:Activity(){
    override fun onCreate(savedInstanceState:Bundle?){
        super.onCreate(savedInstanceState)
        val padding=(24*resources.displayMetrics.density).toInt()
        val layout=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(padding,padding,padding,padding);setBackgroundColor(Color.rgb(11,14,15))}
        layout.addView(TextView(this).apply{text="VOLT Health Bridge";textSize=24f;setTextColor(Color.WHITE)})
        layout.addView(TextView(this).apply{text="Читает только выбранные данные Health Connect и передаёт нормализованные записи в ваш личный VOLT. Не записывает данные обратно, не использует стороннюю телеметрию и не передаёт GPS-маршруты.";textSize=16f;setTextColor(Color.LTGRAY);setPadding(0,padding,0,0);movementMethod=LinkMovementMethod.getInstance()})
        setContentView(layout)
    }
}

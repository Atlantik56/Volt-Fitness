package com.voltfitness.healthbridge

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import java.time.Instant

class MainActivity:ComponentActivity(){
    private lateinit var gateway:HealthConnectGateway
    private lateinit var tokenStore:SecureTokenStore
    private lateinit var api:BridgeApiClient
    private lateinit var statusText:TextView
    private lateinit var diagnosticsText:TextView
    private lateinit var pairingInput:EditText
    private lateinit var pairButton:Button
    private lateinit var permissionsButton:Button
    private lateinit var historyButton:Button
    private lateinit var syncButton:Button
    private val permissionLauncher=registerForActivityResult(PermissionController.createRequestPermissionResultContract()){refreshStatus()}

    override fun onCreate(savedInstanceState:Bundle?){
        super.onCreate(savedInstanceState)
        gateway=HealthConnectGateway(this);tokenStore=SecureTokenStore(this);api=BridgeApiClient(BuildConfig.VOLT_BASE_URL)
        setContentView(buildScreen());refreshStatus();handleIntent(intent)
    }
    override fun onNewIntent(intent:Intent){super.onNewIntent(intent);setIntent(intent);handleIntent(intent)}

    private fun buildScreen():View{
        val density=resources.displayMetrics.density
        val padding=(20*density).toInt()
        val container=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(padding,padding,padding,padding);setBackgroundColor(Color.rgb(11,14,15))}
        container.addView(label("VOLT HEALTH BRIDGE",12f,Color.rgb(199,255,50)))
        container.addView(label("Health Connect → VOLT",27f,Color.WHITE).apply{setPadding(0,(8*density).toInt(),0,0)})
        container.addView(label("Диагностический companion. Только чтение, ручная синхронизация и никаких GPS-маршрутов.",15f,Color.LTGRAY).apply{setPadding(0,(10*density).toInt(),0,padding)})
        statusText=label("Проверяем Health Connect…",16f,Color.WHITE);container.addView(card(statusText))
        diagnosticsText=label("Данные ещё не прочитаны",14f,Color.LTGRAY);container.addView(card(diagnosticsText))
        pairingInput=EditText(this).apply{hint="Одноразовый код из Profile → Health Connect";setSingleLine(true);setTextColor(Color.WHITE);setHintTextColor(Color.GRAY);setBackgroundColor(Color.rgb(28,33,35));setPadding(padding,(12*density).toInt(),padding,(12*density).toInt())}
        container.addView(pairingInput,LinearLayout.LayoutParams(-1,-2).apply{topMargin=padding})
        pairButton=button("Привязать Sony Xperia"){pair()};container.addView(pairButton)
        permissionsButton=button("Выдать разрешения Health Connect"){permissionLauncher.launch(gateway.requiredPermissions)};container.addView(permissionsButton)
        historyButton=button("Разрешить полную историю"){permissionLauncher.launch(setOf(gateway.historyPermission))};container.addView(historyButton)
        syncButton=button("Синхронизировать сейчас"){syncNow()};container.addView(syncButton)
        container.addView(button("Открыть VOLT PWA"){startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(BuildConfig.VOLT_BASE_URL)))})
        return ScrollView(this).apply{addView(container)}
    }

    private fun refreshStatus(){
        lifecycleScope.launch{
            val snapshot=gateway.permissionSnapshot()
            val token=tokenStore.load()
            val missing=snapshot.missing.joinToString{it.wireName}
            statusText.text=when{
                !snapshot.available->"Health Connect недоступен на этом устройстве"
                snapshot.missing.isNotEmpty()->"Health Connect доступен\nТребуются разрешения: $missing"
                else->"Health Connect доступен\nВсе базовые READ permissions выданы"
            }+"\nVOLT: "+if(token==null)"устройство не привязано" else "устройство привязано"
            permissionsButton.isEnabled=snapshot.available
            historyButton.visibility=if(snapshot.historyAvailable)View.VISIBLE else View.GONE
            historyButton.isEnabled=snapshot.available&&!snapshot.historyGranted
            syncButton.isEnabled=snapshot.available&&token!=null&&snapshot.granted.isNotEmpty()
            pairButton.isEnabled=token==null
            val last=getSharedPreferences("bridge_state",MODE_PRIVATE).getString("last_sync",null)
            diagnosticsText.text="Последняя синхронизация: ${last?:"ещё не выполнялась"}\nПолная история: ${if(snapshot.historyGranted)"разрешена" else if(snapshot.historyAvailable)"доступна по отдельному запросу" else "не поддерживается"}"
        }
    }

    private fun pair(){
        val code=pairingInput.text.toString().trim();if(code.isBlank()){diagnosticsText.text="Вставьте одноразовый код из PWA";return}
        setBusy(true,"Привязываем устройство…")
        lifecycleScope.launch{
            runCatching{api.pair(code,"${Build.MANUFACTURER} ${Build.MODEL}".trim())}.onSuccess{tokenStore.save(it.deviceToken);pairingInput.text.clear();diagnosticsText.text="Устройство привязано. Выдайте permissions и запустите первую синхронизацию."}.onFailure{diagnosticsText.text=it.message?:"Не удалось привязать устройство"}
            setBusy(false);refreshStatus()
        }
    }

    private fun syncNow(){
        val token=tokenStore.load()?:run{diagnosticsText.text="Сначала привяжите устройство";return}
        setBusy(true,"Читаем Health Connect…")
        lifecycleScope.launch{
            runCatching{
                val collection=gateway.collect();diagnosticsText.text="Отправляем ${collection.records.size} нормализованных записей…"
                val result=api.upload(token,collection.diagnostics,collection.records)
                val origins=collection.diagnostics.origins.joinToString("\n"){"${if(it.isGarmin)"Garmin: " else "Источник: "}${it.name} (${it.packageName})"}.ifBlank{"Источники пока не обнаружены"}
                val types=collection.diagnostics.discoveredRecordTypes.joinToString{it.wireName}.ifBlank{"нет данных"}
                val stamp=Instant.now().toString();getSharedPreferences("bridge_state",MODE_PRIVATE).edit().putString("last_sync",stamp).apply()
                "Синхронизация завершена\nНовых: ${result.created}, обновлено: ${result.updated}\nТипы: $types\n$origins"
            }.onSuccess{diagnosticsText.text=it}.onFailure{diagnosticsText.text=it.message?:"Ошибка синхронизации"}
            setBusy(false);refreshStatus()
        }
    }

    private fun handleIntent(value:Intent){
        if(value.action!=Intent.ACTION_VIEW)return
        when(value.data?.host){"sync"->syncNow();"permissions"->if(gateway.available)permissionLauncher.launch(gateway.requiredPermissions)}
    }
    private fun setBusy(busy:Boolean,message:String?=null){pairButton.isEnabled=!busy;permissionsButton.isEnabled=!busy;historyButton.isEnabled=!busy;syncButton.isEnabled=!busy;if(message!=null)diagnosticsText.text=message}
    private fun label(text:String,size:Float,color:Int)=TextView(this).apply{this.text=text;textSize=size;setTextColor(color);setLineSpacing(0f,1.15f)}
    private fun card(child:View)=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(20,20,20,20);setBackgroundColor(Color.rgb(23,28,30));addView(child);layoutParams=LinearLayout.LayoutParams(-1,-2).apply{topMargin=18}}
    private fun button(text:String,action:()->Unit)=Button(this).apply{this.text=text;setTextColor(Color.rgb(10,14,8));setBackgroundColor(Color.rgb(199,255,50));gravity=Gravity.CENTER;setOnClickListener{action()};layoutParams=LinearLayout.LayoutParams(-1,-2).apply{topMargin=14}}
}

package com.voltfitness.healthbridge

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.lifecycleScope
import com.voltfitness.healthbridge.core.OperationFeedback
import com.voltfitness.healthbridge.core.PermissionSnapshot
import com.voltfitness.healthbridge.core.AppRelease
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Instant
import java.io.File

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
    private lateinit var resetButton:Button
    private lateinit var feedback:OperationFeedback
    private var permissions:PermissionSnapshot?=null
    private lateinit var updater:BridgeUpdateClient
    private lateinit var updateText:TextView
    private lateinit var updateButton:Button
    private var availableRelease:AppRelease?=null
    private var pendingUpdate:File?=null
    private var updating=false
    private var checkingUpdate=false
    private val permissionLauncher=registerForActivityResult(PermissionController.createRequestPermissionResultContract()){refreshStatus()}
    private val installPermissionLauncher=registerForActivityResult(ActivityResultContracts.StartActivityForResult()){
        if(packageManager.canRequestPackageInstalls())openUpdateInstaller()
        else updateText.text="Разрешение установки не выдано. Нажмите «Обновить приложение», чтобы повторить."
    }

    override fun onCreate(savedInstanceState:Bundle?){
        super.onCreate(savedInstanceState)
        gateway=HealthConnectGateway(this);tokenStore=SecureTokenStore(this);api=BridgeApiClient(BuildConfig.VOLT_BASE_URL)
        updater=BridgeUpdateClient(this,BuildConfig.VOLT_BASE_URL)
        feedback=OperationFeedback(getSharedPreferences("bridge_state",MODE_PRIVATE).getString("last_result",null))
        setContentView(buildScreen());refreshStatus();handleIntent(intent);checkForUpdate()
    }
    override fun onNewIntent(intent:Intent){super.onNewIntent(intent);setIntent(intent);handleIntent(intent)}

    private fun buildScreen():View{
        val density=resources.displayMetrics.density
        val padding=(20*density).toInt()
        val container=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(padding,padding,padding,padding);setBackgroundColor(Color.rgb(11,14,15))}
        container.addView(label("VOLT HEALTH BRIDGE",12f,Color.rgb(199,255,50)))
        container.addView(label("Health Connect → VOLT",27f,Color.WHITE).apply{setPadding(0,(8*density).toInt(),0,0)})
        container.addView(label("Передавайте данные Health Connect в VOLT. Вы сами выбираете разрешения и запускаете синхронизацию.",15f,Color.LTGRAY).apply{setPadding(0,(10*density).toInt(),0,padding)})
        statusText=label("Проверяем Health Connect…",16f,Color.WHITE);container.addView(card(statusText))
        diagnosticsText=label("Данные ещё не прочитаны",14f,Color.LTGRAY);container.addView(card(diagnosticsText))
        updateText=label("Версия приложения: ${BuildConfig.VERSION_NAME}",14f,Color.LTGRAY);container.addView(card(updateText))
        updateButton=button("Проверить обновления"){
            if(availableRelease?.isNewerThan(BuildConfig.VERSION_CODE.toLong())==true)downloadUpdate()else checkForUpdate()
        };container.addView(updateButton)
        pairingInput=EditText(this).apply{hint="Одноразовый код из Profile → Health Connect";setSingleLine(true);setTextColor(Color.WHITE);setHintTextColor(Color.GRAY);setBackgroundColor(Color.rgb(28,33,35));setPadding(padding,(12*density).toInt(),padding,(12*density).toInt())}
        container.addView(pairingInput,LinearLayout.LayoutParams(-1,-2).apply{topMargin=padding})
        pairButton=button("Привязать телефон"){pair()};container.addView(pairButton)
        permissionsButton=button("Выдать разрешения Health Connect"){permissionLauncher.launch(gateway.requiredPermissions)};container.addView(permissionsButton)
        historyButton=button("Разрешить полную историю"){permissionLauncher.launch(setOf(gateway.historyPermission))};container.addView(historyButton)
        syncButton=button("Синхронизировать сейчас"){syncNow()};container.addView(syncButton)
        resetButton=button("Сбросить привязку на телефоне"){
            tokenStore.clear()
            getSharedPreferences("bridge_state",MODE_PRIVATE).edit().remove("last_sync").remove("last_result").apply()
            feedback.finish("Привязка на телефоне сброшена. Создайте новый код в профиле VOLT.")
            refreshStatus()
        };container.addView(resetButton)
        container.addView(button("Открыть VOLT PWA"){startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(BuildConfig.VOLT_BASE_URL)))})
        return ScrollView(this).apply{addView(container)}
    }

    private fun refreshStatus(){
        lifecycleScope.launch{
          try{
            val snapshot=gateway.permissionSnapshot()
            permissions=snapshot
            val token=tokenStore.load()
            val missing=snapshot.missing.joinToString{it.wireName}
            statusText.text=when{
                !snapshot.available->"Health Connect недоступен на этом устройстве"
                snapshot.missing.isNotEmpty()->"Health Connect доступен\nТребуются разрешения: $missing"
                else->"Health Connect доступен\nВсе базовые READ permissions выданы"
            }+"\nVOLT: "+if(token==null)"устройство не привязано" else "устройство привязано"
            historyButton.visibility=if(snapshot.historyAvailable)View.VISIBLE else View.GONE
          }catch(cause:CancellationException){throw cause}
          catch(cause:Exception){statusText.text="Не удалось проверить Health Connect: ${cause.message?:"ошибка"}"}
          renderControls();renderDiagnostics()
        }
    }

    private fun pair(){
        if(feedback.busy||updating)return
        val code=pairingInput.text.toString().trim();if(code.isBlank()){finishOperation("Вставьте одноразовый код из PWA");return}
        if(!feedback.begin("Привязываем устройство…"))return
        renderControls();renderDiagnostics()
        lifecycleScope.launch{
            try{
                val result=api.pair(code,"${Build.MANUFACTURER} ${Build.MODEL}".trim())
                tokenStore.save(result.deviceToken);pairingInput.text.clear()
                finishOperation("Устройство привязано. Выдайте разрешения и запустите первую синхронизацию.")
                checkForUpdate()
            }catch(cause:CancellationException){finishOperation("Привязка прервана. Проверьте состояние устройства в профиле VOLT.");throw cause}
            catch(cause:Exception){finishOperation("Ошибка привязки: ${cause.message?:"неизвестная ошибка"}")}
            finally{renderControls();refreshStatus()}
        }
    }

    private fun syncNow(requestId:String?=null){
        if(feedback.busy||updating)return
        val token=tokenStore.load()?:run{finishOperation("Сначала привяжите устройство");return}
        if(!feedback.begin("Читаем Health Connect за последние 30 дней…"))return
        renderControls();renderDiagnostics()
        lifecycleScope.launch{
            try{
                val collection=withContext(Dispatchers.IO){gateway.collect()}
                check(collection.diagnostics.healthConnectAvailable&&collection.diagnostics.grantedPermissions.isNotEmpty()){"Health Connect недоступен или не выданы разрешения"}
                feedback.updateProgress("Подготовка ${collection.records.size} записей к отправке…");renderDiagnostics()
                val result=api.upload(token,collection.diagnostics,collection.records,requestId){progress->
                    withContext(Dispatchers.Main){
                        feedback.updateProgress("Отправка пакета ${progress.batch} из ${progress.batches}\nУже принято записей: ${progress.accepted}")
                        renderDiagnostics()
                    }
                }
                val origins=collection.diagnostics.origins.joinToString("\n"){"${if(it.isGarmin)"Garmin: " else "Источник: "}${it.name} (${it.packageName})"}.ifBlank{"Источники пока не обнаружены"}
                val types=collection.diagnostics.discoveredRecordTypes.joinToString{it.wireName}.ifBlank{"нет данных"}
                api.finish(token,requestId,true)
                val stamp=Instant.now().toString();getSharedPreferences("bridge_state",MODE_PRIVATE).edit().putString("last_sync",stamp).apply()
                if(requestId!=null)runCatching{startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(BuildConfig.VOLT_BASE_URL+"/?section=%D0%9F%D1%80%D0%BE%D1%84%D0%B8%D0%BB%D1%8C%20%D0%B8%20%D0%BD%D0%B0%D1%81%D1%82%D1%80%D0%BE%D0%B9%D0%BA%D0%B8&health-sync="+requestId)))}
                finishOperation("Синхронизация завершена\nПринято: ${result.total}, новых: ${result.created}, обновлено: ${result.updated}\nТипы: $types\n$origins")
            }catch(cause:CancellationException){finishOperation("Синхронизация прервана. Часть пакетов могла быть принята. Повторная синхронизация не создаёт дубликаты.");throw cause}
            catch(cause:Exception){runCatching{api.finish(token,requestId,false)};finishOperation("Ошибка синхронизации: ${cause.message?:"неизвестная ошибка"}")}
            finally{renderControls();refreshStatus()}
        }
    }

    private fun handleIntent(value:Intent){
        if(value.action!=Intent.ACTION_VIEW||value.data?.scheme!="volt-health")return
        when(value.data?.host){"sync"->{val id=value.data?.getQueryParameter("request");if(id!=null&&!Regex("^[0-9a-fA-F-]{36}$").matches(id)){finishOperation("Некорректный запрос VOLT");return};syncNow(id)};"permissions"->if(gateway.available)permissionLauncher.launch(gateway.requiredPermissions)}
    }
    private fun checkForUpdate(){
        if(checkingUpdate||updating||feedback.busy)return
        val token=tokenStore.load()?:run{updateText.text="Версия: ${BuildConfig.VERSION_NAME}. Для обновлений привяжите телефон к VOLT.";return}
        checkingUpdate=true;updateText.text="Версия: ${BuildConfig.VERSION_NAME}. Проверяем обновления…";renderControls()
        lifecycleScope.launch{
            try{
                availableRelease=updater.latest(token)
                val release=availableRelease!!
                updateText.text=if(release.isNewerThan(BuildConfig.VERSION_CODE.toLong()))"Доступно обновление ${release.version}. Нажмите «Обновить приложение»." else "Версия ${BuildConfig.VERSION_NAME} актуальна."
            }catch(cause:CancellationException){throw cause}
            catch(cause:Exception){availableRelease=null;updateText.text="Не удалось проверить обновление: ${cause.message?:"ошибка сети"}"}
            finally{checkingUpdate=false;renderControls()}
        }
    }
    private fun downloadUpdate(){
        if(updating||checkingUpdate||feedback.busy)return
        val token=tokenStore.load()?:run{updateText.text="Для обновления сначала привяжите телефон к VOLT.";return}
        updating=true;pendingUpdate=null;renderControls()
        lifecycleScope.launch{
            try{
                val release=updater.latest(token);availableRelease=release
                if(!release.isNewerThan(BuildConfig.VERSION_CODE.toLong())){updateText.text="Версия ${BuildConfig.VERSION_NAME} актуальна.";return@launch}
                updateText.text="Скачиваем обновление ${release.version}…"
                pendingUpdate=updater.download(token,release){percent->runOnUiThread{if(!isDestroyed)updateText.text="Скачиваем обновление ${release.version}: $percent%"}}
                updateText.text="Файл и подпись проверены. Подтвердите установку обновления в Android."
                if(packageManager.canRequestPackageInstalls())openUpdateInstaller()
                else installPermissionLauncher.launch(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:$packageName")))
            }catch(cause:CancellationException){throw cause}
            catch(cause:Exception){updateText.text="Не удалось обновить приложение: ${cause.message?:"ошибка"}"}
            finally{updating=false;renderControls()}
        }
    }
    private fun openUpdateInstaller(){
        val file=pendingUpdate?:run{updateText.text="Нажмите «Обновить приложение», чтобы подготовить установку.";return}
        try{
            val uri=FileProvider.getUriForFile(this,"$packageName.updates",file)
            startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
        }catch(cause:Exception){updateText.text="Не удалось открыть установку: ${cause.message?:"ошибка"}"}
    }
    private fun finishOperation(message:String){
        feedback.finish(message)
        getSharedPreferences("bridge_state",MODE_PRIVATE).edit().putString("last_result",message).apply()
        renderDiagnostics()
    }
    private fun renderDiagnostics(){
        val last=getSharedPreferences("bridge_state",MODE_PRIVATE).getString("last_sync",null)
        val snapshot=permissions
        val history=if(snapshot==null)"проверяем" else if(snapshot.historyGranted)"разрешена" else if(snapshot.historyAvailable)"доступна по отдельному запросу" else "не поддерживается"
        diagnosticsText.text=feedback.text("Последняя успешная синхронизация: ${last?:"ещё не выполнялась"}\nПолная история: $history")
    }
    private fun renderControls(){
        val snapshot=permissions
        val available=snapshot?.available==true
        val paired=tokenStore.load()!=null
        val busy=feedback.busy||updating
        pairButton.isEnabled=!busy&&!paired
        permissionsButton.isEnabled=!busy&&available
        historyButton.isEnabled=!busy&&available&&snapshot?.historyGranted==false
        syncButton.isEnabled=!busy&&available&&paired&&snapshot!!.granted.isNotEmpty()
        resetButton.isEnabled=!busy
        pairingInput.isEnabled=!busy&&!paired
        updateButton.isEnabled=!busy&&!checkingUpdate&&paired
        updateButton.text=if(availableRelease?.isNewerThan(BuildConfig.VERSION_CODE.toLong())==true)"Обновить приложение" else "Проверить обновления"
    }
    private fun label(text:String,size:Float,color:Int)=TextView(this).apply{this.text=text;textSize=size;setTextColor(color);setLineSpacing(0f,1.15f)}
    private fun card(child:View)=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(20,20,20,20);setBackgroundColor(Color.rgb(23,28,30));addView(child);layoutParams=LinearLayout.LayoutParams(-1,-2).apply{topMargin=18}}
    private fun button(text:String,action:()->Unit)=Button(this).apply{this.text=text;setTextColor(Color.rgb(10,14,8));setBackgroundColor(Color.rgb(199,255,50));gravity=Gravity.CENTER;setOnClickListener{action()};layoutParams=LinearLayout.LayoutParams(-1,-2).apply{topMargin=14}}
}

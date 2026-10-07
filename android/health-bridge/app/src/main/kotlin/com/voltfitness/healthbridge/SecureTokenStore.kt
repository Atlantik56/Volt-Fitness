package com.voltfitness.healthbridge

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SecureTokenStore(private val context:Context){
    private val alias="volt_health_bridge_device_token"
    private val prefs=context.getSharedPreferences("secure_bridge",Context.MODE_PRIVATE)
    private fun key():SecretKey{
        val store=KeyStore.getInstance("AndroidKeyStore").apply{load(null)}
        (store.getEntry(alias,null) as? KeyStore.SecretKeyEntry)?.let{return it.secretKey}
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply{
            init(KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(true).build())
        }.generateKey()
    }
    fun save(token:String){
        val cipher=Cipher.getInstance("AES/GCM/NoPadding").apply{init(Cipher.ENCRYPT_MODE,key())}
        val payload=cipher.iv+cipher.doFinal(token.toByteArray(Charsets.UTF_8))
        prefs.edit().putString("token",Base64.encodeToString(payload,Base64.NO_WRAP)).apply()
    }
    fun load():String?{
        return try{
            val encoded=prefs.getString("token",null)?:return null
            val bytes=Base64.decode(encoded,Base64.NO_WRAP)
            if(bytes.size<=12)return null
            val cipher=Cipher.getInstance("AES/GCM/NoPadding").apply{init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,bytes.copyOfRange(0,12)))}
            String(cipher.doFinal(bytes.copyOfRange(12,bytes.size)),Charsets.UTF_8)
        }catch(_:Exception){clear();null}
    }
    fun clear(){prefs.edit().remove("token").apply()}
}

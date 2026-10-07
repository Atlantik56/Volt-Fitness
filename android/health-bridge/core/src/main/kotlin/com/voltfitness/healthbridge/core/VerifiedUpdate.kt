package com.voltfitness.healthbridge.core

import java.io.File
import java.io.InputStream
import java.security.MessageDigest

fun copyVerifiedUpdate(input:InputStream,target:File,release:AppRelease,onProgress:(Int)->Unit = {}) {
    var valid=false
    try {
        val digest=MessageDigest.getInstance("SHA-256")
        var count=0L
        var previous=-1
        target.outputStream().use { output ->
            val buffer=ByteArray(32*1024)
            while(true) {
                val read=input.read(buffer)
                if(read<0)break
                count+=read
                require(count<=release.bytes){"Размер обновления не совпадает с описанием"}
                digest.update(buffer,0,read)
                output.write(buffer,0,read)
                val percent=(count*100/release.bytes).toInt()
                if(percent!=previous){onProgress(percent);previous=percent}
            }
        }
        require(count==release.bytes){"Обновление скачано не полностью"}
        val sha=digest.digest().joinToString(""){"%02x".format(it)}
        require(sha==release.sha256){"Контрольная сумма обновления не совпадает"}
        valid=true
    }finally{if(!valid)target.delete()}
}

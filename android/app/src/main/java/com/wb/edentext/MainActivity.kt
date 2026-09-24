package com.wb.edentext

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Message
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import java.io.File
import java.io.FileOutputStream

class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val cb = fileCallback ?: return@registerForActivityResult
        val data = result.data
        val uris: Array<Uri>? = when {
            result.resultCode == Activity.RESULT_OK && data != null && data.data != null ->
                arrayOf(data.data!!)
            else -> null
        }
        cb.onReceiveValue(uris)
        fileCallback = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        web = WebView(this)
        setContentView(web)

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            mediaPlaybackRequiresUserGesture = false
            setSupportZoom(false)
            builtInZoomControls = false
            loadWithOverviewMode = true
            useWideViewPort = true
        }

        web.webViewClient = object : WebViewClient() {
            // 所有导航都留在 WebView 内，不跳出外部浏览器
            override fun shouldOverrideUrlLoading(
                view: WebView?, request: android.webkit.WebResourceRequest?
            ): Boolean {
                val url = request?.url?.toString() ?: return false
                return if (url.startsWith("http://") || url.startsWith("https://")
                    || url.startsWith("file://") || url.startsWith("about:")) {
                    false // 留在 WebView
                } else {
                    true
                }
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            // 应用内「打开文件」按钮 → 系统文件选择器
            override fun onShowFileChooser(
                view: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = filePathCallback
                val mimeTypes = fileChooserParams?.acceptTypes?.takeIf { it.isNotEmpty() }
                val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes ?: arrayOf(
                        "application/vnd.oasis.opendocument.text",
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        "application/pdf",
                        "text/markdown",
                        "text/plain"
                    ))
                }
                return try {
                    fileChooserLauncher.launch(intent)
                    true
                } catch (e: Exception) {
                    fileCallback = null
                    false
                }
            }
        }

        // 「另存/导出」触发的下载 → 存到应用 Download 目录并提示
        web.setDownloadListener { url, _, contentDisposition, mimeType, _ ->
            saveDownload(url, contentDisposition, mimeType)
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })

        web.loadUrl("file:///android_asset/edentext/index.html")
    }

    private fun saveDownload(url: String, contentDisposition: String?, mimeType: String?) {
        try {
            val name = parseFileName(contentDisposition, url)
            val dir = File(getExternalFilesDir(null), "Download").apply { mkdirs() }
            val out = File(dir, name)
            when {
                url.startsWith("data:") -> {
                    val comma = url.indexOf(',')
                    if (comma < 0) return
                    val base64 = url.substring(comma + 1)
                    FileOutputStream(out).use { it.write(android.util.Base64.decode(base64, android.util.Base64.DEFAULT)) }
                }
                url.startsWith("http") -> {
                    // 远程 URL（正常离线应用不会走到这里）
                    Toast.makeText(this, "正在下载…", Toast.LENGTH_SHORT).show()
                }
                else -> {
                    Toast.makeText(this, "导出文件：${out.absolutePath}", Toast.LENGTH_LONG).show()
                    return
                }
            }
            Toast.makeText(this, "已保存：${out.absolutePath}", Toast.LENGTH_LONG).show()
        } catch (e: Exception) {
            Toast.makeText(this, "保存失败：${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun parseFileName(cd: String?, url: String): String {
        cd?.let {
            val m = Regex("filename\\*?=?\"?([^\";]+)\"?").find(it)
            m?.groupValues?.getOrNull(1)?.let { n -> if (n.isNotBlank()) return n.trim() }
        }
        val fromUrl = url.substringAfterLast('/').substringBefore('?').substringBefore('#')
        return if (fromUrl.isNotBlank()) fromUrl else "document-${System.currentTimeMillis()}"
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }
}

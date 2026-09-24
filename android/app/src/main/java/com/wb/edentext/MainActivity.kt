package com.wb.edentext

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import java.io.File
import java.io.FileOutputStream

class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private lateinit var assetLoader: WebViewAssetLoader
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

        // 关键：用 WebViewAssetLoader 把 assets 映射成 https 源。
        // 直接 file:// 加载会被 CORS 拦截 ES Module 脚本（Svelte 应用挂载失败），
        // 伪装成 https://appassets.androidplatform.net 后 module / wasm 才能正常加载。
        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

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
            override fun shouldInterceptRequest(
                view: WebView?, request: WebResourceRequest?
            ): WebResourceResponse? {
                return request?.url?.let { assetLoader.shouldInterceptRequest(it) }
            }

            override fun shouldOverrideUrlLoading(
                view: WebView?, request: WebResourceRequest?
            ): Boolean {
                // 应用内资源与同页导航一律留在 WebView 内
                return false
            }
        }

        web.webChromeClient = object : WebChromeClient() {
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

        web.setDownloadListener { url, _, contentDisposition, mimeType, _ ->
            saveDownload(url, contentDisposition, mimeType)
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })

        web.loadUrl("https://appassets.androidplatform.net/assets/edentext/index.html")
    }

    private fun saveDownload(url: String, contentDisposition: String?, mimeType: String?) {
        try {
            val name = parseFileName(contentDisposition, url)
            // 保存子目录名（可在设置里改，默认“陈律文档”）
            val prefs = getSharedPreferences("edentext", MODE_PRIVATE)
            val subDir = prefs.getString("save_subdir", "陈律文档")?.takeIf { it.isNotBlank() } ?: "陈律文档"
            if (!url.startsWith("data:")) {
                Toast.makeText(this, "正在导出：$name", Toast.LENGTH_LONG).show()
                return
            }
            val comma = url.indexOf(',')
            if (comma < 0) return
            val bytes = android.util.Base64.decode(url.substring(comma + 1), android.util.Base64.DEFAULT)
            val mime = mimeType ?: guessMime(name)

            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                val resolver = contentResolver
                val values = android.content.ContentValues().apply {
                    put(android.provider.MediaStore.Downloads.DISPLAY_NAME, name)
                    put(android.provider.MediaStore.Downloads.MIME_TYPE, mime)
                    put(android.provider.MediaStore.Downloads.RELATIVE_PATH,
                        android.os.Environment.DIRECTORY_DOWNLOADS + "/$subDir")
                }
                val uri = resolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    ?: throw Exception("无法创建下载项")
                resolver.openOutputStream(uri)?.use { it.write(bytes) }
            } else {
                @Suppress("DEPRECATION")
                val dir = java.io.File(
                    android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS),
                    subDir
                ).apply { mkdirs() }
                java.io.FileOutputStream(java.io.File(dir, name)).use { it.write(bytes) }
            }
            Toast.makeText(this, "已保存：Download/$subDir/$name", Toast.LENGTH_LONG).show()
        } catch (e: Exception) {
            Toast.makeText(this, "保存失败：${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun guessMime(name: String): String = when {
        name.endsWith(".docx", true) -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        name.endsWith(".odt", true) -> "application/vnd.oasis.opendocument.text"
        name.endsWith(".pdf", true) -> "application/pdf"
        else -> "application/octet-stream"
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

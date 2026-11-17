package com.nimzz.lyra

import android.content.ContentValues
import android.content.Context
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.webkit.MimeTypeMap
import com.yausername.aria2c.Aria2c
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import org.json.JSONArray
import org.json.JSONObject

object LyraYtdlp {

    fun interface Sink {
        fun send(json: String)
    }

    private val pool = Executors.newCachedThreadPool()
    private val cancelled = ConcurrentHashMap.newKeySet<String>()
    private val initLock = Any()

    @Volatile
    private var ready = false

    private fun ensureReady(ctx: Context) {
        if (ready) return
        synchronized(initLock) {
            if (ready) return
            YoutubeDL.init(ctx)
            FFmpeg.init(ctx)
            Aria2c.init(ctx)
            ready = true
        }
    }

    private fun ok(block: JSONObject.() -> Unit): String =
        JSONObject().put("ok", true).apply(block).toString()

    private fun fail(t: Throwable): String {
        val raw = t.message ?: t.javaClass.simpleName
        val msg = raw.lineSequence().lastOrNull { it.isNotBlank() } ?: raw
        return JSONObject().put("ok", false).put("error", msg.take(400)).toString()
    }

    @JvmStatic
    fun abi(): String =
        Build.SUPPORTED_ABIS.firstOrNull { it == "arm64-v8a" || it == "armeabi-v7a" || it == "x86_64" || it == "x86" }
            ?: Build.SUPPORTED_ABIS.firstOrNull().orEmpty()

    @JvmStatic
    fun saveCookies(ctx: Context, text: String): Boolean =
        try {
            val f = File(ctx.filesDir, "cookies.txt")
            if (text.isBlank()) f.delete() else f.writeText(text)
            true
        } catch (_: Throwable) {
            false
        }

    @JvmStatic
    fun hasCookies(ctx: Context): Boolean = File(ctx.filesDir, "cookies.txt").let { it.exists() && it.length() > 0 }

    @JvmStatic
    fun version(ctx: Context, sink: Sink) {
        pool.execute {
            sink.send(
                try {
                    ensureReady(ctx)
                    ok { put("version", YoutubeDL.getInstance().version(ctx) ?: "") }
                } catch (t: Throwable) {
                    fail(t)
                }
            )
        }
    }

    @JvmStatic
    fun update(ctx: Context, channel: String, sink: Sink) {
        pool.execute {
            sink.send(
                try {
                    ensureReady(ctx)
                    val ch =
                        if (channel == "nightly") YoutubeDL.UpdateChannel.NIGHTLY
                        else YoutubeDL.UpdateChannel.STABLE
                    val status = YoutubeDL.getInstance().updateYoutubeDL(ctx, ch)
                    ok {
                        put("status", status?.name ?: "UNKNOWN")
                        put("version", YoutubeDL.getInstance().version(ctx) ?: "")
                    }
                } catch (t: Throwable) {
                    fail(t)
                }
            )
        }
    }

    private fun applyCommon(req: YoutubeDLRequest, ctx: Context, o: JSONObject) {
        if (o.optBoolean("ipv4")) req.addOption("-4")
        val proxy = o.optString("proxy")
        if (proxy.isNotBlank()) req.addOption("--proxy", proxy)
        if (o.optBoolean("cookies")) {
            val f = File(ctx.filesDir, "cookies.txt")
            if (f.exists() && f.length() > 0) req.addOption("--cookies", f.absolutePath)
        }
        req.addOption("--socket-timeout", "15")
    }

    @JvmStatic
    fun info(ctx: Context, optsJson: String, sink: Sink) {
        pool.execute {
            sink.send(
                try {
                    ensureReady(ctx)
                    val o = JSONObject(optsJson)
                    val url = o.getString("url")
                    val taskId = o.optString("taskId", "info-" + System.nanoTime())
                    val req = YoutubeDLRequest(url)
                    req.addOption("--dump-single-json")
                    req.addOption("--no-warnings")
                    if (o.optBoolean("playlist")) {
                        req.addOption("--flat-playlist")
                    } else {
                        req.addOption("--no-playlist")
                    }
                    applyCommon(req, ctx, o)
                    val out = YoutubeDL.getInstance().execute(request = req, processId = taskId).out
                    ok { put("info", slim(JSONObject(out))) }
                } catch (t: Throwable) {
                    fail(t)
                }
            )
        }
    }

    private fun slim(src: JSONObject): JSONObject {
        val r = JSONObject()
        for (k in listOf(
            "id", "title", "uploader", "channel", "duration", "thumbnail", "webpage_url",
            "extractor_key", "extractor", "view_count", "upload_date", "playlist_count", "_type"
        )) {
            if (src.has(k) && !src.isNull(k)) r.put(k, src.get(k))
        }
        val fmts = src.optJSONArray("formats")
        if (fmts != null) {
            val out = JSONArray()
            for (i in 0 until fmts.length()) {
                val f = fmts.optJSONObject(i) ?: continue
                val item = JSONObject()
                for (k in listOf(
                    "format_id", "ext", "height", "width", "fps", "vcodec", "acodec", "filesize",
                    "filesize_approx", "abr", "tbr", "format_note", "protocol"
                )) {
                    if (f.has(k) && !f.isNull(k)) item.put(k, f.get(k))
                }
                out.put(item)
            }
            r.put("formats", out)
        }
        val entries = src.optJSONArray("entries")
        if (entries != null) {
            val out = JSONArray()
            for (i in 0 until entries.length()) {
                val e = entries.optJSONObject(i) ?: continue
                val item = JSONObject()
                for (k in listOf("id", "title", "url", "webpage_url", "duration", "thumbnail", "uploader")) {
                    if (e.has(k) && !e.isNull(k)) item.put(k, e.get(k))
                }
                out.put(item)
            }
            r.put("entries", out)
        }
        return r
    }

    @JvmStatic
    fun cancel(taskId: String) {
        cancelled.add(taskId)
        try {
            YoutubeDL.destroyProcessById(taskId)
        } catch (_: Throwable) {
        }
    }

    @JvmStatic
    fun download(ctx: Context, optsJson: String, events: Sink, done: Sink) {
        pool.execute {
            var taskId = ""
            var work: File? = null
            try {
                ensureReady(ctx)
                val o = JSONObject(optsJson)
                taskId = o.getString("taskId")
                val url = o.getString("url")
                val mode = o.optString("mode", "video")
                val height = o.optInt("height", 0)
                val formatId = o.optString("formatId")
                val audioFormat = o.optString("audioFormat", "m4a")
                val subDir = o.optString("subDir", "Lyra").ifBlank { "Lyra" }

                work = File(ctx.cacheDir, "ytdlp/$taskId").also { it.deleteRecursively(); it.mkdirs() }
                val req = YoutubeDLRequest(url)
                req.addOption("-o", File(work, "%(title).180B [%(id)s].%(ext)s").absolutePath)
                req.addOption("--no-mtime")
                req.addOption("--newline")
                if (!o.optBoolean("playlist")) req.addOption("--no-playlist")
                if (o.optBoolean("restrictNames")) req.addOption("--restrict-filenames")
                applyCommon(req, ctx, o)

                if (o.optBoolean("aria2c")) {
                    req.addOption("--downloader", "libaria2c.so")
                    req.addOption("--external-downloader-args", "aria2c:-x 8 -k 1M")
                }

                if (mode == "audio") {
                    req.addOption("-x")
                    if (formatId.isNotBlank()) req.addOption("-f", formatId) else req.addOption("-f", "ba/b")
                    if (audioFormat != "best") req.addOption("--audio-format", audioFormat)
                    req.addOption("--audio-quality", "0")
                    if (o.optBoolean("embedThumbnail", true)) {
                        req.addOption("--embed-thumbnail")
                        req.addOption("--convert-thumbnails", "jpg")
                    }
                } else {
                    if (formatId.isNotBlank()) {
                        req.addOption("-f", "$formatId+ba/$formatId/b")
                    } else if (height > 0) {
                        req.addOption("-f", "bv*[height<=$height]+ba/b[height<=$height]/b")
                    } else {
                        req.addOption("-f", "bv*+ba/b")
                    }
                    req.addOption("-S", "ext:mp4:m4a")
                    req.addOption("--merge-output-format", "mp4")
                }
                if (o.optBoolean("embedMetadata", true)) req.addOption("--add-metadata")
                if (o.optBoolean("subtitles") && mode != "audio") {
                    req.addOption("--write-subs")
                    req.addOption("--write-auto-subs")
                    req.addOption("--sub-langs", o.optString("subLangs", "en.*").ifBlank { "en.*" })
                    req.addOption("--embed-subs")
                }
                val sponsor = o.optBoolean("sponsorblock")
                if (sponsor) req.addOption("--sponsorblock-remove", "sponsor,selfpromo,interaction")

                val id = taskId
                YoutubeDL.getInstance().execute(request = req, processId = id) { progress, eta, line ->
                    events.send(
                        JSONObject()
                            .put("type", "progress")
                            .put("taskId", id)
                            .put("progress", progress.toDouble())
                            .put("eta", eta)
                            .put("line", line ?: "")
                            .toString()
                    )
                }

                events.send(JSONObject().put("type", "saving").put("taskId", id).toString())
                val produced = (work.listFiles() ?: emptyArray())
                    .filter { it.isFile && !isTemp(it.name) }
                    .sortedBy { it.name }
                if (produced.isEmpty()) throw IllegalStateException("No output file")
                val saved = JSONArray()
                for (f in produced) {
                    saved.put(publish(ctx, f, subDir))
                }
                done.send(ok { put("taskId", id); put("files", saved) })
            } catch (t: Throwable) {
                val wasCancelled = taskId.isNotEmpty() && cancelled.remove(taskId)
                done.send(
                    if (wasCancelled) JSONObject().put("ok", false).put("cancelled", true).put("taskId", taskId).toString()
                    else JSONObject(fail(t)).put("taskId", taskId).toString()
                )
            } finally {
                try { work?.deleteRecursively() } catch (_: Throwable) {}
            }
        }
    }

    private fun isTemp(name: String): Boolean {
        val n = name.lowercase()
        return n.endsWith(".part") || n.endsWith(".ytdl") || n.endsWith(".temp") || n.endsWith(".json") ||
            n.endsWith(".webp") || n.endsWith(".jpg") || n.endsWith(".png") || n.endsWith(".vtt") || n.endsWith(".srt")
    }

    private fun mimeOf(name: String): String {
        val ext = name.substringAfterLast('.', "").lowercase()
        return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: when (ext) {
            "mkv" -> "video/x-matroska"
            "opus" -> "audio/ogg"
            else -> "application/octet-stream"
        }
    }

    private fun publish(ctx: Context, f: File, subDir: String): JSONObject {
        val mime = mimeOf(f.name)
        val rel = Environment.DIRECTORY_DOWNLOADS + "/" + subDir
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val cv = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, f.name)
                put(MediaStore.MediaColumns.MIME_TYPE, mime)
                put(MediaStore.MediaColumns.RELATIVE_PATH, rel)
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            val resolver = ctx.contentResolver
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv)
                ?: throw IllegalStateException("Cannot create file in Downloads")
            resolver.openOutputStream(uri)!!.use { out -> f.inputStream().use { it.copyTo(out) } }
            cv.clear()
            cv.put(MediaStore.MediaColumns.IS_PENDING, 0)
            resolver.update(uri, cv, null, null)
            return JSONObject().put("name", f.name).put("uri", uri.toString())
                .put("path", "/storage/emulated/0/$rel/${f.name}").put("mime", mime).put("size", f.length())
        }
        val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), subDir)
        dir.mkdirs()
        val dest = File(dir, f.name)
        f.copyTo(dest, overwrite = true)
        MediaScannerConnection.scanFile(ctx, arrayOf(dest.absolutePath), arrayOf(mime), null)
        return JSONObject().put("name", f.name).put("path", dest.absolutePath).put("mime", mime).put("size", dest.length())
    }
}

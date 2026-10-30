const $ = (id) => document.getElementById(id);
const TEXT = ["title", "version", "description", "changelog", "info", "video_url", "download_url", "author",
  "author_icon", "thumbnail", "image", "footer", "color", "mention", "username"];
const CHECKS = ["timestamp", "group"];
const CRED = ["webhook_url", "bot_token", "channel_id"];
let mode = "webhook";

// ---------- Markdown Discord (versi ringkas untuk preview) ----------
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const safeUrl = (u) => (/^https?:\/\/\S+$/.test(u || "") ? esc(u) : "");

function md(text) {
  const blocks = [];
  let s = esc(text).replace(/```(?:\w+\n)?([\s\S]*?)```/g, (_, c) => {
    blocks.push(`<pre><code>${c.replace(/\n$/, "")}</code></pre>`);
    return `\u0000${blocks.length - 1}\u0000`;
  });
  s = s
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*\*(.+?)\*\*\*/g, "<b><i>$1</i></b>")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/__(.+?)__/g, "<u>$1</u>")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<i>$2</i>")
    .replace(/~~(.+?)~~/g, "<s>$1</s>")
    .replace(/\|\|(.+?)\|\|/g, '<span class="spoiler" onclick="this.classList.toggle(\'show\')">$1</span>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" onclick="return false">$1</a>')
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" onclick="return false">$2</a>')
    .replace(/^&gt; (.*)$/gm, "<blockquote>$1</blockquote>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[i]);
}

// ---------- Form data ----------
function collect(withCreds) {
  const fd = new FormData();
  fd.append("mode", mode);
  TEXT.forEach((k) => fd.append(k, $(k).value));
  CHECKS.forEach((k) => fd.append(k, $(k).checked ? "1" : ""));
  if (withCreds) {
    CRED.forEach((k) => fd.append(k, $(k).value));
    const f = $("video_file").files[0];
    if (f) fd.append("video_file", f);
  }
  return fd;
}

// ---------- Preview (dirender dari payload backend, jadi pasti sama dengan yang terkirim) ----------
function drawPreview(p, total) {
  const e = p.embed || p.embeds[0];
  const name = $("username").value.trim() || "Update Announcer";
  $("pvName").textContent = name;
  $("pvAvatar").textContent = name[0].toUpperCase();
  $("pvTime").textContent = "Hari ini pukul " + new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  $("pvContent").innerHTML = md(p.content || "");

  const embed = $("pvEmbed");
  embed.style.borderLeftColor = "#" + (e.color || 0).toString(16).padStart(6, "0");
  const icon = safeUrl(e.author && e.author.icon_url);
  const thumb = safeUrl(e.thumbnail && e.thumbnail.url);
  const img = safeUrl(e.image && e.image.url);
  const fields = (e.fields || []).map((f) =>
    `<div class="e-field${f.inline ? " inline" : ""}"><div class="e-fname">${f.name === "\u200b" ? "&nbsp;" : esc(f.name)}</div>${md(f.value)}</div>`).join("");
  const ts = e.timestamp ? " • " + new Date(e.timestamp).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "";

  embed.innerHTML = `<div class="e-grid">
    ${e.author ? `<div class="e-author">${icon ? `<img src="${icon}" alt="">` : ""}${esc(e.author.name)}</div>` : ""}
    <div class="e-title">${esc(e.title)}</div>
    ${e.description ? `<div class="e-desc">${md(e.description)}</div>` : ""}
    ${thumb ? `<img class="e-thumb" src="${thumb}" alt="">` : ""}
    ${fields ? `<div class="e-fields">${fields}</div>` : ""}
    ${img ? `<img class="e-img" src="${img}" alt="">` : ""}
    <div class="e-foot">${esc(e.footer.text)}${ts}</div></div>`;

  const c = $("counter");
  c.textContent = `${total}/6000`;
  c.classList.toggle("warn", total > 5800);

  const f = $("video_file").files[0];
  $("pvFile").classList.toggle("hidden", !f);
  if (f) $("pvFile").textContent = `🎞️ ${f.name} (${(f.size / 1048576).toFixed(1)} MB), dikirim sebagai lampiran`;
}

let timer;
function schedulePreview() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      const r = await fetch("/api/preview", { method: "POST", body: collect(false) });
      const d = await r.json();
      drawPreview(d.payload, d.total);
      setStatus(true);
    } catch (_) { setStatus(false); }
  }, 200);
}
function setStatus(on) {
  $("status").classList.toggle("on", on);
  $("status").lastChild.textContent = on ? "server online" : "offline";
}

// ---------- Mode, kredensial ----------
document.querySelectorAll(".tile").forEach((t) =>
  t.addEventListener("click", () => {
    mode = t.dataset.mode;
    document.querySelectorAll(".tile").forEach((x) => x.classList.toggle("active", x === t));
    $("webhookBox").classList.toggle("hidden", mode !== "webhook");
    $("botBox").classList.toggle("hidden", mode !== "bot");
  })
);

function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem("announcer") || "null");
    if (!saved) return;
    $("remember").checked = true;
    CRED.forEach((k) => { if (saved[k]) $(k).value = saved[k]; });
  } catch (_) { /* abaikan */ }
}
function saveCreds() {
  try {
    if ($("remember").checked) localStorage.setItem("announcer", JSON.stringify(Object.fromEntries(CRED.map((k) => [k, $(k).value]))));
    else localStorage.removeItem("announcer");
  } catch (_) { /* abaikan */ }
}

// ---------- Helper changelog & warna ----------
document.querySelectorAll("[data-ins]").forEach((b) =>
  b.addEventListener("click", () => {
    const ta = $("changelog");
    let pos = ta.selectionStart;
    if (pos > 0 && ta.value[pos - 1] !== "\n") { ta.setRangeText("\n", pos, pos, "end"); pos++; }
    ta.setRangeText(b.dataset.ins, pos, pos, "end");
    ta.focus();
    schedulePreview();
  })
);
function markSwatch() {
  document.querySelectorAll("#swatches button").forEach((b) => b.classList.toggle("on", b.dataset.c === $("color").value.toLowerCase()));
}
document.querySelectorAll("#swatches button").forEach((b) =>
  b.addEventListener("click", () => { $("color").value = b.dataset.c; markSwatch(); schedulePreview(); })
);
$("color").addEventListener("input", markSwatch);

// ---------- UI helpers ----------
function showErrors(list) {
  const box = $("errors");
  box.classList.toggle("hidden", !list.length);
  box.innerHTML = "<ul>" + list.map((e) => `<li>${esc(e)}</li>`).join("") + "</ul>";
}
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 3000);
}

function clientErrors() {
  const e = [];
  if (mode === "webhook" && !/^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test($("webhook_url").value.trim()))
    e.push("Webhook URL tidak valid.");
  if (mode === "bot") {
    if ($("bot_token").value.trim().length < 30) e.push("Token bot belum diisi dengan benar.");
    if (!/^\d{15,25}$/.test($("channel_id").value.trim())) e.push("Channel ID harus berupa angka.");
  }
  if (!$("title").value.trim()) e.push("Judul wajib diisi.");
  if (!$("description").value.trim() && !$("changelog").value.trim()) e.push("Isi deskripsi atau changelog.");
  ["video_url", "download_url", "author_icon", "thumbnail", "image"].forEach((k) => {
    const v = $(k).value.trim();
    if (v && !/^https?:\/\/\S+$/.test(v)) e.push(`Isi "${k}" harus diawali http:// atau https://`);
  });
  const f = $("video_file").files[0];
  if (f && f.size > 10 * 1048576) e.push("File video lebih dari 10 MB. Gunakan link YouTube/Drive.");
  return e;
}

// ---------- Kirim ----------
$("form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const errs = clientErrors();
  showErrors(errs);
  if (errs.length) return;

  const btn = $("send"), label = btn.querySelector("span");
  btn.disabled = true;
  label.textContent = "Mengirim…";
  try {
    const res = await fetch("/api/send", { method: "POST", body: collect(true) });
    const data = await res.json();
    if (!data.ok) return showErrors(data.errors || ["Gagal mengirim."]);
    saveCreds();
    toast("terkirim ke discord ✓");
    loadHistory();
  } catch (_) {
    showErrors(["Tidak bisa menghubungi server. Pastikan app.py masih berjalan."]);
  } finally {
    btn.disabled = false;
    label.textContent = "Kirim ke Discord";
  }
});

// ---------- History ----------
async function loadHistory() {
  const ul = $("history");
  const items = await (await fetch("/api/history")).json();
  ul._items = items;
  if (!items.length) { ul.innerHTML = '<li class="empty">belum ada pesan terkirim</li>'; return; }
  ul.innerHTML = items.map((i) => `
    <li>
      <div>
        <div class="t">${esc(i.form.title)}${i.form.version ? " · " + esc(i.form.version) : ""}</div>
        <div class="s">${new Date(i.sent_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })} · ${esc(i.target)}</div>
      </div>
      <div class="acts">
        <button type="button" data-use="${i.id}">pakai</button>
        <button type="button" class="del" data-del="${i.id}">hapus</button>
      </div>
    </li>`).join("");
}
$("history").addEventListener("click", async (e) => {
  const { use, del } = e.target.dataset;
  if (use) {
    const f = $("history")._items.find((i) => i.id === use).form;
    TEXT.forEach((k) => { if (f[k] !== undefined) $(k).value = f[k]; });
    CHECKS.forEach((k) => { if (f[k] !== undefined) $(k).checked = f[k] === "1"; });
    markSwatch();
    schedulePreview();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else if (del) {
    await fetch("/api/history/" + del, { method: "DELETE" });
    loadHistory();
  }
});
$("clearHist").addEventListener("click", async () => {
  if (confirm("Hapus semua history?")) { await fetch("/api/history", { method: "DELETE" }); loadHistory(); }
});

// ---------- Init ----------
[...TEXT, ...CHECKS, "video_file"].forEach((k) => {
  $(k).addEventListener("input", schedulePreview);
  $(k).addEventListener("change", schedulePreview);
});
loadSaved();
markSwatch();
schedulePreview();
loadHistory();

// Hormati pengaturan "kurangi animasi": video latar tidak diputar
if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) document.querySelector(".bg-video").pause();

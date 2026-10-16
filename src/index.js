const MAX_BYTES = 200 * 1024 * 1024; // 200 MiB cap for this starter project
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function errorPage(message, status = 400) {
  return new Response(`<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CloudFetch</title><style>body{font:16px system-ui;max-width:680px;margin:12vh auto;padding:24px;color:#222}a{color:#6750d8}</style><h1>Không thể tải tệp</h1><p>${escapeHtml(message)}</p><p><a href="/">← Quay lại CloudFetch</a></p></html>`, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }
  });
}

function validateUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error("URL không hợp lệ."); }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Chỉ hỗ trợ liên kết HTTP hoặc HTTPS.");
  }
  if (url.username || url.password) throw new Error("URL không được chứa thông tin đăng nhập.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") ||
      host.endsWith(".local") || host.endsWith(".internal") ||
      host === "metadata.google.internal") {
    throw new Error("Tên máy chủ này không được hỗ trợ.");
  }
  // Disallow IP-literal hosts in this public-facing starter to reduce SSRF risk.
  if (host.includes(":") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    throw new Error("Liên kết dùng địa chỉ IP trực tiếp không được hỗ trợ; hãy dùng tên miền công khai.");
  }
  return url;
}

function getFilename(response, url) {
  const cd = response.headers.get("content-disposition") || "";
  const extended = cd.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  const simple = cd.match(/filename\s*=\s*"?([^";]+)"?/i);
  let name = "";
  if (extended) {
    try { name = decodeURIComponent(extended[1].trim()); } catch {}
  } else if (simple) name = simple[1].trim();
  if (!name) {
    const segment = url.pathname.split("/").filter(Boolean).pop();
    try { name = decodeURIComponent(segment || "download"); } catch { name = segment || "download"; }
  }
  name = name.replace(/[\u0000-\u001f\u007f"\\/:*?<>|]/g, "_").trim();
  if (!name || name === "." || name === "..") name = "download";
  return name.slice(0, 180);
}

async function handleDownload(request) {
  const incoming = new URL(request.url);
  const raw = incoming.searchParams.get("url");
  if (!raw) return errorPage("Hãy quay lại trang chính và dán liên kết tải xuống.");

  let target;
  try { target = validateUrl(raw); }
  catch (err) { return errorPage(err.message); }

  const requestHeaders = new Headers({ "user-agent": "CloudFetch/1.0" });
  // Forward range validators so a browser can request a byte range when supported.
  for (const header of ["range", "if-range", "if-modified-since", "if-none-match"]) {
    const value = request.headers.get(header);
    if (value) requestHeaders.set(header, value);
  }

  let upstream;
  for (let hops = 0; hops <= 5; hops++) {
    try {
      upstream = await fetch(target.toString(), { method: "GET", headers: requestHeaders, redirect: "manual" });
    } catch {
      return errorPage("Không kết nối được máy chủ nguồn. Hãy kiểm tra URL hoặc thử lại sau.", 502);
    }
    if (!REDIRECT_CODES.has(upstream.status)) break;
    const location = upstream.headers.get("location");
    if (!location) return errorPage("Máy chủ nguồn trả về chuyển hướng không hợp lệ.", 502);
    if (hops === 5) return errorPage("Liên kết chuyển hướng quá nhiều lần.", 502);
    try { target = validateUrl(new URL(location, target).toString()); }
    catch (err) { return errorPage("Chuyển hướng bị chặn: " + err.message, 502); }
  }

  if (!upstream) return errorPage("Không nhận được phản hồi từ máy chủ nguồn.", 502);
  if (upstream.status >= 400) {
    return errorPage(`Máy chủ nguồn trả về lỗi HTTP ${upstream.status}. Link có thể hết hạn hoặc cần đăng nhập.`, 502);
  }
  const length = Number(upstream.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BYTES) {
    return errorPage("Tệp vượt giới hạn 200 MiB của bản mẫu này.", 413);
  }
  if (!upstream.body) return errorPage("Máy chủ nguồn không trả về dữ liệu tệp.", 502);

  const filename = getFilename(upstream, target).replace(/["\\]/g, "_");
  const outHeaders = new Headers({
    "content-type": upstream.headers.get("content-type") || "application/octet-stream",
    "content-disposition": `attachment; filename="${filename}"`,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  for (const header of ["content-length", "content-range", "accept-ranges"]) {
    const value = upstream.headers.get(header);
    if (value) outHeaders.set(header, value);
  }

  // Stream bytes instead of buffering the full file in memory.
  let sent = 0;
  const body = upstream.body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      sent += chunk.byteLength;
      if (sent > MAX_BYTES) {
        controller.error(new Error("Download exceeded the 200 MiB limit."));
        return;
      }
      controller.enqueue(chunk);
    }
  }));
  return new Response(body, { status: upstream.status, headers: outHeaders });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/download") {
      if (request.method !== "GET") {
        return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET" } });
      }
      return handleDownload(request);
    }
    return env.ASSETS.fetch(request);
  }
};

import net from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
]);

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // Cloud metadata / link-local
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // Unique local
  if (lower.startsWith("fe80")) return true; // Link local
  if (lower.startsWith("::ffff:")) {
    return isPrivateIpv4(lower.slice("::ffff:".length));
  }
  return false;
}

export function assertSafeExternalUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error("URL 格式不合法，请输入完整的 http:// 或 https:// 地址");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("仅允许访问 http 或 https 协议地址");
  }

  if (process.env.ALLOW_LOCAL_URLS === "true") {
    return parsed;
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("出于服务器安全策略（SSRF 防护），禁止请求内网或本机保留地址");
  }

  const ipType = net.isIP(host);
  if (ipType === 4 && isPrivateIpv4(host)) {
    throw new Error("出于服务器安全策略（SSRF 防护），禁止请求私有内网 IP 地址");
  }
  if (ipType === 6 && isPrivateIpv6(host)) {
    throw new Error("出于服务器安全策略（SSRF 防护），禁止请求本地或内网 IPv6 地址");
  }

  return parsed;
}

import { RENDERER_URL_HINT } from "./constants.mjs";

function validPort(port) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("CDP 端口必须在 1024 到 65535 之间");
  return port;
}

function loopbackSocket(value) {
  const url = new URL(value);
  if (url.protocol !== "ws:" || url.hostname !== "127.0.0.1" || !url.port) {
    throw new Error("只允许连接 127.0.0.1 的 CDP WebSocket");
  }
  validPort(Number(url.port));
  return value;
}

export async function fetchRendererTargets(port, { fetchImpl = globalThis.fetch, timeoutMs = 3000 } = {}) {
  validPort(port);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`http://127.0.0.1:${port}/json/list`, {
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const targets = await response.json();
    if (!Array.isArray(targets)) throw new Error("CDP 返回值不是数组");
    return targets.filter((target) => {
      try {
        return target?.type === "page" && target.url?.includes(RENDERER_URL_HINT) && loopbackSocket(target.webSocketDebuggerUrl);
      } catch {
        return false;
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function waitForRendererTargets(port, { timeoutMs = 20_000, pollMs = 400 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const targets = await fetchRendererTargets(port, { timeoutMs: Math.min(3000, deadline - Date.now()) });
      if (targets.length) return targets;
      lastError = new Error("未发现 renderer/index.html 页面");
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`等待 WorkBuddy 渲染页超时：${lastError?.message ?? "未知错误"}`);
}

export class CdpSession {
  constructor(webSocketDebuggerUrl, { WebSocketImpl = globalThis.WebSocket, timeoutMs = 5000 } = {}) {
    this.url = loopbackSocket(webSocketDebuggerUrl);
    this.WebSocketImpl = WebSocketImpl;
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.eventHandlers = new Map();
  }

  open() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("CDP WebSocket 连接超时")), this.timeoutMs);
      this.socket = new this.WebSocketImpl(this.url);
      this.socket.onopen = () => {
        clearTimeout(timer);
        resolve(this);
      };
      this.socket.onerror = () => {
        clearTimeout(timer);
        reject(new Error("CDP WebSocket 连接失败"));
      };
      this.socket.onmessage = (event) => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.method) {
          for (const handler of this.eventHandlers.get(message.method) ?? []) {
            try { handler(message.params ?? {}); } catch { /* 事件处理失败不应阻断 CDP 响应。 */ }
          }
        }
        const request = this.pending.get(message.id);
        if (!request) return;
        clearTimeout(request.timer);
        this.pending.delete(message.id);
        if (message.error) request.reject(new Error(`CDP 调用失败：${message.error.message}`));
        else request.resolve(message.result);
      };
      this.socket.onclose = () => {
        for (const request of this.pending.values()) {
          clearTimeout(request.timer);
          request.reject(new Error("CDP WebSocket 已关闭"));
        }
        this.pending.clear();
      };
    });
  }

  on(method, handler) {
    const handlers = this.eventHandlers.get(method) ?? new Set();
    handlers.add(handler);
    this.eventHandlers.set(method, handlers);
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) this.eventHandlers.delete(method);
    };
  }

  send(method, params = {}, timeoutMs = this.timeoutMs) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} 超时`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "注入脚本执行失败");
    return result.result?.value;
  }

  close() {
    this.eventHandlers.clear();
    this.socket?.close();
  }
}

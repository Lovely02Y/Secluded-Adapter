import { default as Sec_WebSocket } from 'ws';
import sec from './index.js';
import crypto from 'crypto';
let hasws = false;
class WebSocketClient {
  constructor() {
    this.config = sec.config;
    this.echo = new Map();
    this.timeout = 60000;
    this.sec_ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 3000;
    this.token = null;
    this.seq = Math.floor(10000 + (crypto.randomBytes(2).readUInt16BE() / 65535) * 50001);
    this.maxConcurrent = this.config.maxConcurrent; // 最大并发数
    this.currentConcurrent = 0; // 当前并发数
    this.queue = []; // 等待队列
    this.ws_url = this.config.ws_url;
    this.ws_secretToken = this.config.ws_secretToken;
    this.name = 'Secluded';
    this.init();
  }

  /**
   * 初始化WebSocket连接
   */
  init() {
    try {
      if (hasws) return false;
      hasws = true;
      setTimeout(async () => {
        hasws = false;
      }, 1500);
      this.sec_ws = new Sec_WebSocket(this.ws_url, {
        headers: {
          Authorization: `Bearer ${this.config.ws_secretToken}`,
        },
      });
      this.sec_ws.on('open', () => this.onOpen());
      this.sec_ws.on('message', (data) => this.onMessage(data));
      this.sec_ws.on('error', (error) => this.onError(error));
      this.sec_ws.on('close', (code, reason) => this.onClose(code, reason));
      Bot.makeLog('info', [`[Secluded] WebSocket 正在连接到 ${this.ws_url}`], 'Secluded');
    } catch (error) {
      Bot.makeLog('error', [`[Secluded] WebSocket 连接失败: ${error}`], 'Secluded');
      this.scheduleReconnect();
    }
  }

  async getws() {
    return this.sec_ws;
  }

  /**
   * WebSocket连接成功
   */
  async onOpen() {
    Bot.makeLog('info', [`[Secluded]`, `WebSocket连接已建立`], 'Secluded');
    /*
    const authMessage = {
      cmd: 'SyncOicq',
      rsp: true,
      data: {
        pid: 'secluded.plugin.demo',
        name: 'demo-java',
        token: this.config.ws_secretToken,
      },
    };
    const k = await this.Ws_send_Sec(authMessage);
    if (!k.data.status) await this.Ws_send_Sec(authMessage);
    const list = k.data.list;
    await Promise.all(
      list
        .filter((item) => {
          const num = Number(item);
          return num !== 0 && num !== 1000000;
        })
        .map((item) => sec.adapter.connect(Number(item)))
    );
    */
    this.reconnectAttempts = 0;
  }

  /**
   * 接收到消息
   */
  onMessage(data) {
    try {
      let message;
      if (Buffer.isBuffer(data)) {
        message = data.toString('utf8');
      } else if (typeof data === 'string') {
        message = data;
      } else if (data instanceof ArrayBuffer) {
        message = Buffer.from(data).toString('utf8');
      } else {
        message = String(data);
      }
      const parsedData = JSON.parse(message);
      if (parsedData.seq && this.echo.has(parsedData.seq)) {
        const cache = this.echo.get(parsedData.seq);
        if (cache) cache.resolve(parsedData);
        return;
      }
      if (parsedData?.cmd === 'Sync' && parsedData?.data?.list) {
        const list = parsedData?.data?.list;
        Promise.all(
          list
            .filter((item) => {
              const num = Number(item);
              return num !== 0 && num !== 1000000;
            })
            .map((item) => sec.adapter.connect(Number(item)))
        );
        return;
      }
      
      sec.adapter.handleMessage(parsedData);
    } catch (error) {
      Bot.makeLog('error', [`[Secluded] 消息解析错误`, error], 'Secluded');
    }
  }

  /**
   * WebSocket错误处理
   */
  onError(error) {
    Bot.makeLog('error', [`[Secluded] WebSocket连接错误`, error], 'Secluded');
  }

  /**
   * WebSocket连接关闭
   */
  onClose(code, reason) {
    Bot.makeLog('warn', [`[Secluded] WebSocket连接关闭`, `代码: ${code}, 原因: ${reason}`], 'Secluded');
    if (code !== 1000 /* && this.reconnectAttempts < this.maxReconnectAttempts*/) {
      this.reconnect();
    }
  }

  /**
   * 发送WebSocket消息（带队列管理和重试机制）
   */
  async Ws_send_Sec(data, retry = 3, timeout = this.timeout, isretry = 0) {
    if (isretry > 1) return false;
    return new Promise((resolve, reject) => {
      const task = async () => {
        try {
          const result = await this._executeWithRetry(data, retry, timeout, isretry);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };
      this.queue.push({ task, resolve, reject });
      this._processQueue();
    });
  }

  /**
   * 带重试的执行逻辑
   */
  async _executeWithRetry(data, retry, timeout, isretry) {
    for (let i = 0; i < retry; i++) {
      try {
        const result = await this._sendOnce(data, timeout);
        if (result === 'WS_NOT_CONNECTED') {
          await Bot.sleep(5000);
          return await this.Ws_send_Sec(data, retry, timeout, isretry + 1);
        }
        return result;
      } catch (error) {
        if (i === retry - 1) throw error;
        if (error.message.includes('未连接')) {
          await this.reconnect();
        }
        await Bot.sleep(1000);
      }
    }
  }

  /**
   * 处理队列中的任务
   */
  _processQueue() {
    if (this.currentConcurrent >= this.maxConcurrent || this.queue.length === 0) return;
    while (this.currentConcurrent < this.maxConcurrent && this.queue.length > 0) {
      const { task } = this.queue.shift();
      this.currentConcurrent++;
      task().finally(() => {
        this.currentConcurrent--;
        this._processQueue();
      });
    }
  }

  /**
   * 单次发送消息
   */
  async _sendOnce(data, timeout = this.timeout) {
    const echo = this.seq++;
    data.seq = echo;
    const cache = Promise.withResolvers();
    this.echo.set(echo, cache);

    const timer = setTimeout(() => {
      cache.reject(
        Bot.makeError('请求超时', data, {
          timeout,
        })
      );
    }, timeout);

    try {
      if (!this.sec_ws || this.sec_ws.readyState !== Sec_WebSocket.OPEN) {
        Bot.makeLog('error', [`[Secluded] WebSocket 未连接`], 'Secluded');
        clearTimeout(timer);
        this.echo.delete(echo);
        return 'WS_NOT_CONNECTED';
      }
      this.sec_ws.send(JSON.stringify(data));
    } catch (error) {
      clearTimeout(timer);
      this.echo.delete(echo);
      throw error;
    }
    return cache.promise
      .then((response) => {
        return response;
      })
      .finally(() => {
        clearTimeout(timer);
        this.echo.delete(echo);
      });
  }

  /**
   * 重连方法
   */
  async reconnect() {
    this.reconnectAttempts++;
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      Bot.makeLog('error', [`[${this.name}] 达到最大重连次数`, `${this.maxReconnectAttempts}, 停止重连`], 'Secluded');
      return;
    }

    Bot.makeLog('info', [`[${this.name}]`, `尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`], 'Secluded');

    setTimeout(async () => {
      this.init();
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  /**
   * 加载/重新连接WebSocket
   */
  async load() {
    if (this.isConnected()) this.close();
    this.echo.clear();
    this.queue = [];
    this.currentConcurrent = 0;
    this.init();
  }

  /**
   * 安排重连
   */
  scheduleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      setTimeout(() => {
        this.reconnect();
      }, this.reconnectDelay);
    }
  }

  /**
   * 检查是否已连接
   */
  isConnected() {
    return this.sec_ws && this.sec_ws.readyState === Sec_WebSocket.OPEN;
  }

  /**
   * 获取连接状态
   */
  getStatus() {
    if (!this.sec_ws) return 'DISCONNECTED';
    switch (this.sec_ws.readyState) {
      case Sec_WebSocket.CONNECTING:
        return 'CONNECTING';
      case Sec_WebSocket.OPEN:
        return 'CONNECTED';
      case Sec_WebSocket.CLOSING:
        return 'CLOSING';
      case Sec_WebSocket.CLOSED:
        return 'DISCONNECTED';
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * 关闭连接
   */
  close() {
    if (this.sec_ws) {
      this.sec_ws.removeAllListeners();
      this.sec_ws.close(1000, '正常关闭');
      this.sec_ws = null;
    }
    this.reconnectAttempts = 0;
  }

  /**
   * 发送消息的快捷方法
   */
  send(data) {
    return this.sec_ws.send(data);
  }

  /**
   * 销毁实例
   */
  destroy() {
    this.close();
    this.echo.clear();
    this.queue = [];
    this.token = null;
  }
}

// 创建单例实例
const wsClient = new WebSocketClient();

// 导出连接方法
export const connect = () => {
  if (!wsClient.isConnected()) {
    wsClient.init();
  }
  return wsClient;
};

export default wsClient;

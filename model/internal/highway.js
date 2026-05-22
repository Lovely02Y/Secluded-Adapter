import { Transform } from 'stream';
import { connect } from 'net';
import { randomBytes, createHash } from 'crypto';
import { Agent } from 'http';
import axios from 'axios';
import pb from '../protobuf/index.js';

const BUF0 = Buffer.alloc(0);
const BUF7 = Buffer.alloc(7);
const NOOP = () => {};
const __ = Buffer.from([41]);

const deltas = [0x9e3779b9, 0x3c6ef372, 0xdaa66d2b, 0x78dde6e4, 0x1715609d, 0xb54cda56, 0x5384540f, 0xf1bbcdc8, 0x8ff34781, 0x2e2ac13a, 0xcc623af3, 0x6a99b4ac, 0x08d12e65, 0xa708a81e, 0x454021d7, 0xe3779b90];

const ErrorCode = {
  ClientNotOnline: -1,
  PacketTimeout: -2,
  UserNotExists: -10,
  GroupNotJoined: -20,
  MemberNotExists: -30,
  MessageBuilderError: -60,
  RiskMessageError: -70,
  SensitiveWordsError: -80,
  SignApiError: -90,
  HighwayTimeout: -110,
  HighwayNetworkError: -120,
  NoUploadChannel: -130,
  HighwayFileTypeError: -140,
  UnsafeFile: -150,
  OfflineFileNotExists: -160,
  GroupFileNotExists: -170,
  FFmpegVideoThumbError: -210,
  FFmpegPttTransError: -220,
};

class ApiRejection extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function md5(data) {
  return createHash('md5').update(data).digest();
}

function _toUInt32(num) {
  return num >>> 0;
}

function _decrypt(x, y, k0, k1, k2, k3) {
  for (let i = 15; i >= 0; --i) {
    let aa = ((_toUInt32(((x << 4) >>> 0) + k2) ^ _toUInt32(x + deltas[i])) >>> 0) ^ _toUInt32(~~(x / 32) + k3);
    y = (y - aa) >>> 0;
    let bb = ((_toUInt32(((y << 4) >>> 0) + k0) ^ _toUInt32(y + deltas[i])) >>> 0) ^ _toUInt32(~~(y / 32) + k1);
    x = (x - bb) >>> 0;
  }
  return [x, y];
}

function decrypt(encrypted, key) {
  if (encrypted.length % 8) throw ERROR_ENCRYPTED_LENGTH;
  const k0 = key.readUInt32BE(0);
  const k1 = key.readUInt32BE(4);
  const k2 = key.readUInt32BE(8);
  const k3 = key.readUInt32BE(12);
  let r1 = 0,
    r2 = 0,
    t1 = 0,
    t2 = 0,
    x = 0,
    y = 0;
  for (let i = 0; i < encrypted.length; i += 8) {
    const a1 = encrypted.readUInt32BE(i);
    const a2 = encrypted.readUInt32BE(i + 4);
    const b1 = a1 ^ x;
    const b2 = a2 ^ y;
    [x, y] = _decrypt(b1 >>> 0, b2 >>> 0, k0, k1, k2, k3);
    r1 = x ^ t1;
    r2 = y ^ t2;
    t1 = a1;
    t2 = a2;
    encrypted.writeInt32BE(r1, i);
    encrypted.writeInt32BE(r2, i + 4);
  }
  if (Buffer.compare(encrypted.slice(encrypted.length - 7), BUF7) !== 0) throw ERROR_ENCRYPTED_ILLEGAL;
  return encrypted.slice((encrypted[0] & 0x07) + 3, encrypted.length - 7);
}

function _encrypt(x, y, k0, k1, k2, k3) {
  for (let i = 0; i < 16; ++i) {
    let aa = ((_toUInt32(((y << 4) >>> 0) + k0) ^ _toUInt32(y + deltas[i])) >>> 0) ^ _toUInt32(~~(y / 32) + k1);
    aa >>>= 0;
    x = _toUInt32(x + aa);
    let bb = ((_toUInt32(((x << 4) >>> 0) + k2) ^ _toUInt32(x + deltas[i])) >>> 0) ^ _toUInt32(~~(x / 32) + k3);
    bb >>>= 0;
    y = _toUInt32(y + bb);
  }
  return [x, y];
}

function encrypt(data, key) {
  let n = (6 - data.length) >>> 0;
  n = (n % 8) + 2;
  const v = Buffer.concat([Buffer.from([(n - 2) | 0xf8]), Buffer.allocUnsafe(n), data, BUF7]);
  const k0 = key.readUInt32BE(0);
  const k1 = key.readUInt32BE(4);
  const k2 = key.readUInt32BE(8);
  const k3 = key.readUInt32BE(12);
  let r1 = 0,
    r2 = 0,
    t1 = 0,
    t2 = 0;
  for (let i = 0; i < v.length; i += 8) {
    const a1 = v.readUInt32BE(i);
    const a2 = v.readUInt32BE(i + 4);
    const b1 = a1 ^ r1;
    const b2 = a2 ^ r2;
    const [x, y] = _encrypt(b1 >>> 0, b2 >>> 0, k0, k1, k2, k3);
    r1 = x ^ t1;
    r2 = y ^ t2;
    t1 = b1;
    t2 = b2;
    v.writeInt32BE(r1, i);
    v.writeInt32BE(r2, i + 4);
  }
  return v;
}

function int32ip2str(ip) {
  if (typeof ip === 'string') return ip;
  ip = ip & 0xffffffff;
  return [ip & 0xff, (ip >> 8) & 0xff, (ip >> 16) & 0xff, (ip >> 24) & 0xff].join('.');
}

function encodePb(obj) {
  return pb.encode(obj);
}

export const CmdID = {
  DmImage: 1,
  GroupImage: 2,
  SelfPortrait: 5,
  ShortVideo: 25,
  DmPtt: 26,
  MultiMsg: 27,
  GroupPtt: 29,
  OfflineFile: 69,
  GroupFile: 71,
  Ocr: 76,
  NTDmVideo: 1001,
  NTDmImage: 1003,
  NTGroupImage: 1004,
  NTGroupVideo: 1005,
  NTDmPtt: 1007,
  NTGroupPtt: 1008,
};

class HighwayTransform extends Transform {
  constructor(params, obj) {
    super();
    this.c = params;
    this.obj = obj;
    this.seq = randomBytes(2).readUInt16BE();
    this.offset = 0;
    if (!obj.ticket) this.obj.ticket = Buffer.from(params.sig.bigdata?.sig_session || Buffer.alloc(0));
    if (obj.encrypt && obj.ext) this.obj.ext = encrypt(Buffer.from(obj.ext), Buffer.from(params.sig.bigdata?.session_key || Buffer.alloc(0)));
    this.on('error', NOOP);
  }
  _transform(data, encoding, callback) {
    let offset = 0,
      limit = 1048576;
    while (offset < data.length) {
      const chunk = data.slice(offset, limit + offset);
      const head = pb.encode({
        1: {
          1: 1,
          2: String(this.c.uin),
          3: 'PicUp.DataUp',
          4: this.seq++,
          6: this.c.apk.subid,
          7: 4096,
          8: this.obj.cmdid,
          10: 2052,
        },
        2: {
          2: this.obj.size,
          3: this.offset + offset,
          4: chunk.length,
          6: this.obj.ticket,
          8: md5(chunk),
          9: this.obj.md5,
        },
        3: this.obj.ext,
      });
      offset += chunk.length;
      const _ = Buffer.allocUnsafe(9);
      _.writeUInt8(40);
      _.writeUInt32BE(head.length, 1);
      _.writeUInt32BE(chunk.length, 5);
      this.push(_);
      this.push(head);
      this.push(chunk);
      this.push(__);
    }
    this.offset += data.length;
    callback(null);
  }
}

const agent = new Agent({
  maxSockets: 10,
});

/**
 * Highway上传主函数
 * @param {ReadableStream} readable - 要上传的可读流
 * @param {Object} obj - 文件对象信息
 * @param {Object} params - 上传参数
 * @param {string|number} ip - 上传服务器IP
 * @param {number} port - 上传服务器端口
 * @returns {Promise<Buffer>} 上传成功后返回的响应数据
 * @throws {ApiRejection} 上传过程中发生错误时抛出
 */
export const highwayUpload = async (readable, obj, params, ip, port) => {
  // 处理IP和端口参数，提供默认值
  ip = int32ip2str(ip || params?.sig?.bigdata?.ip);
  port = port || params?.sig?.bigdata?.port;

  // 验证上传通道
  if (!port) {
    throw new ApiRejection(ErrorCode.NoUploadChannel, '没有上传通道，如果你刚刚登录，请等待几秒');
  }

  // 验证文件类型
  if (!readable) {
    throw new ApiRejection(ErrorCode.HighwayFileTypeError, '不支持的file类型');
  }

  // 生成文件ID用于日志标识
  const fileId = obj?.md5?.toString('hex').slice(0, 8) || 'unknown';
  const log = (msg) => logger.debug(`[${fileId}] ${msg}`);

  // 根据参数选择上传方式
  if (params.useHttp) {
    return uploadByHttp(readable, obj, params, ip, port, log);
  } else {
    return await uploadBySocket(readable, obj, params, ip, port, log, fileId);
  }
};

/**
 * Socket方式上传文件到Highway服务器
 * @param {ReadableStream} readable - 要上传的可读流
 * @param {Object} obj - 文件对象信息，包含md5、size、cmdid等必要信息
 * @param {Object} params - 上传参数，包含uin、apk、sig等信息
 * @param {string} ip - 上传服务器IP地址
 * @param {number} port - 上传服务器端口
 * @param {Function} log - 日志函数
 * @param {string} fileId - 文件ID，用于日志标识
 * @returns {Promise<Buffer>} 上传成功后返回的响应数据
 * @throws {ApiRejection} 上传失败时抛出错误
 */
async function uploadBySocket(readable, obj, params, ip, port, log, fileId) {
  // 返回Promise封装上传过程
  return new Promise((resolve, reject) => {
    // 创建Highway转换流，用于处理数据
    const highway = new HighwayTransform(params, obj);
    let networkErrorCount = 0; // 网络错误计数器
    /**
     * 创建Socket连接并处理上传
     * @param {string} ip - 服务器IP
     * @param {number} port - 服务器端口
     */
    const createSocket = (ip, port) => {
      // 记录上传开始信息
      log(`[${fileId}]highway ip:${ip} port:${port}`);
      let uploadTimeout = -1;
      // 设置连接超时
      const connect_timeout = setTimeout(() => {
        socket.destroy(new Error(`[${fileId}]highway ip:${ip} port:${port} connect timeout`));
      }, 6000);

      // 创建Socket连接
      const socket = connect(port, ip, () => {
        // 清除连接超时
        clearTimeout(connect_timeout);

        // 设置上传超时
        if (obj.timeout > 0) {
          uploadTimeout = setTimeout(() => {
            readable.unpipe(highway).destroy();
            highway.unpipe(socket).destroy();
            socket.end();
            reject(new ApiRejection(ErrorCode.HighwayTimeout, `[${fileId}]上传超时(${obj.timeout}s)`));
          }, obj.timeout * 1000);
        }

        // 建立管道：可读流 -> Highway转换流 -> Socket流
        readable.pipe(highway).pipe(socket, {
          end: false,
        });
      });

      /**
       * 处理响应头
       * @param {Buffer} header - 响应头数据
       */
      const handleRspHeader = (header) => {
        // 解码protobuf响应
        const rsp = pb.decode(header);

        // 检查错误码
        if (typeof rsp[3] === 'number' && rsp[3] !== 0) {
          logger.warn(`[${fileId}]highway upload failed (code: ${rsp[3]})`);
          readable.unpipe(highway).destroy();
          highway.unpipe(socket).destroy();
          socket.end();
          reject(new ApiRejection(rsp[3], `[${fileId}]unknown highway error (code: ${rsp[3]})`));
        } else {
          // 计算上传进度
          const percentage = (((rsp[2][3] + rsp[2][4]) / rsp[2][2]) * 100).toFixed(2);
          log(`[${fileId}]highway chunk uploaded (${percentage}%)`);
          if (typeof obj.callback === 'function') obj.callback(percentage);
          // 检查是否上传完成
          if (rsp[2][3] + rsp[2][4] >= obj.size) {
            socket.end();
            resolve(rsp);
          }
        }
      };

      // 处理接收到的数据
      let buf = BUF0;
      socket.on('data', (chunk) => {
        try {
          // 合并数据
          buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
          // 解析响应包
          while (buf.length >= 5) {
            const len = buf.readInt32BE(1);
            if (buf.length >= len + 10) {
              handleRspHeader(buf.slice(9, len + 9));
              buf = buf.slice(len + 10);
            } else {
              break;
            }
          }
        } catch (err) {
          logger.error(err);
        }
      });

      // 处理连接关闭
      socket.on('close', async (hadError) => {
        clearTimeout(uploadTimeout);
        if (hadError && params.sig.bigdata.backup_ips[0]?.port && ip !== int32ip2str(params.sig.bigdata.backup_ips[0]?.ip)) {
          logger.error(`[${fileId}]highway ip:${ip} port:${port} network error`);
          createSocket(int32ip2str(params.sig.bigdata.backup_ips[0]?.ip), params.sig.bigdata.backup_ips[0]?.port);
          return;
        } else if (networkErrorCount < 3) {
          networkErrorCount++;
          const bigdata = Bot[params.uin].sig.bigdata || (await Bot[params.uin].refreshBigDataSession());
          if (bigdata && bigdata.ip && bigdata.port) {
            createSocket(int32ip2str(bigdata.ip), bigdata.port);
          } else {
            logger.error(`[${fileId}]获取签名数据失败或数据无效`);
            reject(new ApiRejection(ErrorCode.SignApiError, `[${fileId}]获取签名数据失败或数据无效`));
          }
          return;
        }
        reject(new ApiRejection(ErrorCode.HighwayNetworkError, `[${fileId}]上传遇到网络错误`));
      });

      // 处理Socket错误
      socket.on('error', (err) => {
        logger.error(err);
      });

      // 处理可读流错误
      readable.on('error', (err) => {
        logger.error(err);
        socket.end();
      });
    };

    // 开始上传
    createSocket(ip, port);
  });
}

/**
 * HTTP方式上传文件到Highway服务器
 * @param {ReadableStream} readable - 要上传的可读流
 * @param {Object} obj - 文件对象信息，包含md5、size、cmdid等必要信息
 * @param {Object} params - 上传参数，包含uin、apk、sig等信息
 * @param {string} ip - 上传服务器IP地址
 * @param {number} port - 上传服务器端口
 * @param {Function} log - 日志函数
 * @returns {Promise<Buffer>} 上传成功后返回的响应数据
 * @throws {ApiRejection} 上传失败时抛出错误
 */
function uploadByHttp(readable, obj, params, ip, port, log) {
  // 记录上传开始信息
  log(`highway(http) ip:${ip} port:${port}`);

  // 构建上传URL
  const url = `http://${ip}:${port}/cgi-bin/httpconn?htcmd=0x6FF0087&uin=${params.uin}`;

  // 初始化上传参数
  let seq = 1; // 序列号，用于标识不同的上传请求
  let offset = 0; // 全局偏移量，记录已处理的数据长度
  const limit = 524288; // 每块数据的最大大小，512KB
  obj.ticket = Buffer.from(params.sig.bigdata.sig_session); // 设置上传凭证

  // 任务管理
  const tasks = new Set(); // 存储所有上传任务的Promise
  const controller = new AbortController(); // 用于取消所有上传任务
  const cancels = new Set(); // 存储所有可取消的请求
  let finished = 0; // 已完成的任务数

  // 返回Promise封装上传过程
  return new Promise((resolve, reject) => {
    // 处理数据块
    readable.on('data', (data) => {
      let chunkOffset = 0; // 当前数据块内的偏移量
      // 循环处理数据块内的所有子块
      while (chunkOffset < data.length) {
        // 切分数据
        const chunk = data.slice(chunkOffset, chunkOffset + limit);
        // 构建protobuf头
        const head = encodePb({
          1: {
            1: 1,
            2: String(params.uin),
            3: 'PicUp.DataUp',
            4: seq++,
            5: 0,
            6: params.apk.subid,
            8: obj.cmdid,
          },
          2: {
            1: 0,
            2: obj.size,
            3: offset + chunkOffset,
            4: chunk.length,
            6: obj.ticket,
            8: md5(chunk),
            9: obj.md5,
            10: 0,
            13: 0,
          },
          3: obj.ext,
          4: Date.now(),
        });

        chunkOffset += chunk.length;

        // 构建HTTP请求头
        const header = Buffer.allocUnsafe(9);
        header.writeUInt8(40, 0); // 魔数
        header.writeUInt32BE(head.length, 1); // 头部长度
        header.writeUInt32BE(chunk.length, 5); // 数据长度

        // 拼接完整的请求体
        const buf = Buffer.concat([header, head, chunk, __]);

        // 创建取消令牌
        const cancelToken = axios.CancelToken.source();
        cancels.add(cancelToken);

        // 创建上传任务
        const task = axios
          .post(url, buf, {
            responseType: 'arraybuffer',
            httpAgent: agent,
            cancelToken: cancelToken.token,
            headers: {
              'Content-Length': String(buf.length),
              'Content-Type': 'application/octet-stream',
            },
          })
          .then((r) => {
            // 处理响应
            let percentage, rsp;
            try {
              const buf = Buffer.from(r?.data);
              const header = buf.slice(9, buf.length - 1);
              rsp = pb.decode(header);
            } catch (err) {
              logger.warn(`解析响应失败: ${err.message}`);
              throw err;
            }

            // 检查响应状态码
            if (rsp?.[3] !== 0) {
              controller.abort();
              throw new ApiRejection(rsp[3], 'highway错误');
            }

            // 更新进度
            ++finished;
            percentage = ((finished / tasks.size) * 100).toFixed(2);
            log(`highway(http)分块上传进度: ${percentage}%`);

            // 调用回调函数
            if (typeof obj.callback === 'function' && percentage) obj.callback(percentage);

            // 检查是否提前完成
            if (finished < tasks.length && rsp[7]?.toBuffer().length > 0) {
              cancels.forEach((c) => c.cancel());
              log(`highway(http)分块上传进度: 100%`);
              if (typeof obj.callback === 'function') obj.callback('100.00');
            }

            // /*if (finished >= tasks.size && rsp[2][7] !== 1)
            //       reject(
            //           new ApiRejection(ErrorCode.UnsafeFile, `[${obj.md5.toString("hex")}]文件校验未通过，上传失败`),
            //       );
            //   */
            resolve(rsp);
          })
          .catch((err) => {
            // 处理错误，忽略取消错误
            if (!axios.isCancel(err)) {
              controller.abort();
              throw err;
            }
          });
        tasks.add(task);
      }

      // 更新全局偏移量
      offset += data.length;
    });

    // 处理读取错误
    readable.on('error', (err) => {
      controller.abort();
      cancels.forEach((c) => c.cancel());
      logger.warn(`读取数据错误: ${err.message}`);
      reject(err);
    });

    // 处理读取结束
    readable.on('end', () => {
      // 等待所有任务完成
      Promise.all(tasks)
        .then(() => {
          if (finished >= tasks.length) {
            logger.warn(`上传完成但未收到完成确认`);
          }
        })
        .catch((err) => {
          if (!axios.isCancel(err)) {
            cancels.forEach((c) => c.cancel());
            reject(err);
          }
        });
    });
  });
}

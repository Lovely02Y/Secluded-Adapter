import { createHash } from 'crypto';
import axios from 'axios';
import { Transform, Readable } from 'stream';
import pb from '../protobuf/index.js';

const NOOP = () => {};
const CHUNK_SIZE = 1048576; // 1MB per chunk
const UPLOAD_URL = 'https://multimedia.qfile.qq.com/sliceupload';

const ErrorCode = {
  FlashTransferUploadFailed: -200,
  FlashTransferNetworkError: -210,
  FlashTransferInvalidResponse: -220,
  FlashTransferFileError: -230,
};

class ApiRejection extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

class Sha1Stream {
  Sha1BlockSize = 64;
  Sha1DigestSize = 20;
  _padding = Buffer.concat([Buffer.from([128]), Buffer.alloc(63)]);
  _state = new Uint32Array(5);
  _count = new Uint32Array(2);
  _buffer = Buffer.allocUnsafe(this.Sha1BlockSize);
  _w = new Uint32Array(80);

  constructor() {
    this.reset();
  }

  reset() {
    this._state[0] = 1732584193;
    this._state[1] = 4023233417;
    this._state[2] = 2562383102;
    this._state[3] = 271733878;
    this._state[4] = 3285377520;
    this._count[0] = 0;
    this._count[1] = 0;
    this._buffer.fill(0);
  }

  rotateLeft(v, o) {
    return ((v << o) | (v >>> (32 - o))) >>> 0;
  }

  transform(chunk, offset) {
    const w = this._w;
    const view = new DataView(chunk.buffer, chunk.byteOffset + offset, 64);
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(i * 4, false);
    }
    for (let i = 16; i < 80; i++) {
      w[i] = this.rotateLeft(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1) >>> 0;
    }
    let a = this._state[0];
    let b = this._state[1];
    let c = this._state[2];
    let d = this._state[3];
    let e = this._state[4];
    for (let i = 0; i < 80; i++) {
      let temp;
      if (i < 20) {
        temp = ((b & c) | (~b & d)) + 1518500249;
      } else if (i < 40) {
        temp = (b ^ c ^ d) + 1859775393;
      } else if (i < 60) {
        temp = ((b & c) | (b & d) | (c & d)) + 2400959708;
      } else {
        temp = (b ^ c ^ d) + 3395469782;
      }
      temp += (this.rotateLeft(a, 5) + e + w[i]) >>> 0;
      e = d;
      d = c;
      c = this.rotateLeft(b, 30) >>> 0;
      b = a;
      a = temp;
    }
    this._state[0] = (this._state[0] + a) >>> 0;
    this._state[1] = (this._state[1] + b) >>> 0;
    this._state[2] = (this._state[2] + c) >>> 0;
    this._state[3] = (this._state[3] + d) >>> 0;
    this._state[4] = (this._state[4] + e) >>> 0;
  }

  update(data, len) {
    let index = ((this._count[0] >>> 3) & 63) >>> 0;
    const dataLen = len ?? data.length;
    this._count[0] = (this._count[0] + (dataLen << 3)) >>> 0;
    if (this._count[0] < dataLen << 3) this._count[1] = (this._count[1] + 1) >>> 0;
    this._count[1] = (this._count[1] + (dataLen >>> 29)) >>> 0;
    const partLen = (this.Sha1BlockSize - index) >>> 0;
    let i = 0;
    if (dataLen >= partLen) {
      data.copy(this._buffer, index, 0, partLen);
      this.transform(this._buffer, 0);
      for (i = partLen; i + this.Sha1BlockSize <= dataLen; i = (i + this.Sha1BlockSize) >>> 0) {
        this.transform(data, i);
      }
      index = 0;
    }
    data.copy(this._buffer, index, i, dataLen);
  }

  hash(bigEndian = true) {
    const digest = Buffer.allocUnsafe(this.Sha1DigestSize);
    if (bigEndian) {
      for (let i = 0; i < 5; i++) digest.writeUInt32BE(this._state[i], i * 4);
    } else {
      for (let i = 0; i < 5; i++) digest.writeUInt32LE(this._state[i], i * 4);
    }
    return digest;
  }

  final() {
    const digest = Buffer.allocUnsafe(this.Sha1DigestSize);
    const bits = Buffer.allocUnsafe(8);
    bits.writeUInt32BE(this._count[1], 0);
    bits.writeUInt32BE(this._count[0], 4);
    const index = ((this._count[0] >>> 3) & 63) >>> 0;
    const padLen = (index < 56 ? 56 - index : 120 - index) >>> 0;
    this.update(this._padding, padLen);
    this.update(bits);
    for (let i = 0; i < 5; i++) {
      digest.writeUInt32BE(this._state[i], i * 4);
    }
    return digest;
  }
}

class CalculateStreamBytesTransform extends Transform {
  blockSize = 1024 * 1024; // 1MB per hash block
  sha1;
  buffer;
  bytesRead;
  byteArrayList;

  constructor() {
    super();
    this.sha1 = new Sha1Stream();
    this.buffer = Buffer.alloc(0);
    this.bytesRead = 0;
    this.byteArrayList = [];
  }

  _transform(chunk, _, callback) {
    try {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      let offset = 0;
      while (this.buffer.length - offset >= this.sha1.Sha1BlockSize) {
        const block = this.buffer.subarray(offset, offset + this.sha1.Sha1BlockSize);
        this.sha1.update(block);
        offset += this.sha1.Sha1BlockSize;
        this.bytesRead += this.sha1.Sha1BlockSize;
        if (this.bytesRead % this.blockSize === 0) {
          const digest = this.sha1.hash(false);
          this.byteArrayList.push(Buffer.from(digest));
        }
      }
      this.buffer = this.buffer.subarray(offset);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  _flush(callback) {
    try {
      if (this.buffer.length > 0) this.sha1.update(this.buffer);
      const finalDigest = this.sha1.final();
      this.byteArrayList.push(Buffer.from(finalDigest));
      for (const digest of this.byteArrayList) {
        this.push(digest);
      }
      callback(null);
    } catch (err) {
      callback(err);
    }
  }
}

export function calculateSha1StreamBytes(inputBuffer) {
  return new Promise((resolve, reject) => {
    const readable = Readable.from(inputBuffer);
    const transformStream = new CalculateStreamBytesTransform();
    const byteArrayList = [];

    transformStream.on('data', (chunk) => {
      byteArrayList.push(chunk);
    });

    transformStream.on('end', () => {
      resolve(byteArrayList);
    });

    transformStream.on('error', (err) => {
      reject(err);
    });

    readable.pipe(transformStream);
  });
}

class FlashTransferTransform extends Transform {
  constructor(uKey, appId, sha1States, options = {}) {
    super();
    this.uKey = uKey;
    this.appId = appId;
    this.sha1States = sha1States;
    this.options = options;
    this.offset = 0;
    this.chunkIndex = 0;
    this.chunkCount = Math.ceil(options.fileSize / CHUNK_SIZE);
    this.uploadedChunks = 0;
    this.fileType = appIdToFileType[appId] || '未知类型';
    this.on('error', NOOP);
  }

  async _transform(data, encoding, callback) {
    try {
      let offset = 0;
      while (offset < data.length) {
        const chunk = data.slice(offset, offset + CHUNK_SIZE);
        const chunkIndex = Math.floor((this.offset + offset) / CHUNK_SIZE);
        if (chunkIndex >= this.sha1States.length) {
          throw new ApiRejection(ErrorCode.FlashTransferUploadFailed, 'sha1States array length insufficient');
        }
        const actualStart = chunkIndex * CHUNK_SIZE;
        logger.debug(`[闪传通道] 当前分片: ${chunkIndex}, 偏移量: ${actualStart}, 分片大小: ${chunk.length}`);
        await uploadChunk(this.uKey, this.appId, actualStart, this.sha1States, chunk, chunkIndex);
        this.uploadedChunks++;
        const progress = Math.round((this.uploadedChunks / this.chunkCount) * 100);
        if (this.options.onProgress) {
          this.options.onProgress(progress);
        }
        offset += chunk.length;
        logger.info(`[闪传通道] 文件类型: ${this.fileType}, 进度: ${progress}%`);
      }
      this.offset += data.length;
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  _flush(callback) {
    callback(null);
  }
}

async function uploadChunk(uKey, appId, start, sha1States, chunk, i) {
  try {
    const requestBody = {
      1: 0,
      2: appId,
      3: 2,
      107: {
        1: [],
        2: uKey,
        3: start,
        4: start + chunk.length - 1,
        5: createHash('sha1').update(chunk).digest(),
        6: {
          1: sha1States,
        },
        7: chunk,
      },
    };
    const payload = pb.encode(requestBody);
    const response = await axios.post(UPLOAD_URL, payload, {
      headers: {
        Accept: '*/*',
        Connection: 'Keep-Alive',
        'Accept-Encoding': 'gzip',
      },
      validateStatus: function (status) {
        return status >= 200 && status < 500;
      },
      responseType: 'arraybuffer',
    });
    const respBuffer = Buffer.from(response.data);
    const respData = pb.decodePb(respBuffer);
    if (respData[5] !== 'success') {
      throw new ApiRejection(ErrorCode.FlashTransferUploadFailed, `FlashTransfer upload failed: ${respData[5]} (${respData[4]})`);
    }
    return true;
  } catch (error) {
    if (error instanceof ApiRejection) {
      throw error;
    }
    throw new ApiRejection(ErrorCode.FlashTransferNetworkError, `Network error: ${error.message}`);
  }
}

const appIdToFileType = {
  14901: '闪传',
  14902: '闪传预览图',
  14903: '闪传封面',
  1402: '私信语音',
  1403: '群语音',
  1413: '私信视频',
  1414: '私信视频封面',
  1415: '群视频',
  1416: '群视频封面',
  1406: '私信图片',
  1407: '群聊图片',
};

/**
 * 闪传上传主函数
 * @param {string|Buffer} file - 文件输入，可以是以下格式：
 *                                - 本地文件路径
 *                                - Buffer对象
 *                                - base64://开头的base64编码
 *                                - http://或https://开头的网络地址
 *                                - file://开头的文件协议路径
 * @param {string} uKey - 上传密钥
 * @param {number} appId - 应用ID，用于确定文件类型：
 *                         - 14901: 闪传
 *                         - 14902: 闪传预览图
 *                         - 14903: 闪传封面
 *                         - 1402: 私信语音
 *                         - 1403: 群语音
 *                         - 1413: 私信视频
 *                         - 1414: 私信视频封面
 *                         - 1415: 群视频
 *                         - 1416: 群视频封面
 *                         - 1406: 私信图片
 *                         - 1407: 群聊图片
 * @param {Object} options - 选项
 * @param {Function} options.onProgress - 进度回调函数，接收上传进度百分比
 * @returns {Promise<boolean>} - 上传是否成功
 * @throws {ApiRejection} - 上传失败时抛出错误
 */
export async function flashTransferUpload(file, uKey, appId, options = {}) {
  const fileType = appIdToFileType[appId] || '未知类型';
  logger.info(`[闪传通道] 文件类型: ${fileType}，开始上传...`);
  const buffer = await Bot.Buffer(file, options);
  if (!buffer) throw new ApiRejection(ErrorCode.FlashTransferFileError, 'Invalid file input');
  const fileSize = buffer.length;
  try {
    const sha1States = options.sha1States || (await calculateSha1StreamBytes(buffer));
    const transformOptions = {
      ...options,
      fileSize,
      fileType: fileType,
    };
    const transform = new FlashTransferTransform(uKey, appId, sha1States, transformOptions);
    await new Promise((resolve, reject) => {
      transform.on('finish', resolve);
      transform.on('error', reject);
      transform.write(buffer);
      transform.end();
    });
    return true;
  } catch (error) {
    if (error instanceof ApiRejection) {
      throw error;
    }
    throw new ApiRejection(ErrorCode.FlashTransferUploadFailed, `Upload failed: ${error.message}`);
  }
}

export { ErrorCode, ApiRejection };

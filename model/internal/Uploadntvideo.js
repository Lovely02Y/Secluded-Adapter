import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { Transform } from 'stream';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { highwayUpload } from './highway.js';
import { pipeline } from 'stream/promises';
import crypto from 'crypto';
import axios from 'axios';
import pb from '../protobuf/index.js';

export const IS_WIN = process.platform === 'win32';
const TMP_DIR = tmpdir();
const NOOP = () => {};

function int32ip2str(ip) {
  if (typeof ip === 'string') return ip;
  ip = ip & 0xffffffff;
  return [ip & 0xff, (ip >> 8) & 0xff, (ip >> 16) & 0xff, (ip >> 24) & 0xff].join('.');
}

function uuid() {
  const hex = randomBytes(16).toString('hex');
  return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}`;
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

export function calculateSha1StreamBytes(filePath) {
  return new Promise((resolve, reject) => {
    const readable = fs.createReadStream(filePath);
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

let common = {
  md5: (data) => {
    return crypto.createHash('md5').update(data).digest();
  },

  sha: (data) => {
    const hash = new Sha1Stream();
    hash.update(data);
    return hash.final();
  },

  md5First10MB: (data) => {
    crypto
      .createHash('md5')
      .update(data.slice(0, 10 * 1024 * 1024))
      .digest();
  },

  checkRsp: (rsp) => {
    if (!rsp || rsp[1] !== 0) {
      throw new Error(rsp[2] || '请求失败');
    }
  },

  Getreadable: (filepath) => {
    return fs.createReadStream(filepath);
  },

  fileHash: async (filepath) => {
    const readable = fs.createReadStream(filepath);
    const md5 = await new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5');
      readable.on('data', (chunk) => hash.update(chunk));
      readable.on('end', () => resolve(hash.digest()));
      readable.on('error', reject);
    });

    const sha1 = await new Promise((resolve, reject) => {
      const readable = fs.createReadStream(filepath);
      const hash = new Sha1Stream();
      readable.on('data', (chunk) => hash.update(chunk));
      readable.on('end', () => resolve(hash.final()));
      readable.on('error', reject);
    });

    return [md5, sha1];
  },
};

export default common;

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

export const uploadntVideo = async (id, _video, opts, isBubble = false) => {
  logger.debug('开始视频任务');
  let gid = opts.isGroup ? opts.id : Bot[id].gl.keys().next().value;
  let { file, temp = false } = _video;
  if (file instanceof Buffer) {
    file = await _saveFileToTmpDir(file);
    temp = true;
  } else {
    file = file;
    if (file.startsWith('base64://')) {
      file = await _saveFileToTmpDir(file);
      temp = true;
    } else if (file.startsWith('protobuf://')) {
      return _video;
    } else if (file.startsWith('https://') || file.startsWith('http://')) {
      file = await _downloadFileToTmpDir(file);
      temp = true;
    }
    file = file.replace(/^file:\/{2}/, '');
    IS_WIN && file.startsWith('/') && (file = file.slice(1));
  }
  const thumb = path.join(TMP_DIR, uuid());
  await new Promise((resolve, reject) => {
    exec(`${Bot[id]?.config?.ffmpeg_path || 'ffmpeg'} -y -i "${file}" -f image2 -frames:v 1 "${thumb}"`, (error, stdout, stderr) => {
      logger.debug('ffmpeg output: ' + stdout + stderr);
      fs.stat(thumb, (err) => {
        if (err) reject(new ApiRejection(ErrorCode.FFmpegVideoThumbError, 'ffmpeg获取视频图像帧失败'));
        else resolve(undefined);
      });
    });
  });
  const [width, height, seconds] = await new Promise((resolve) => {
    exec(`${Bot[id]?.config?.ffprobe_path || 'ffprobe'} -i "${file}" -show_streams`, (error, stdout, stderr) => {
      const lines = (stdout || stderr || '').split('\n');
      let width = 1280,
        height = 720,
        seconds = 120,
        count = 0;
      for (const line of lines) {
        if (count > 3) break;
        if (line.startsWith('width=')) {
          width = parseInt(line.slice(6));
          count++;
        } else if (line.startsWith('height=')) {
          height = parseInt(line.slice(7));
          count++;
        } else if (line.startsWith('duration=')) {
          seconds = parseInt(line.slice(9));
          count++;
        }
      }
      resolve([width, height, seconds]);
    });
  });

  const [md5video, sha1video] = await common.fileHash(file);
  const [md5thumb, sha1thumb] = await common.fileHash(thumb);
  const readable = fs.createReadStream(file);
  const readable2 = fs.createReadStream(thumb);
  const videosize = (await fs.promises.stat(file)).size;
  const thumbsize = (await fs.promises.stat(thumb)).size;

  const resp1 = await _requestUploadVideo(
    {
      seconds,
      md5: md5video.toString('hex'),
      sha1: sha1video.toString('hex'),
      size: videosize,
    },
    {
      width,
      height,
      md5: md5thumb.toString('hex'),
      sha1: sha1thumb.toString('hex'),
      size: thumbsize,
    },
    id,
    gid
  );

  let video_fid, thumb_fid;
  for (const i of resp1[2][6][1]) {
    if (i[1][1][5][1] === 2) video_fid = i[1][2];
    if (i[1][1][5][1] === 1) thumb_fid = i[1][2];
  }
  const params = {
    uin: id,
    apk: {
      subid: Bot[id].apk.subid,
    },
    useHttp: false,
    sig: {
      bigdata: Bot[id].sig?.bigdata,
    },
  };
  let sha1 = await calculateSha1StreamBytes(file);

  if (resp1[2]?.[1]) {
    const ext = pb.encode({
      1: video_fid,
      2: resp1[2]?.[1] || '',
      5: {
        1: resp1[2][3].map((x) => ({
          1: {
            1: 1,
            2: int32ip2str(x[1]),
          },
          2: x[2],
        })),
      },
      6: resp1[2][6][1],
      10: 1024 * 1024,
      11: {
        1: sha1,
      },
    });
    await highwayUpload(
      readable,
      {
        cmdid: 1005,
        md5: md5video,
        size: videosize,
        ext,
      },
      params
    );
  }

  if (resp1[2][10]?.[2]) {
    const ext2 = pb.encode({
      1: thumb_fid,
      2: resp1[2][10]?.[2] || '',
      5: {
        1: resp1[2][10][4].map((x) => ({
          1: {
            1: 1,
            2: int32ip2str(x[1]),
          },
          2: x[2],
        })),
      },
      6: resp1[2][6][1],
      10: 1024 * 1024,
      11: {
        1: sha1thumb,
      },
    });
    await highwayUpload(
      readable2,
      {
        cmdid: 1006,
        md5: md5thumb,
        size: thumbsize,
        ext: ext2,
      },
      params
    );
  }
  fs.unlink(thumb, NOOP);
  if (temp) fs.unlink(file, NOOP);
  logger.debug('结束视频任务');
  const _body = {
    1: 48,
    2: resp1[2][6],
    3: isBubble ? 24 : 21,
  };
  return {
    type: isBubble ? 'bubble' : 'video',
    file: 'protobuf://' + Buffer.from(pb.encode(_body)).toString('base64'),
    nt: true,
  };
};

export async function _saveFileToTmpDir(file) {
  const buf = file instanceof Buffer ? file : Buffer.from(file.slice(9), 'base64');
  const savePath = path.join(TMP_DIR, uuid());
  await fs.promises.writeFile(savePath, buf);
  return savePath;
}

class DownloadTransform extends Transform {
  _size = 0;

  _transform(chunk, encoding, callback) {
    this._size += chunk.length;
    if (this._size <= 5120 * 1024 * 1024) {
      this.push(chunk);
      callback();
    } else {
      callback(new Error('File exceeds 5120MB limit'));
    }
  }
}

export async function _downloadFileToTmpDir(url, headers = {}) {
  const savePath = path.join(TMP_DIR, uuid());

  try {
    const response = await axios.get(url, {
      headers,
      responseType: 'stream',
    });

    await pipeline(response.data, new DownloadTransform(), fs.createWriteStream(savePath));

    return savePath;
  } catch (err) {
    try {
      await fs.promises.unlink(savePath);
    } catch {}
    throw err;
  }
}

async function _requestUploadVideo(videoInfo, thumbInfo, id, gid) {
  let body = createMediaUploadPb(
    [
      {
        1: {
          1: videoInfo.size,
          2: videoInfo.md5,
          3: videoInfo.sha1 ?? '',
          4: videoInfo.md5 + '.mp4',
          5: {
            1: 2,
            2: 0,
            3: 0,
            4: 0,
          },
          6: thumbInfo.width,
          7: thumbInfo.height,
          8: videoInfo.seconds,
          9: 0,
        },
        2: 0,
      },
      {
        1: {
          1: thumbInfo.size,
          2: thumbInfo.md5,
          3: thumbInfo.sha1 || '',
          4: thumbInfo.md5 + '.jpg',
          5: {
            1: 1,
            2: 0,
            3: 0,
            4: 0,
          },
          6: thumbInfo.width,
          7: thumbInfo.height,
          8: 0,
          9: 0,
        },
        2: 100,
      },
    ],
    gid
  );

  const rsp = await Bot[id].sendOidbSvcTrpcTcp('OidbSvcTrpcTcp.0x11EA_100', body);
  return rsp;
}

function createMediaUploadPb(files, gid) {
  return {
    1: {
      // head
      1: {
        1: 3, //req id
        2: 100, //command
      },
      // scene
      2: {
        101: 2, //req type
        102: 2, //business type
        200: 2, // scene type 1:c2c 2:group
        202: {
          1: gid, // account type
        },
      },
      // client
      3: {
        1: 2,
      }, // agent type
    },
    // body
    2: {
      // files
      1: files,
      2: 1, // try fast
      4: crypto.randomBytes(4).readUInt32BE(),
      5: 2,
      // ext biz
      6: {
        1: {
          2: 'Zy~',
        },
        2: {
          3: Buffer.from('800100', 'hex'),
        },
        3: {
          11: Buffer.alloc(0),
          12: Buffer.alloc(0),
          13: Buffer.alloc(0),
        },
      },
      7: 0,
      8: false,
    },
  };
}

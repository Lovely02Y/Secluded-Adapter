import { Readable } from 'stream';
import stream from 'stream';
import fs from 'fs';
import path from 'path';
import { randomBytes, createHash } from 'crypto';
import probeImageSize from 'probe-image-size';
import axios from 'axios';
import os from 'os';
import { pipeline } from 'node:stream/promises';

// Constants
const IS_WIN = os.platform() === 'win32';
const TMP_DIR = os.tmpdir();
const MAX_UPLOAD_SIZE = 31457280;
const NOOP = () => {};

// Image type mappings
const TYPE = {
  jpg: 1000,
  png: 1001,
  webp: 1002,
  bmp: 1005,
  gif: 2000,
  face: 4,
};

const EXT = {
  3: 'png',
  4: 'face',
  1000: 'jpg',
  1001: 'png',
  1002: 'webp',
  1003: 'jpg',
  1005: 'bmp',
  2000: 'gif',
  2001: 'png',
};

// Utility functions
function uuid() {
  const hex = randomBytes(16).toString('hex');
  return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substr(12, 4)}-${hex.substring(16, 20)}-${hex.substring(20)}`;
}

function md5(data) {
  if (data instanceof Buffer) {
    return createHash('md5').update(data).digest();
  }
  return createHash('md5').update(data, 'utf8').digest();
}

async function md5Stream(readable) {
  return new Promise((resolve, reject) => {
    readable.on('error', reject);
    readable.pipe(createHash('md5').on('error', reject).on('data', resolve));
  });
}

class DownloadTransform extends stream.Transform {
  constructor() {
    super();
    this._size = 0;
  }

  _transform(data, encoding, callback) {
    this._size += data.length;
    let error = null;
    if (this._size <= MAX_UPLOAD_SIZE) {
      this.push(data);
    } else {
      error = new Error('downloading over 30MB is refused');
    }
    callback(error);
  }
}

/** 构造图片file */
export function buildImageFileParam(md5, size, width, height, type) {
  size = size || 0;
  width = width || 0;
  height = height || 0;
  const ext = EXT[type] || 'jpg';
  return md5 + size + '-' + width + '-' + height + '.' + ext;
}

/** 从图片的file中解析出图片属性参数 */
export function parseImageFileParam(file) {
  let md5, size, width, height, ext;
  let sp = file.split('-');
  md5 = sp[0].slice(0, 32);
  size = Number(sp[0].slice(32)) || 0;
  width = Number(sp[1]) || 0;
  height = parseInt(sp[2]) || 0;
  sp = file.split('.');
  ext = sp[1] || 'jpg';
  return { md5, size, width, height, ext };
}

export class Image {
  /** 从服务端拿到fid后必须设置此值，否则图裂 */
  set fid(val) {
    this._fid = val;
    if (this.dm) {
      this.proto[3] = val;
      this.proto[10] = val;
    } else {
      this.proto[7] = val;
    }
  }

  get fid() {
    return this._fid;
  }

  /**
   * @param elem
   * @param cachedir
   * @param dm 是否私聊图片
   */
  constructor(client, elem, opts, cachedir) {
    this.client = client;
    this.dm = opts.dm;
    this.opts = opts;
    this.cachedir = cachedir;
    /** 最终用于发送的对象 */
    this.proto = {};
    /** 图片属性 */
    this.md5 = randomBytes(16);
    this.size = 0xffff;
    this.width = 320;
    this.height = 240;
    this.type = 1000;

    let { file, cache, timeout, headers, asface, origin = true, summary, fid, width, height, nt } = elem;
    this.origin = origin;
    this.asface = asface;
    this.summary = summary;
    /** 尝试从elem中获取宽高 */
    this.width = width;
    this.height = height;
    this.nt = nt;

    if (!nt && fid) {
      this._fid = typeof fid === 'number' ? fid : Buffer.from(fid, 'hex');
    }

    this.setProto();

    if (nt) {
      this.nt_fileid = typeof fid === 'string' ? fid : '';
    }

    if (file instanceof Buffer) {
      this.task = this.fromProbeSync(file);
    } else if (file instanceof Readable) {
      this.task = this.fromReadable(file);
    } else if (typeof file !== 'string') {
      throw new Error('bad file param: ' + file);
    } else if (file.startsWith('base64://')) {
      this.task = this.fromProbeSync(Buffer.from(file.slice(9), 'base64'));
    } else if (file.startsWith('http://') || file.startsWith('https://')) {
      this.task = this.fromWeb(file, cache, headers, timeout);
    } else {
      this.task = this.fromLocal(file);
    }
  }

  setUrl(url) {
    this.task = this.fromWeb(url);
  }

  setProperties(dimensions) {
    if (!dimensions) throw new Error('bad image file');
    this.type = TYPE?.[dimensions?.type] || 1000;
    this.width = dimensions.width;
    this.height = dimensions.height;
  }

  parseFileParam(file) {
    const { md5, size, width, height, ext } = parseImageFileParam(file);
    const hash = Buffer.from(md5, 'hex');
    if (hash.length !== 16) throw new Error('bad file param: ' + file);
    this.md5 = hash;
    size > 0 && (this.size = size);
    /** 优先使用elem中的宽高 */
    this.width = this.width || width;
    this.height = this.height || height;
    TYPE[ext] && (this.type = TYPE[ext]);
    this.setProto();
  }

  async fromProbeSync(buf) {
    const dimensions = probeImageSize.sync(buf);
    this.setProperties(dimensions);
    this.md5 = md5(buf);
    this.size = buf.length;
    this.readable = Readable.from(buf, { objectMode: false });
    this.setProto();
  }

  async fromReadable(readable, timeout) {
    let id;
    try {
      readable = readable.pipe(new DownloadTransform());
      timeout = timeout > 0 ? timeout : 60;
      this.tmpfile = path.join(TMP_DIR, uuid());

      id = setTimeout(() => {
        readable.destroy();
      }, timeout * 1000);

      const [dimensions, md5] = await Promise.all([probeImageSize(readable, true), md5Stream(readable), pipeline(readable, fs.createWriteStream(this.tmpfile))]);

      this.setProperties(dimensions);
      this.md5 = md5;
      this.size = (await fs.promises.stat(this.tmpfile)).size;
      this.readable = fs.createReadStream(this.tmpfile, { highWaterMark: 1024 * 256 });
      this.setProto();
    } catch (e) {
      this.deleteTmpFile();
      throw e;
    } finally {
      clearTimeout(id);
    }
  }

  async fromWeb(url, cache, headers, timeout) {
    if (this.cachedir) {
      this.cachefile = path.join(this.cachedir, md5(url).toString('hex'));
      if (cache) {
        try {
          this.parseFileParam(await fs.promises.readFile(this.cachefile, 'utf8'));
          return;
        } catch {}
      }
    }

    const readable = (
      await axios.get(url, {
        headers,
        responseType: 'stream',
      })
    ).data;

    await this.fromReadable(readable, timeout);

    if (this.cachefile) {
      fs.writeFile(this.cachefile, buildImageFileParam(this.md5.toString('hex'), this.size, this.width, this.height, this.type), NOOP);
    }
  }

  async fromLocal(file) {
    try {
      // 收到的图片
      this.parseFileParam(file);
    } catch {
      // 本地图片
      file.startsWith('file://') && (file = file.slice(7).replace(/%20/g, ' '));
      IS_WIN && file.startsWith('/') && (file = file.slice(1));

      const stat = await fs.promises.stat(file);
      if (stat.size <= 0 || stat.size > MAX_UPLOAD_SIZE) {
        throw new Error('bad file size: ' + stat.size);
      }

      const readable = fs.createReadStream(file);
      const [dimensions, md5] = await Promise.all([probeImageSize(readable, true), md5Stream(readable)]);

      readable.destroy();
      this.setProperties(dimensions);
      this.md5 = md5;
      this.size = stat.size;
      this.readable = fs.createReadStream(file, { highWaterMark: 1024 * 256 });
      this.setProto();
    }
  }

  setProto() {
    let proto;
    if (this.dm) {
      proto = {
        1: this.md5.toString('hex'),
        2: this.size,
        3: this._fid,
        5: this.type,
        7: this.md5,
        8: this.height,
        9: this.width,
        10: this._fid,
        13: this.origin ? 1 : 0,
        14: `/gchatpic_new/${this.client}/${this.opts.id}-${this._fid}-${this.md5.toString('hex').toLocaleUpperCase()}/198?term=2&is_origin=1`,
        15: `/gchatpic_new/${this.client}/${this.opts.id}-${this._fid}-${this.md5.toString('hex').toLocaleUpperCase()}/720?term=2&is_origin=1`,
        16: this.type === 4 ? 5 : 0,
        24: 0,
        25: 0,
        29: {
          1: this.asface ? 1 : 0,
        },
      };
    } else {
      proto = {
        2: this.md5.toString('hex') + (this.asface ? '.gif' : '.jpg'),
        7: this._fid,
        8: 0,
        9: 0,
        10: 66,
        12: 1,
        13: this.md5,
        14: `/gchatpic_new/${this.client}/${this.opts.id}-${this._fid}-${this.md5.toString('hex').toLocaleUpperCase()}/198?term=2&is_origin=1`,
        15: `/gchatpic_new/${this.client}/${this.opts.id}-${this._fid}-${this.md5.toString('hex').toLocaleUpperCase()}/720?term=2&is_origin=1`,
        16: `/gchatpic_new/${this.client}/${this.opts.id}-${this._fid}-${this.md5.toString('hex').toLocaleUpperCase()}/0?term=2&is_origin=1`,
        20: this.type,
        22: this.width,
        23: this.height,
        24: 200,
        25: this.size,
        26: this.origin ? 1 : 0,
        29: 0,
        30: 0,
        34: {
          1: this.asface ? 1 : 0,
        },
      };
    }

    if (this.summary) {
      proto[this.dm ? 29 : 34][this.dm ? 8 : 9] = this.summary;
    }

    Object.assign(this.proto, proto);
  }

  /** 服务端图片失效时建议调用此函数 */
  deleteCacheFile() {
    this.cachefile && fs.unlink(this.cachefile, NOOP);
  }

  /** 图片上传完成后建议调用此函数(文件存在系统临时目录中) */
  deleteTmpFile() {
    this.tmpfile && fs.unlink(this.tmpfile, NOOP);
    this.readable?.destroy();
  }
}

import protobuf from 'protobufjs/minimal.js';
import * as zlib from 'zlib';

class Proto {
  get length() {
    return this.encoded.length;
  }

  constructor(encoded, decoded) {
    this.encoded = encoded;
    if (decoded) Reflect.setPrototypeOf(this, decoded);
  }

  sliceAndDecode(start) {
    const slicedBuffer = this.encoded.slice(start);
    try {
      const decoded = decode(slicedBuffer);
      return new Proto(slicedBuffer, decoded);
    } catch (error) {
      const tempProto = new Proto(slicedBuffer);
      const decoded = tempProto.toJSON();
      return new Proto(slicedBuffer, decoded);
    }
  }

  checkTag(...tags) {
    return Object.keys(decode(this.encoded)).filter((key) => tags.includes(parseInt(key))).length === tags.length;
  }

  toString() {
    return this.encoded.toString();
  }

  toHex() {
    return this.encoded.toString('hex');
  }

  toBase64() {
    return this.encoded.toString('base64');
  }

  toBuffer() {
    return this.encoded;
  }

  toJSONString(replacer, space) {
    return JSON.stringify(this.toJSON(true), replacer, space);
  }

  toJSON(convertBigInt = false) {
    const toJSON = (buf) => {
      const compress = decodeCompress(buf);
      if (compress) return compress;
      const result = {};
      const reader = new protobuf.Reader(buf);
      while (reader.pos < reader.len) {
        const k = reader.uint32();
        const tag = k >> 3,
          type = k & 0b111;
        let value, decoded, temp;
        if (tag > 25600 || tag < 0) return decodeCompress(buf) || decodeBuf(buf);
        switch (type) {
          case 0:
            temp = reader.int64();
            value = long2int(temp);
            break;
          case 1:
            value = long2int(reader.fixed64());
            break;
          case 2:
            value = Buffer.from(reader.bytes());
            try {
              decoded = decodeCompress(value) || toJSON(value);
            } catch (error) {
              decoded = decodeBuf(value);
            }
            value = decoded;
            break;
          case 3:
          case 5:
            value = reader.fixed32();
            break;
          default:
            return decodeCompress(buf) || decodeBuf(buf);
        }
        if (convertBigInt && typeof value === 'bigint') {
          value = { type: 'bigint', data: value.toString() };
        }
        if (Array.isArray(result[tag])) {
          result[tag].push(value);
        } else if (Reflect.has(result, tag)) {
          result[tag] = [result[tag]];
          result[tag].push(value);
        } else {
          result[tag] = value;
        }
      }
      return result;
    };
    return toJSON(this.encoded);
  }

  [Symbol.toPrimitive]() {
    return this.toString();
  }
}

function _encode(writer, tag, value) {
  if (value === null || value === undefined) return;
  let type = 2;
  if (typeof value === 'number') {
    type = Number.isInteger(value) ? 0 : 1;
  } else if (typeof value === 'string') {
    value = Buffer.from(value);
  } else if (value instanceof Uint8Array) {
    //
  } else if (value instanceof Proto) {
    value = value.toBuffer();
  } else if (typeof value === 'object') {
    const type = value?.type || 'object';
    switch (type) {
      case 'bigint':
        _encode(writer, tag, BigInt(value.data));
        return;
      case 'hex':
        value = Buffer.from(value.data, 'hex');
        break;
      case 'base64':
        value = Buffer.from(value.data, 'base64');
        break;
      case 'gzip':
        value = Buffer.concat([Buffer.from(value.head || '', 'hex'), zlib.gzipSync(Buffer.from(value.data, 'base64'))]);
        break;
      case 'deflate':
        value = Buffer.concat([Buffer.from(value.head || '', 'hex'), zlib.deflateSync(Buffer.from(value.data, 'base64'))]);
        break;
      case 'trans':
        const length = Buffer.alloc(2);
        const encoded = encode(value.data);
        length.writeUInt16BE(encoded.length, 0);
        value = Buffer.concat([Buffer.from(value.head || '', 'hex'), length, encoded]);
        break;
      default:
        value = encode(value);
        break;
    }
  } else if (typeof value === 'bigint') {
    const tmp = new protobuf.util.Long();
    tmp.unsigned = false;
    tmp.low = Number(value & 0xffffffffn);
    tmp.high = Number((value & 0xffffffff00000000n) >> 32n);
    value = tmp;
    type = 1;
  } else {
    return;
  }
  const head = (tag << 3) | type;
  writer.uint32(head);
  switch (type) {
    case 0:
      if (value < 0) writer.sint64(value);
      else writer.int64(value);
      break;
    case 2:
      writer.bytes(value);
      break;
    case 1:
      if (typeof value === 'object') writer.fixed64(value);
      else writer.double(value);
      break;
  }
}

function encode(obj) {
  Reflect.setPrototypeOf(obj, null);
  const writer = new protobuf.Writer();
  for (const tag of Object.keys(obj).map(Number)) {
    const value = obj[tag];
    if (Array.isArray(value)) {
      for (let v of value) _encode(writer, tag, v);
    } else {
      _encode(writer, tag, value);
    }
  }
  return Buffer.from(writer.finish());
}

function decode(encoded) {
  if (encoded === '') return {};
  if (typeof encoded === 'string') encoded = Buffer.from(encoded, 'hex');
  encoded = encoded instanceof Buffer ? encoded : Buffer.from(encoded);
  const result = new Proto(encoded);
  const reader = new protobuf.Reader(encoded);
  while (reader.pos < reader.len) {
    const k = reader.uint32();
    const tag = k >> 3,
      type = k & 0b111;
    let value, decoded;
    switch (type) {
      case 0:
        value = long2int(reader.int64());
        break;
      case 1:
        value = long2int(reader.fixed64());
        break;
      case 2:
        value = Buffer.from(reader.bytes());
        try {
          decoded = decode(value);
        } catch {}
        value = new Proto(value, decoded);
        break;
      case 5:
        value = reader.fixed32();
        break;
      default:
        return null;
    }
    if (Array.isArray(result[tag])) {
      result[tag].push(value);
    } else if (Reflect.has(result, tag)) {
      result[tag] = [result[tag]];
      result[tag].push(value);
    } else {
      result[tag] = value;
    }
  }
  return result;
}

function decodePb(encoded) {
  return decode(encoded instanceof Proto ? encoded.toBuffer() : encoded).toJSON();
}

function long2int(long) {
  if (long.high === 0) return long.low >>> 0;
  const bigint = (BigInt(long.high) << 32n) | (BigInt(long.low) & 0xffffffffn);
  const int = Number(bigint);
  return Number.isSafeInteger(int) ? int : bigint;
}

function isReadable(hexString) {
  try {
    decodeURIComponent(hexString);
    return true;
  } catch (e) {
    return false;
  }
}

function decodeBuf(buf) {
  if (!buf.includes('0000', 0, 'hex')) {
    if ([0x5b, 0x7b].includes(buf[0]) && [0x5d, 0x7d].includes(buf[buf.length - 1])) {
      return buf.toString();
    } else if (ProtoBufTextDetector.determineFieldType(buf) === 'string') {
      return buf.toString();
    }
  }
  const encoding = buf.length > 128 ? 'base64' : 'hex';
  return buf.length ? { type: encoding, data: buf.toString(encoding) } : {};
}

function decodeCompress(buf) {
  let rsp = {
    type: '',
    data: '',
  };
  if (buf[0] == 0x01 || buf[0] == 0x00) {
    rsp.head = buf.subarray(0, 1).toString('hex');
    buf = buf.subarray(1);
  }
  const magicNumber = buf.readUInt16BE(0);
  try {
    let data;
    if (magicNumber === 0x1f8b) {
      data = zlib.unzipSync(buf);
      rsp.type = 'gzip';
    } else if (magicNumber === 0x789c) {
      data = zlib.inflateSync(buf);
      rsp.type = 'deflate';
    } else if (magicNumber === buf.length - 2) {
      rsp.type = 'trans';
      rsp.data = decode(buf.subarray(2)).toJSON();
      return rsp;
    } else {
      return false;
    }
    const string = decodeBuf(data);
    if (typeof string === 'string') rsp.string = string;
    rsp.data = data.toString('base64');
    return rsp;
  } catch (error) {
    return false;
  }
}

/**
 * 判断字节数组是否是有效的 UTF-8 或 ASCII 文本
 */
class TextEncodingDetector {
  /**
   * 检测字节数组的文本编码可能性
   * @param bytes 字节数组
   * @returns 检测结果对象
   */
  static detectTextEncoding(bytes) {
    if (!bytes || bytes.length === 0) {
      return {
        isLikelyText: false,
        encoding: 'binary',
        confidence: 'low',
      };
    }
    // 先检查是否是纯 ASCII
    const asciiResult = this.checkASCII(bytes);
    if (asciiResult.isASCII) {
      return {
        isLikelyText: true,
        encoding: 'ascii',
        confidence: 'high',
      };
    }
    // 检查是否是有效的 UTF-8
    const utf8Result = this.checkUTF8(bytes);
    if (utf8Result.isValidUTF8) {
      const confidence = utf8Result.validMultiByteCount > 0 ? 'high' : 'medium';
      return {
        isLikelyText: true,
        encoding: 'utf8',
        confidence,
      };
    }
    return {
      isLikelyText: false,
      encoding: 'binary',
      confidence: 'high',
    };
  }

  /**
   * 检查是否是纯 ASCII
   */
  static checkASCII(bytes) {
    let printableCount = 0;
    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i];
      if ((byte >= 0x20 && byte <= 0x7e) || byte === 0x09 || byte === 0x0a || byte === 0x0d) {
        printableCount++;
      } else {
        return { isASCII: false, printableCount };
      }
    }
    return { isASCII: true, printableCount };
  }

  /**
   * 检查是否是有效的 UTF-8 编码
   */
  static checkUTF8(bytes) {
    let i = 0;
    let validMultiByteCount = 0;
    while (i < bytes.length) {
      const byte1 = bytes[i];
      if (byte1 <= 0x7f) {
        i++;
        continue;
      }
      if ((byte1 & 0xe0) === 0xc0) {
        if (i + 1 >= bytes.length) return { isValidUTF8: false, validMultiByteCount, errorPosition: i };
        const byte2 = bytes[i + 1];
        if ((byte2 & 0xc0) !== 0x80) {
          return { isValidUTF8: false, validMultiByteCount, errorPosition: i };
        }
        const codePoint = ((byte1 & 0x1f) << 6) | (byte2 & 0x3f);
        if (codePoint < 0x80) {
          return { isValidUTF8: false, validMultiByteCount, errorPosition: i };
        }
        validMultiByteCount++;
        i += 2;
        continue;
      }
      if ((byte1 & 0xf0) === 0xe0) {
        if (i + 2 >= bytes.length) return { isValidUTF8: false, validMultiByteCount, errorPosition: i };
        const byte2 = bytes[i + 1];
        const byte3 = bytes[i + 2];
        if ((byte2 & 0xc0) !== 0x80 || (byte3 & 0xc0) !== 0x80) {
          return { isValidUTF8: false, validMultiByteCount, errorPosition: i };
        }
        validMultiByteCount++;
        i += 3;
        continue;
      }
      if ((byte1 & 0xf8) === 0xf0) {
        if (i + 3 >= bytes.length) return { isValidUTF8: false, validMultiByteCount, errorPosition: i };
        const byte2 = bytes[i + 1];
        const byte3 = bytes[i + 2];
        const byte4 = bytes[i + 3];
        if ((byte2 & 0xc0) !== 0x80 || (byte3 & 0xc0) !== 0x80 || (byte4 & 0xc0) !== 0x80) {
          return { isValidUTF8: false, validMultiByteCount, errorPosition: i };
        }
        validMultiByteCount++;
        i += 4;
        continue;
      }
      return { isValidUTF8: false, validMultiByteCount, errorPosition: i };
    }
    return { isValidUTF8: true, validMultiByteCount };
  }
}

class ProtoBufTextDetector {
  /**
   * 判断 ProtoBuf 字节数据应该是 string 还是 bytes
   */
  static determineFieldType(dataBytes) {
    const detection = TextEncodingDetector.detectTextEncoding(dataBytes);
    if (!detection.isLikelyText) {
      return 'bytes';
    }
    if (detection.confidence === 'high') {
      return 'string';
    }
    if (this.hasTextPatterns(dataBytes)) {
      return 'string';
    }
    return 'unknown';
  }

  /**
   * 检查文本模式特征
   */
  static hasTextPatterns(bytes) {
    if (bytes.length === 0) return false;
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const patterns = [/^[a-zA-Z0-9.-]+$/, /^https?:\/\//, /^[a-zA-Z0-9_/.-]+$/, /^{.*}$/, /^\[.*\]$/];
    return patterns.some((pattern) => pattern.test(text));
  }
}

export default { Proto, encode, decode, decodePb, isReadable };

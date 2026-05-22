import { deflateSync } from 'zlib';
import { facemap, FACE_OLD_BUF } from './parser.js';
import { Image } from './image.js';
import { ChainElemTypes } from './elements.js';
import pb from './protobuf/index.js';
import makeConfig from '../../../lib/plugins/config.js';
import { parseDmMessageId, parseGroupMessageId } from './message.js';

const { config, configSave } = await makeConfig(
  'Secluded',
  {
    tips: '',
    permission: 'master',
    bot: {},
    http_url: 'http://127.0.0.1:80',
    ws_url: 'ws://127.0.0.1:24804',
    http_secretToken: null,
    ws_secretToken: 'SecretToken',
    token: [],
    maxConcurrent: 6,
  },
  {
    tips: ['欢迎使用 TRSS-Yunzai Secluded Plugin ! 作者：堀学长', '参考：https://gitee.com/Milchstraber/Secluded-Plugin'],
  }
);

function rand2uuid(rand) {
  return (16777216n << 32n) | BigInt(rand);
}

const EMOJI_NOT_ENDING = ['\uD835', '\uD83C', '\uD83D', '\uD83E', '\u200D'];
const EMOJI_NOT_STARTING = ['\uFE0F', '\u200D', '\u20E3'];

const AT_BUF = Buffer.from([0, 1, 0, 0, 0]);
const BUF0 = Buffer.alloc(0);
const BUF1 = Buffer.from([1]);
const BUF2 = Buffer.alloc(2);

function RandomInt(num1, num2) {
  const min = Math.min(num1, num2);
  const max = Math.max(num1, num2);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function PB_RESERVER() {
  const PB_RESERVER = {
    37: {
      16: config?.bot?.bubble_rand ? RandomInt(2000000, 2025658) : config?.bot?.bubble_id || 0,
      17: 0,
      19: {
        15: config?.bot?.font_id || 0,
        31: 0,
        41: 0,
      },
    },
  };
  return PB_RESERVER;
}

let faces;
(function initializeFaces() {
  faces = [];
  if (config?.bot.faceids) {
    for (let i = 0; i < config.bot.faceids.length; i++) {
      faces.push({
        1: String(config.bot.faceids[i]),
        2: 1,
        3: 1000,
        4: 1,
      });
    }
  }
  if (faces.length === 0)
    faces = [
      {
        1: '66',
        2: 1,
        3: 1000,
        4: 1,
      },
    ];
})();

const PB_FACE_RESERVER = {
  53: {
    1: 38,
    2: {
      1: {
        1: {
          1: 5,
          2: 7240,
        },
        2: faces,
      },
    },
    3: 1,
  },
};

const random = (a, b) => Math.floor(Math.random() * (b - a) + a);

/** 将消息元素转换为protobuf */
export class Converter {
  constructor(client, content, ext) {
    this.client = client;
    this.content = content;
    this.ext = ext;
    this.is_chain = true;
    this.is_longMsg = false;
    this.elems = [];
    /** 用于最终发送 */
    this.rich = { 2: this.elems, 4: null };
    /** 长度(字符) */
    this.length = 0;
    /** 包含的图片(可能需要上传) */
    this.imgs = [];
    /** 预览文字 */
    this.brief = '';
    /** 分片后 */
    this.fragments = [];
    let _content = Array.isArray(content) ? content : [content];
    for (let elem of _content) {
      if (!(typeof elem === 'string' || ChainElemTypes.includes(elem.type)) && Reflect.has(this, elem.type)) {
        _content = [elem];
        break;
      }
    }
    this.content = _content;
    for (let elem of this.content) {
      this._convert(elem);
    }
    if (!this.elems.length && !this.rich[4]) throw new Error('empty message');
    if (!this.is_longMsg) this.elems.push(PB_RESERVER());
    if (!this.ext?.dm && config.bot?.replyface) this.elems.push(PB_FACE_RESERVER);
  }

  _convert(elem) {
    if (typeof elem === 'string') this._text(elem);
    else if (Reflect.has(this, elem.type)) this[elem.type](elem);
  }

  long_msg(elem) {
    this.elems.push({
      37: {
        6: 1,
        7: elem.resid,
        17: 0,
        19: {
          15: 0,
          31: 0,
          41: 0,
        },
      },
    });
    this.is_longMsg = true;
  }

  _text(text, attr6) {
    text = String(text);
    if (!text.length) return;
    this.elems.push({
      1: {
        1: text,
        3: attr6,
      },
    });
    this.length += text.length;
    this.brief += text;
  }

  text(elem) {
    this._text(elem.text);
  }

  at(elem) {
    if (this.ext?.dm) return;
    let uid = '';
    let { qq, id, text, dummy } = elem;
    if (qq === 0 && id) {
      // 频道中的AT
      this.elems.push({
        1: {
          1: text || (id === 'all' ? '@全体成员' : '@' + id),
          12: {
            3: 2,
            5: id === 'all' ? 0 : BigInt(id),
          },
        },
      });
      return;
    }
    if (qq === 'all') {
      var q = 0,
        flag = 1,
        display = '全体成员';
    } else {
      var q = Number(qq),
        flag = 0,
        display = text || String(qq);
      const member = this.ext?.mlist?.get(q);
      uid = member?.user_uid || '';
      if (!text) {
        display = member?.card || member?.nickname || display;
      }
    }
    display = '@' + display;
    if (dummy) return this._text(display);
    const buf = Buffer.allocUnsafe(6);
    buf.writeUInt8(display.length);
    buf.writeUInt8(flag, 1);
    buf.writeUInt32BE(q, 2);
    const attr6 = Buffer.concat([AT_BUF, buf, BUF2]);
    this.elems.push({
      1: {
        1: display,
        3: attr6,
        12:
          q === 0 || uid?.length
            ? {
                3: flag === 1 ? 1 : 2,
                4: q,
                5: 0,
                9: q === 0 ? 'all' : uid,
                11: 0,
              }
            : undefined,
      },
    });
  }

  face(elem) {
    let { id, big, stickerId, stickerType, text } = elem;
    let faceObj = facemap[id] ||
      Object.entries(facemap)
        .map(([id, obj]) => {
          return { id, ...obj };
        })
        .find((v) => v.text.includes(id)) || { id, text: '/' + id };
    text || (text = faceObj.text);
    stickerId || (stickerId = faceObj.stickerId);
    stickerType = typeof stickerType !== 'number' ? faceObj.stickerType : stickerType;
    id = Number(faceObj.id) || id;
    if (id < 0 || id > 0xffff || isNaN(id)) throw new Error('wrong face id: ' + id);
    if (stickerId && big) {
      this.elems.push({
        53: {
          1: 37,
          2: {
            1: '1',
            2: stickerId,
            3: id,
            4: 1,
            5: stickerType,
            6: {},
            7: text,
            8: {},
            9: 1,
          },
          3: stickerType,
        },
      });
      return;
    } else if (id <= 0xff) {
      const old = Buffer.allocUnsafe(2);
      old.writeUInt16BE(0x1441 + id);
      this.elems.push({
        2: {
          1: id,
          2: old,
          11: FACE_OLD_BUF,
        },
      });
    } else {
      this.elems.push({
        53: {
          1: 33,
          2: {
            1: id,
            2: text,
            3: text,
          },
          3: 1,
        },
      });
    }
    this.brief += '[表情]';
  }

  sface(elem) {
    let { id, text } = elem;
    if (!text) text = String(id);
    text = '[' + text + ']';
    this.elems.push({
      34: {
        1: Number(id),
        2: 1,
      },
    });
    this._text(text);
  }

  bface(elem, magic) {
    let { file, text } = elem;
    if (!text) text = '原创表情';
    text = '[' + String(text).slice(0, 5) + ']';
    const o = {
      1: text,
      2: 6,
      3: 1,
      4: Buffer.from(file.slice(0, 32), 'hex'),
      5: parseInt(file.slice(64)),
      6: 3,
      7: Buffer.from(file.slice(32, 64), 'hex'),
      9: 0,
      10: 200,
      11: 200,
      12: magic || null,
    };
    this.elems.push({ 6: o });
    this._text(text);
  }

  raw(elem) {
    this.elems.push(elem.data);
    this.brief += elem.brief || '[原始消息]';
  }

  dice(elem) {
    const id = elem.id >= 1 && elem.id <= 6 ? elem.id - 1 : random(0, 6);
    return this.bface(
      {
        type: 'bface',
        file: '4823d3adb15df08014ce5d6796b76ee13430396532613639623136393138663911464',
        text: '骰子',
      },
      Buffer.from([0x72, 0x73, 0x63, 0x54, 0x79, 0x70, 0x65, 0x3f, 0x31, 0x3b, 0x76, 0x61, 0x6c, 0x75, 0x65, 0x3d, 0x30 + id])
    );
  }

  rps(elem) {
    const id = elem.id >= 1 && elem.id <= 3 ? elem.id - 1 : random(0, 3);
    return this.bface(
      {
        type: 'bface',
        file: '83c8a293ae65ca140f348120a77448ee3764653339666562636634356536646211415',
        text: '猜拳',
      },
      Buffer.from([0x72, 0x73, 0x63, 0x54, 0x79, 0x70, 0x65, 0x3f, 0x31, 0x3b, 0x76, 0x61, 0x6c, 0x75, 0x65, 0x3d, 0x30 + id])
    );
  }

  image(elem) {
    let file = String(elem.file);
    if (!file.startsWith('protobuf://')) throw new Error('非法的视频元素: ' + file);
    let buf = Buffer.from(file.replace('protobuf://', ''), 'base64');
    const proto = pb.decode(buf);
    this.elems.push({ 53: proto });
    this.brief += elem.summary || '[图片]';
  }

  flash(elem) {
    const img = new Image(this.client, elem, this.ext?.dm, this.ext?.cachedir);
    this.imgs.push(img);
    this.elems.push({ 53: img.proto });
    this.elems.push({
      1: {
        1: '[闪照]请使用新版手机QQ查看闪照。',
      },
    });
    this.brief += '[闪照]';
  }

  record(elem) {
    let file = String(elem.file);
    if (!file.startsWith('protobuf://')) throw new Error('非法的语音元素: ' + file);
    const buf = Buffer.from(file.replace('protobuf://', ''), 'base64');
    const proto = pb.decode(buf);
    elem.nt = proto[1] === 48 && [12, 22].includes(proto[3]);
    if (elem.nt) {
      this.elems.push({ 53: buf });
    } else {
      this.rich[4] = buf;
    }
    this.brief += '[语音]';
    this.is_chain = false;
  }

  video(elem) {
    let file = String(elem.file);
    if (!file.startsWith('protobuf://')) throw new Error('非法的视频元素: ' + file);
    let buf = Buffer.from(file.replace('protobuf://', ''), 'base64');
    const proto = pb.decode(buf);
    elem.nt = proto[1] === 48 && [11, 14, 21, 24].includes(proto[3]);
    if (elem.nt) {
      buf = pb.encode({
        1: proto[1],
        2: proto[2],
        3: Math.floor(proto[3] / 10) === 1 ? 11 : 21,
      });
    }
    this.elems.push(elem.nt ? { 53: buf } : { 19: buf });
    this.elems.push({
      1: {
        1: '你的QQ暂不支持查看视频短片，请期待后续版本。',
      },
    });
    this.brief += '[视频]';
    this.is_chain = false;
  }

  bubble(elem) {
    let file = String(elem.file);
    if (!file.startsWith('protobuf://')) throw new Error('非法的视频元素: ' + file);
    let buf = Buffer.from(file.replace('protobuf://', ''), 'base64');
    const proto = pb.decode(buf);
    elem.nt = proto[1] === 48 && [11, 14, 21, 24].includes(proto[3]);
    if (!elem.nt) throw new Error('泡泡消息仅支持NT视频！');
    buf = pb.encode({
      1: proto[1],
      2: proto[2],
      3: Math.floor(proto[3] / 10) === 1 ? 14 : 24,
    });
    this.elems.push(elem.nt ? { 53: buf } : { 19: buf });
    this.elems.push({
      1: {
        1: '你收到一条泡泡消息，可在9.2.10及以上版本的手机QQ上查看。',
      },
    });
    this.brief += '[泡泡消息]';
    this.is_chain = false;
  }

  location(elem) {
    let { address, lat, lng, name, id } = elem;
    if (!address || !lat || !lng) throw new Error("location share need 'address', 'lat' and 'lng'");
    let data = {
      config: { forward: true, type: 'card', autosize: true },
      prompt: '[应用]地图',
      from: 1,
      app: 'com.tencent.map',
      ver: '1.0.3.5',
      view: 'LocationShare',
      meta: {
        'Location.Search': {
          from: 'plusPanel',
          id: id || '',
          lat,
          lng,
          address,
          name: name || '位置分享',
        },
      },
      desc: '地图',
    };
    this.json({
      type: 'json',
      data,
    });
  }

  node(elem) {
    throw new Error('这个不能直接发');
  }

  share(elem) {
    throw new Error('这个不能直接发');
  }

  json(elem) {
    const json = typeof elem.data === 'object' ? elem.data : JSON.parse(elem.data);
    this.elems.push({
      51: {
        1: Buffer.concat([BUF1, deflateSync(JSON.stringify(json))]),
      },
    });
    this.brief += json.prompt || '[json消息]';
    this.is_chain = false;
  }

  xml(elem) {
    this.elems.push({
      12: {
        1: Buffer.concat([BUF1, deflateSync(elem.data)]),
        2: elem.id > 0 ? elem.id : 60,
      },
    });
    this.brief += elem.data.match(/brief\=\"(.*?)\"/)?.[1] || '[xml消息]';
    this.is_chain = false;
  }

  poke(elem) {
    let { id } = elem;
    //if (!(id >= 0 && id <= 6)) throw new Error('wrong poke id: ' + id);
    this.elems.push({
      53: {
        1: 2,
        2: {
          3: 0,
          7: 0,
          10: 0,
        },
        3: id,
      },
    });
    this.brief += '[戳一戳]';
    this.is_chain = false;
  }

  markdown(elem) {
    const { content, config } = elem;
    this.elems.push({
      53: {
        1: 45,
        2: {
          1: content,
          2: config
            ? {
                1: config.unknown || 1,
                2: config.time || 0,
                3: config.token ? Buffer.from(config.token, 'hex') : BUF0,
              }
            : null,
        },
        3: 1,
      },
    });
    this.brief += '[markdown消息]';
  }

  button(elem) {
    const { content } = elem;
    const _content = {
      1: {
        1: content.rows.map((row) => {
          return {
            1: row.buttons.map((button) => {
              return {
                1: button.id,
                2: {
                  1: button.render_data.label,
                  2: button.render_data.visited_label,
                  3: button.render_data.style,
                },
                3: {
                  1: button.action.type,
                  2: {
                    1: button.action.permission.type,
                    2: button.action.permission.specify_role_ids,
                    3: button.action.permission.specify_user_ids,
                  },
                  4: button.action.unsupport_tips,
                  5: button.action.data,
                  7: button.action.reply ? 1 : 0,
                  8: button.action.enter ? 1 : 0,
                },
              };
            }),
          };
        }),
        2: content.appid,
      },
    };
    this.elems.push({
      53: {
        1: 46,
        2: _content,
        3: 1,
      },
    });
    this.brief += '[button消息]';
  }

  forum(elem) {
    throw new Error('暂不支持发送帖子，请有缘人补上');
  }

  mirai(elem) {
    const { data } = elem;
    this.elems.push({
      31: {
        2: String(data),
        3: 103904510,
      },
    });
    this.brief += data;
  }

  file(elem) {
    throw new Error('暂不支持发送或转发file元素，请调用文件相关API完成该操作');
  }

  reply(elem) {
    const { id } = elem;
    if (id.length > 28) this.quote({ ...parseGroupMessageId(id), message: elem.text || '[消息]' });
    else this.quote({ ...parseDmMessageId(id), message: elem.text || '[消息]' });
  }

  multimsg(elem) {
    return this.json({
      type: 'json',
      data: createMultimsgJson(elem),
    });
  }

  /** 转换为分片消息 */
  toFragments() {
    this.elems.pop();
    let frag = [];
    for (let proto of this.elems) {
      if (proto[1] && !proto[1][3]) {
        this._pushFragment(frag);
        frag = [];
        this._divideText(proto[1][1]);
      } else {
        frag.push(proto);
      }
    }
    if (!frag.length && this.fragments.length === 1) {
      frag.push({
        1: {
          1: '',
        },
      });
    }
    this._pushFragment(frag);
    return this.fragments;
  }

  _divideText(text) {
    let n = 0;
    while (n < text.length) {
      let m = n + 80;
      let chunk = text.slice(n, m);
      n = m;
      if (text.length > n) {
        // emoji不能从中间分割，否则客户端会乱码
        while (EMOJI_NOT_ENDING.includes(chunk[chunk.length - 1]) && text[n]) {
          chunk += text[n];
          ++n;
        }
        while (EMOJI_NOT_STARTING.includes(text[n])) {
          chunk += text[n];
          ++n;
          while (EMOJI_NOT_ENDING.includes(chunk[chunk.length - 1]) && text[n]) {
            chunk += text[n];
            ++n;
          }
        }
      }
      this._pushFragment([
        {
          1: {
            1: chunk,
          },
        },
      ]);
    }
  }

  _pushFragment(proto) {
    if (proto.length > 0) {
      proto.push(PB_RESERVER);
      this.fragments.push(
        pb.encode({
          2: proto,
        })
      );
    }
  }

  /** 匿名化 */
  anonymize(anon) {
    this.elems.unshift({
      21: {
        1: 2,
        3: anon.name,
        4: anon.id2,
        5: anon.expire_time,
        6: anon.id,
      },
    });
  }

  /** 引用回复 */
  quote(source) {
    const elems = new Converter(this.client, source.message || '', this.ext).elems;
    const tmp = this.brief;
    if (!this.ext?.dm) {
      this.at({ type: 'at', qq: source.user_id });
      this.elems.unshift(this.elems.pop());
    }
    this.elems.unshift({
      45: {
        1: [source.seq],
        2: source.user_id,
        3: source.time,
        4: 1,
        5: elems,
        6: 0,
        8: {
          3: rand2uuid(source.rand || 0),
        },
      },
    });
    this.brief = `[回复${this.brief.replace(tmp, '')}]` + tmp;
  }
}

export function createMultimsgJson(elem) {
  if (!Array.isArray(elem.preview) && typeof elem.preview === 'string') elem.preview = [elem.preview];
  if (!elem.preview?.length) elem.preview = [];
  return {
    app: 'com.tencent.multimsg',
    config: { autosize: 1, forward: 1, round: 1, type: 'normal', width: 300 },
    desc: elem.prompt || '[聊天记录]',
    extra: '',
    meta: {
      detail: {
        news: elem.preview.map((text) => {
          return { text };
        }),
        resid: elem.resid,
        source: elem.title || '转发的聊天记录',
        summary: elem.content || '查看转发消息',
        uniseq: elem.filename,
      },
    },
    prompt: elem.prompt || '[聊天记录]',
    ver: '0.0.0.5',
    view: 'contact',
  };
}

export function parseMultimsg(elem) {
  let resid = '',
    filename = '',
    title = undefined,
    content = undefined,
    preview = [],
    prompt = undefined;
  if (elem.type === 'xml') {
    const brief_match = /brief\=\"(.*?)\"/gm.exec(elem.data);
    const resid_match = /m_resid\=\"(.*?)\"/gm.exec(elem.data);
    const filename_match = /m_fileName\=\"(.*?)\"/gm.exec(elem.data);
    const title_reg = /<title\s*[^>]*>(.*?)<\/title>/gi;
    const summary_match = /<summary\s*[^>]*>(.*?)<\/summary>/i.exec(elem.data);
    if (resid_match?.length && filename_match?.length) {
      if (brief_match?.length) prompt = brief_match[1];
      if (summary_match?.length) content = summary_match[1];
      resid = resid_match[1];
      filename = filename_match[1];
      let match;
      while ((match = title_reg.exec(elem.data))) {
        if (!title) {
          title = match[1];
        } else {
          preview.push(match[1]);
        }
      }
    }
  } else {
    try {
      const json = typeof elem.data === 'object' ? elem.data : JSON.parse(elem.data);
      if (json.app === 'com.tencent.multimsg') {
        resid = json.meta.detail.resid;
        filename = json.meta.detail.uniseq;
        title = json.meta.detail.source;
        content = json.meta.detail.summary;
        preview = json.meta.detail.news.map((val) => val.text);
        prompt = json.prompt;
      }
    } catch (e) {}
  }
  if (!resid?.length) return null;
  return {
    type: 'multimsg',
    resid,
    filename,
    title,
    content,
    preview,
    prompt,
  };
}

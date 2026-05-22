import { unzipSync } from 'zlib';
import pb from './protobuf/index.js';

export const FACE_OLD_BUF = Buffer.from([0x00, 0x01, 0x00, 0x04, 0x52, 0xcc, 0xf5, 0xd0]);

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

export const facemap = {
  0: { text: '/惊讶' },
  1: { text: '/撇嘴' },
  2: { text: '/色' },
  3: { text: '/发呆' },
  4: { text: '/得意' },
  5: { text: '/流泪', stickerId: '16', stickerType: 1 },
  6: { text: '/害羞' },
  7: { text: '/闭嘴' },
  8: { text: '/睡' },
  9: { text: '/大哭' },
  10: { text: '/尴尬' },
  11: { text: '/发怒' },
  12: { text: '/调皮' },
  13: { text: '/呲牙' },
  14: { text: '/微笑' },
  15: { text: '/难过' },
  16: { text: '/酷' },
  18: { text: '/抓狂' },
  19: { text: '/吐' },
  20: { text: '/偷笑' },
  21: { text: '/可爱' },
  22: { text: '/白眼' },
  23: { text: '/傲慢' },
  24: { text: '/饥饿' },
  25: { text: '/困' },
  26: { text: '/惊恐' },
  27: { text: '/流汗' },
  28: { text: '/憨笑' },
  29: { text: '/悠闲' },
  30: { text: '/奋斗' },
  31: { text: '/咒骂' },
  32: { text: '/疑问' },
  33: { text: '/嘘' },
  34: { text: '/晕' },
  35: { text: '/折磨' },
  36: { text: '/衰' },
  37: { text: '/骷髅' },
  38: { text: '/敲打' },
  39: { text: '/再见' },
  41: { text: '/发抖' },
  42: { text: '/爱情' },
  43: { text: '/跳跳' },
  46: { text: '/猪头' },
  49: { text: '/拥抱' },
  53: { text: '/蛋糕', stickerId: '17', stickerType: 1 },
  55: { text: '/炸弹' },
  56: { text: '/刀' },
  59: { text: '/便便' },
  60: { text: '/咖啡' },
  63: { text: '/玫瑰' },
  64: { text: '/凋谢' },
  66: { text: '/爱心' },
  67: { text: '/心碎' },
  74: { text: '/太阳', stickerId: '35', stickerType: 1 },
  75: { text: '/月亮', stickerId: '36', stickerType: 1 },
  76: { text: '/赞' },
  77: { text: '/踩' },
  78: { text: '/握手' },
  79: { text: '/胜利' },
  85: { text: '/飞吻' },
  86: { text: '/怄火' },
  89: { text: '/西瓜' },
  96: { text: '/冷汗' },
  97: { text: '/擦汗' },
  98: { text: '/抠鼻' },
  99: { text: '/鼓掌' },
  100: { text: '/糗大了' },
  101: { text: '/坏笑' },
  102: { text: '/左哼哼' },
  103: { text: '/右哼哼' },
  104: { text: '/哈欠' },
  105: { text: '/鄙视' },
  106: { text: '/委屈' },
  107: { text: '/快哭了' },
  108: { text: '/阴险' },
  109: { text: '/左亲亲' },
  110: { text: '/吓' },
  111: { text: '/可怜' },
  112: { text: '/菜刀' },
  114: { text: '/篮球', stickerId: '13', stickerType: 2 },
  116: { text: '/示爱' },
  118: { text: '/抱拳' },
  119: { text: '/勾引' },
  120: { text: '/拳头' },
  121: { text: '/差劲' },
  122: { text: '/爱你' },
  123: { text: '/NO' },
  124: { text: '/OK' },
  125: { text: '/转圈' },
  129: { text: '/挥手' },
  137: { text: '/鞭炮', stickerId: '18', stickerType: 1 },
  144: { text: '/喝彩' },
  146: { text: '/爆筋' },
  147: { text: '/棒棒糖' },
  148: { text: '/喝奶' },
  169: { text: '/手枪' },
  171: { text: '/茶' },
  172: { text: '/眨眼睛' },
  173: { text: '/泪奔' },
  174: { text: '/无奈' },
  175: { text: '/卖萌' },
  176: { text: '/小纠结' },
  177: { text: '/喷血' },
  178: { text: '/斜眼笑' },
  179: { text: '/doge' },
  180: { text: '/惊喜' },
  181: { text: '/戳一戳', stickerId: '37', stickerType: 1 },
  182: { text: '/笑哭' },
  183: { text: '/我最美' },
  185: { text: '/羊驼' },
  187: { text: '/幽灵' },
  193: { text: '/大笑' },
  194: { text: '/不开心' },
  198: { text: '/呃' },
  200: { text: '/求求' },
  201: { text: '/点赞' },
  202: { text: '/无聊' },
  203: { text: '/托脸' },
  204: { text: '/吃' },
  206: { text: '/害怕' },
  210: { text: '/飙泪' },
  211: { text: '/我不看' },
  212: { text: '/托腮' },
  214: { text: '/啵啵' },
  215: { text: '/糊脸' },
  216: { text: '/拍头' },
  217: { text: '/扯一扯' },
  218: { text: '/舔一舔' },
  219: { text: '/蹭一蹭' },
  221: { text: '/顶呱呱' },
  222: { text: '/抱抱' },
  223: { text: '/暴击' },
  224: { text: '/开枪' },
  225: { text: '/撩一撩' },
  226: { text: '/拍桌' },
  227: { text: '/拍手' },
  229: { text: '/干杯' },
  230: { text: '/嘲讽' },
  231: { text: '/哼' },
  232: { text: '/佛系' },
  233: { text: '/掐一掐' },
  235: { text: '/颤抖' },
  237: { text: '/偷看' },
  238: { text: '/扇脸' },
  239: { text: '/原谅' },
  240: { text: '/喷脸' },
  241: { text: '/生日快乐' },
  243: { text: '/甩头' },
  244: { text: '/扔狗' },
  262: { text: '/脑阔疼' },
  263: { text: '/沧桑' },
  264: { text: '/捂脸' },
  265: { text: '/辣眼睛' },
  266: { text: '/哦哟' },
  267: { text: '/头秃' },
  268: { text: '/问号脸' },
  269: { text: '/暗中观察' },
  270: { text: '/emm' },
  271: { text: '/吃瓜' },
  272: { text: '/呵呵哒' },
  273: { text: '/我酸了' },
  277: { text: '/汪汪' },
  278: { text: '/汗' },
  281: { text: '/无眼笑' },
  282: { text: '/敬礼' },
  283: { text: '/狂笑' },
  284: { text: '/面无表情' },
  285: { text: '/摸鱼' },
  286: { text: '/魔鬼笑' },
  287: { text: '/哦' },
  288: { text: '/请' },
  289: { text: '/睁眼' },
  290: { text: '/敲开心' },
  292: { text: '/让我康康' },
  293: { text: '/摸锦鲤' },
  294: { text: '/期待' },
  295: { text: '/拿到红包' },
  297: { text: '/拜谢' },
  298: { text: '/元宝' },
  299: { text: '/牛啊' },
  300: { text: '/胖三斤' },
  301: { text: '/好闪' },
  302: { text: '/左拜年' },
  303: { text: '/右拜年' },
  305: { text: '/右亲亲' },
  306: { text: '/牛气冲天' },
  307: { text: '/喵喵' },
  311: { text: '/打call', stickerId: '1', stickerType: 1 },
  312: { text: '/变形', stickerId: '2', stickerType: 1 },
  314: { text: '/仔细分析', stickerId: '4', stickerType: 1 },
  317: { text: '/菜汪', stickerId: '7', stickerType: 1 },
  318: { text: '/崇拜', stickerId: '8', stickerType: 1 },
  319: { text: '/比心', stickerId: '9', stickerType: 1 },
  320: { text: '/庆祝', stickerId: '10', stickerType: 1 },
  322: { text: '/拒绝' },
  323: { text: '/嫌弃' },
  324: { text: '/吃糖', stickerId: '12', stickerType: 1 },
  325: { text: '/惊吓', stickerId: '14', stickerType: 1 },
  326: { text: '/生气', stickerId: '15', stickerType: 1 },
  332: { text: '/举牌牌' },
  333: { text: '/烟花', stickerId: '19', stickerType: 1 },
  334: { text: '/虎虎生威' },
  336: { text: '/豹富' },
  337: { text: '/花朵脸', stickerId: '22', stickerType: 1 },
  338: { text: '/我想开了', stickerId: '20', stickerType: 1 },
  339: { text: '/舔屏', stickerId: '21', stickerType: 1 },
  341: { text: '/打招呼', stickerId: '24', stickerType: 1 },
  342: { text: '/酸Q', stickerId: '26', stickerType: 1 },
  343: { text: '/我方了', stickerId: '27', stickerType: 1 },
  344: { text: '/大怨种', stickerId: '28', stickerType: 1 },
  345: { text: '/红包多多', stickerId: '29', stickerType: 1 },
  346: { text: '/你真棒棒', stickerId: '25', stickerType: 1 },
  347: { text: '/大展宏兔' },
  348: { text: '/福萝卜' },
  349: { text: '/坚强', stickerId: '32', stickerType: 1 },
  350: { text: '/贴贴', stickerId: '31', stickerType: 1 },
  351: { text: '/敲敲', stickerId: '30', stickerType: 1 },
  352: { text: '/咦' },
  353: { text: '/拜托' },
  354: { text: '/尊嘟假嘟' },
  355: { text: '/耶' },
  356: { text: '/666' },
  357: { text: '/裂开' },
  358: { text: '/骰子', stickerId: '33', stickerType: 2 },
  359: { text: '/包剪锤', stickerId: '34', stickerType: 2 },
  392: { text: '/龙年快乐', stickerId: '38', stickerType: 3 },
  393: { text: '/新年中龙', stickerId: '39', stickerType: 3 },
  394: { text: '/新年大龙', stickerId: '40', stickerType: 3 },
  395: { text: '/略略略', stickerId: '41', stickerType: 1 },
};

/** 戳一戳字典 */
export const pokemap = {
  0: '回戳',
  1: '戳一戳',
  2: '比心',
  3: '点赞',
  4: '心碎',
  5: '666',
  6: '放大招',
  2000: '敲门',
  2001: '抓一下',
  2002: '碎屏',
  2003: '勾引',
  2004: '手雷',
  2005: '结印',
  2006: '召唤术',
  2007: '玫瑰花',
  2009: '让你皮',
  2011: '宝贝球',
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

function buildImageFileParam(md5, sha1, size, width, height, type) {
  size = size || 0;
  width = width || 0;
  height = height || 0;
  const ext = EXT[type] || 'jpg';
  return md5 + size + '-' + width + '-' + height + '.' + ext;
}

/** 解析消息 */
export function parse(client, rich, uin) {
  return new Parser(client, rich, uin);
}

/** 消息解析器 */
export class Parser {
  constructor(client, rich, uin) {
    this.client = Bot[client]?.sig || {};
    this.uin = uin;
    this.message = [];
    this.brief = '';
    this.content = '';
    this.atme = false;
    this.atall = false;
    this.newImg = false;
    this.imgprefix = {};
    this.exclusive = false;
    try {
      if (Array.isArray(rich)) {
        this.parseElems(rich);
      } else {
        if (rich[4] && rich[4].length) this.parseExclusiveElem(0, rich[4]);
        this.parseElems(Array.isArray(rich[2]) ? rich[2] : [rich[2]]);
      }
    } catch (e) {
      console.error(e);
    }
  }

  /** 获取下一个节点的文本 */
  getNextText() {
    try {
      const elem = this.it?.next().value[1][1];
      return String(elem[1]);
    } catch {
      return '[未知]';
    }
  }

  /** 解析: xml, json, ptt, video, flash, file, shake, poke */
  parseExclusiveElem(type, proto) {
    let elem;
    let brief;
    switch (type) {
      case 12: //xml
      case 51: //json
        const buf = proto[1].toBuffer();
        elem = {
          type: type === 12 ? 'xml' : 'json',
          data: String(buf[0] > 0 ? unzipSync(buf.slice(1)) : buf.slice(1)),
          id: proto[2],
        };
        brief = elem.type + '消息';
        const multimsg_elem = parseMultimsg(elem);
        if (multimsg_elem) {
          elem = multimsg_elem;
          this.content = `{multimsg:${elem.resid}}`;
          brief = elem.prompt || '聊天记录';
        } else {
          brief = elem.type + '消息';
          this.content = elem.data;
          try {
            const json = typeof elem.data === 'object' ? elem.data : JSON.parse(elem.data);
            brief = json.prompt || brief;
          } catch {}
        }
        break;
      case 3: //flash
        elem = this.parseNewImgElem(0, proto, 'flash');
        brief = '闪照';
        this.content = `{flash:${elem.file.toLowerCase()}}`;
        break;
      case 0: //ptt
        elem = {
          type: 'record',
          file: 'protobuf://' + proto.toBase64(),
          url: '',
          md5: proto[4].toHex(),
          size: proto[6] || 0,
          seconds: proto[19] || 0,
        };
        if (proto[20]) {
          const url = String(proto[20]);
          elem.url = url.startsWith('http') ? url : 'https://grouptalk.c2c.qq.com' + url;
        }
        brief = '语音';
        this.content = `{ptt:${elem.url || elem.md5}}`;
        break;
      case 19: //video
        elem = {
          type: 'video',
          file: 'protobuf://' + proto.toBase64(),
          name: proto[3]?.toString() || '',
          fid: String(proto[1]),
          md5: proto[2].toBase64(),
          size: proto[6] || 0,
          seconds: proto[5] || 0,
        };
        brief = '视频';
        this.content = `{video:${elem.fid}}`;
        break;
      case 5: //transElem
        const trans = pb.decode(proto[2].toBuffer().slice(3))[7][2];
        elem = {
          type: 'file',
          name: String(trans[4]),
          fid: String(trans[2]).replace('/', ''),
          md5: String(trans[8]),
          size: trans[3],
          duration: trans[5],
        };
        brief = '群文件';
        this.content = `{file:${elem.fid}}`;
        break;
      case 37: //sticker
        elem = {
          type: 'face',
          id: proto[2][3],
          text: proto[2][7] ? String(proto[2][7]) : '超级表情',
          big: true,
        };
        if (!elem.text) elem.text = proto[2][7] ? String(proto[2][7]) : '超级表情';
        if (proto[2][2]) {
          elem.stickerId = String(proto[2][2]);
          elem.stickerType = proto[2][5];
        }
        brief = elem.text;
        this.content = `{face:${elem.id},text:${elem.text}}`;
        break;
      case 126: //poke
        if (!proto[3]) return;
        const pokeid = proto[3] === 126 ? proto[2][4] : proto[3];
        elem = {
          type: 'poke',
          id: pokeid,
          text: pokemap[pokeid],
        };
        brief = pokemap[pokeid];
        this.content = `{poke:${elem.id}}`;
        break;
      case 48: {
        const businessType = proto[3];
        switch (businessType) {
          case 11:
          case 14:
          case 21:
          case 24: {
            let ntv2Files = proto[2][1];
            if (!Array.isArray(ntv2Files)) ntv2Files = [ntv2Files];
            const file = ntv2Files.find((file) => file[1][6] !== 100);
            elem = {
              ...(businessType % 10 === 1 ? { type: 'video' } : { type: 'bubble' }),
              file: 'protobuf://' + proto.toBase64(),
              fid: file[1][2]?.toString(),
              md5: file[1][1][2]?.toString(),
              sha1: file[1][1][3]?.toString(),
              size: file[1][1][1],
              seconds: file[1][1][8],
              nt: true,
            };
            brief = businessType % 10 === 1 ? '视频' : '泡泡消息';
            this.content = `${elem.type}:${elem.fid}}`;
            break;
          }
          case 12:
          case 22: {
            const file = proto[2][1][1];
            elem = {
              type: 'record',
              file: 'protobuf://' + proto.toBase64(),
              url: '',
              fid: file[2]?.toString(),
              md5: file[1][2]?.toString(),
              sha1: file[1][3]?.toString(),
              size: file[1][1],
              seconds: file[1][8],
              nt: true,
            };
            brief = '语音';
            this.content = `{ptt:${elem.file}}`;
            break;
          }
          default:
            return;
        }
        break;
      }
      default:
        return;
    }
    this.message.push(elem);
    this.brief = brief.substring(0, 1) === '[' ? brief : '[' + brief + ']';
    this.exclusive = true;
  }

  /** 解析: text, at, face, bface, sface, image, mirai */
  parsePartialElem(type, proto) {
    let elem;
    let brief = '';
    let content = '';
    switch (type) {
      case 1: //text&at
        brief = String(proto[1]);
        const buf = proto[3]?.toBuffer();
        if (buf && buf[1] === 1) {
          elem = {
            type: 'at',
            qq: 0,
            text: brief,
          };
          if (buf[6] === 1) {
            elem.qq = 'all';
            this.atall = true;
          } else {
            elem.qq = buf.readUInt32BE(7);
            if (elem.qq === this.uin) this.atme = true;
          }
          brief = brief || '@' + elem.qq;
          content = `{at:${elem.qq}}`;
        } else {
          if (!brief) return;
          content = brief;
          elem = {
            type: 'text',
            text: brief,
          };
        }
        break;
      case 2: //face
        elem = {
          type: 'face',
          id: proto[1],
          text: facemap[proto[1]]?.text || '表情',
        };
        brief = `[${elem.text}]`;
        content = `{face:${elem.id}}`;
        break;
      case 33: //face(id>255)
        elem = {
          type: 'face',
          id: proto[1],
          text: proto[2]?.toString() || '/' + proto[1],
        };
        brief = `[${elem.text}]`;
        content = `{face:${elem.id}}`;
        break;
      case 6: //bface
        brief = this.getNextText();
        if (brief.includes('骰子') || brief.includes('猜拳')) {
          elem = {
            type: brief.includes('骰子') ? 'dice' : 'rps',
            id: proto[12].toBuffer()[16] - 0x30 + 1,
          };
          content = `{${elem.type}:${elem.id}}`;
        } else {
          elem = {
            type: 'bface',
            file: proto[4].toHex() + proto[7].toHex() + proto[5],
            text: brief.replace(/[[\]]/g, ''),
          };
          content = `{bface:${elem.text}}`;
        }
        break;
      case 4:
      case 8:
        if (this.newImg) return;
        elem = this.parseImgElem(type, proto, 'image');
        brief = (elem.asface ? '[动画表情]' : '[图片]') + (elem.summary || '');
        content = `{image:${elem.file.toLowerCase()}}`;
        break;
      case 31: //mirai
        if (proto[3] === 103904510) {
          elem = {
            type: 'mirai',
            data: String(proto[2]),
          };
        } else {
          return;
        }
        break;
      case 34: //sface
        brief = this.getNextText();
        elem = {
          type: 'sface',
          id: proto[1],
          text: brief.replace(/[[\]]/g, ''),
        };
        content = `{sface:${elem.id}}`;
        break;
      case 37:
        if (proto[6] == 2) {
          elem = {
            type: 'long_msg',
            resid: proto[7]?.toString(),
          };
          break;
        }
        return;
      case 45:
        proto = proto[2];
        elem = {
          type: 'markdown',
          content: proto[1]?.toString(),
          ...(proto[2]
            ? {
                config: {
                  unknown: proto[2][1] || 1,
                  time: proto[2][2] || 0,
                  token: proto[2][3]?.toHex() || '',
                },
              }
            : {}),
        };
        brief = '[markdown消息]';
        content = brief;
        break;
      case 46:
        proto = proto[2];
        try {
          const rows = Array.isArray(proto[1][1]) ? proto[1][1] : [proto[1][1]];
          elem = {
            type: 'button',
            content: {
              appid: Number(proto[1][2]) || 0,
              rows: rows.map((row) => {
                row = Array.isArray(row[1]) ? row[1] : [row[1]];
                const buttons = [];
                for (let val of row) {
                  const button = {
                    id: '',
                    render_data: {},
                    action: {
                      permission: {},
                    },
                  };
                  if (val[1]) button.id = val[1]?.toString();
                  if (val[2]) {
                    button.render_data.label = val[2][1]?.toString();
                    button.render_data.visited_label = val[2][2]?.toString();
                    button.render_data.style = Number(val[2][3]) || 0;
                  }
                  if (val[3]) {
                    button.action.type = Number(val[3][1]) || 0;
                    button.action.unsupport_tips = val[3][4]?.toString();
                    button.action.data = val[3][5]?.toString();
                    button.action.reply = val[3][7] === 1;
                    button.action.enter = val[3][8] === 1;
                    if (val[3][2]) {
                      button.action.permission.type = Number(val[3][2][1]) || 0;
                      button.action.permission.specify_role_ids = val[3][2][2] || [];
                      button.action.permission.specify_user_ids = val[3][2][3] || [];
                    }
                  }
                  buttons.push(button);
                }
                return { buttons };
              }),
            },
          };
          brief = '[button消息]';
          content = brief;
        } catch {
          return;
        }
        break;
      case 48:
        const businessType = proto[3];
        switch (businessType) {
          case 10:
          case 20:
            elem = this.parseNewImgElem(businessType, proto[2], 'image');
            if (!elem) return;
            brief = (elem.asface ? '[动画表情]' : '[图片]') + (elem.summary || '');
            content = `{image:${elem.file.toLowerCase()}}`;
            break;
          default:
            return;
        }
        break;
      case 500:
        /*proto = proto[2]
                elem = {
                    type: 'forum',
                    id: String(proto[44][3]),
                    create_time: Math.floor(proto[44][5] / 1000)
                }
                brief = '[频道帖子]'
                content = `{forum:${elem.id}}`
                break;*/
        return;
      default:
        return;
    }
    // 删除回复中多余的AT元素
    if (this.message.length === 2 && elem.type === 'at' && this.message[0]?.type === 'at' && this.message[1]?.type === 'text') {
      if (this.message[0].qq === elem.qq && this.message[1].text === ' ') {
        this.message.splice(0, 2);
        this.brief = '';
      }
    }
    this.brief += brief;
    this.content += content;
    if (!Array.isArray(this.message)) this.message = [];
    const prev = this.message[this.message.length - 1];
    if (elem.type === 'text' && prev?.type === 'text') prev.text += elem.text;
    else this.message.push(elem);
  }

  parseElems(arr) {
    this.it = arr.entries();
    while (true) {
      try {
        let wrapper = this.it.next().value?.[1];
        if (!wrapper) break;
        const type = Number(Object.keys(Reflect.getPrototypeOf(wrapper))[0]);
        const proto = wrapper[type];
        if (type === 16) {
          //extraInfo
          this.extra = proto;
        } else if (type === 21) {
          //anonGroupMsg
          this.anon = proto;
        } else if (type === 45) {
          //sourceMsg
          this.quotation = proto;
        } else if (!this.exclusive) {
          switch (type) {
            case 1: //text
            case 2: //face
            case 4: //notOnlineImage
            case 6: //bface
            case 8: //customFace
            case 31: //mirai
            case 34: //sface
              this.parsePartialElem(type, proto);
              break;
            case 5: //transElem
            case 12: //xml
            case 19: //video
            case 51: //json
              this.parseExclusiveElem(type, proto);
              break;
            case 53: //commonElem
              if (proto[1] === 3) {
                //flash
                this.parseExclusiveElem(3, proto[2][1] ? proto[2][1] : proto[2][2]);
              } else if (proto[1] === 33) {
                //face(id>255)
                this.parsePartialElem(33, proto[2]);
              } else if (proto[1] === 2) {
                //poke
                this.parseExclusiveElem(126, proto);
              } else if (proto[1] === 37) {
                //qlottie
                this.parseExclusiveElem(37, proto);
              } else if (proto[1] === 20) {
                //json
                this.parseExclusiveElem(51, proto[2]);
              } else if ([45, 46, 48, 500].includes(proto[1])) {
                this.parseExclusiveElem(proto[1], proto);
                if (!this.exclusive) this.parsePartialElem(proto[1], proto);
              }
              break;
            default:
              break;
          }
        }
        if (type === 37) this.parsePartialElem(type, proto);
      } catch (err) {
        console.error(err);
      }
    }
  }

  parseNewImgElem(businessType, proto, type) {
    try {
      let elem = {
        type,
        file: proto[1][1][1][4]?.toString(), //"protobuf://" + proto.toBase64(),
        name: proto[1][1][1][4]?.toString(),
        url: '',
        fid: proto[1][1][2]?.toString(),
        md5: proto[1][1][1][2]?.toString(),
        sha1: proto[1][1][1][3]?.toString(),
        height: proto[1][1][1][7],
        width: proto[1][1][1][6],
        size: proto[1][1][1][1],
        summary: proto[2][1]?.[2]?.toString(),
        nt: true,
      };
      if (type === 'image') elem.asface = (proto[2][1]?.[1] || 0) > 0;
      elem.file = buildImageFileParam(elem.md5, elem.sha1, elem.size, elem.width, elem.height, proto[1][1][1][5][2]);
      const rkey = this.client?.rkey_info?.[businessType]?.rkey;
      if (rkey?.length) {
        this.newImg = true;
        elem.url = `https://${proto[1][2][3]}${proto[1][2][1]}${rkey}${proto[1][2][2][1] || '&spec=0'}`;
      } else if (elem.md5) {
        elem.url = `https://${proto[1][2][3]}${proto[1][2][1]}`;
        this.imgprefix[elem.md5] = elem;
      }
      return elem;
    } catch {
      if (type === 'flash') return this.parseImgElem(0, proto, type);
    }
  }

  parseImgElem(source_type, proto, type) {
    let elem;
    let dm = type === 'flash' ? (proto[1] ? true : false) : source_type === 8 ? false : true;
    let md5 = proto[dm ? 7 : 13].toHex();
    let path = (proto[dm ? 29 : 34]?.[30] || '').toString();
    const rkey = this.client?.rkey_info?.[dm ? 10 : 20]?.rkey;
    if (this.imgprefix[md5] && path?.length) {
      const origin = this.imgprefix[md5].url?.length ? new URL(this.imgprefix[md5].url).origin : '';
      elem = {
        ...this.imgprefix[md5],
        type,
        url: rkey ? `${this.imgprefix[md5].url}${rkey}&spec=0` : `${path.startsWith('/') ? `${origin}${path}` : `${this.imgprefix[md5].url}${path}`}&spec=0`,
      };
      return elem;
    } else {
      elem = {
        type,
        file: '',
        name: '',
        url: '',
        md5: md5,
        height: proto[dm ? 8 : 23],
        width: proto[dm ? 9 : 22],
        size: proto[dm ? 2 : 25],
        summary: proto[dm ? 29 : 34]?.[dm ? 8 : 9]?.toString(),
      };
      elem.file = buildImageFileParam(elem.md5, elem.sha1, elem.size, elem.width, elem.height, proto[dm ? 5 : 20]);
      elem.name = elem.file;
    }
    if (type === 'image') elem.asface = proto[dm ? 29 : 34]?.[1] === 1;
    if (!elem.url) {
      if (path && path.includes('fileid')) {
        elem.url = `https://c2cpicdw.qpic.cn${path}&spec=0`;
      } else if (proto[16] && String(proto[16]).startsWith('/')) {
        elem.url = `https://gchat.qpic.cn${proto[16]}`;
      } else if (proto[15] && String(proto[15]).startsWith('/')) {
        elem.url = `https://c2cpicdw.qpic.cn${proto[15]}`;
      } else {
        elem.url = getGroupImageUrl(md5);
      }
    }
    return elem;
  }
}

export function getGroupImageUrl(md5) {
  return `https://gchat.qpic.cn/gchatpic_new/0/0-0-${md5.toUpperCase()}/0`;
}

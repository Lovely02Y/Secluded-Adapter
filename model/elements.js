export const ChainElemTypes = ['flash_msg', 'quote', 'node', 'text', 'face', 'sface', 'bface', 'rps', 'dice', 'image', 'at', 'mirai', 'reply', 'markdown', 'button', 'json', 'bubble', 'xml', 'fake', 'location', 'poke', 'long_msg'];

/** 用于构造消息元素 */
export const segment = {
  flash_msg: (files, send = true, image, flash_name) =>({
    type: 'flash_msg',
    files,
    send,
    image,
    flash_name,
  }),

  long_msg(resid) {
    return {
      type: 'long_msg',
      resid,
    };
  },

  /** @deprecated 文本，建议直接使用字符串 */
  text(text) {
    return {
      type: 'text',
      text,
    };
  },

  /** 泡泡视频，支持http://,base64:// */
  bubble(file, data = {}) {
    return {
      type: 'bubble',
      file,
      ...data,
    };
  },

  /** 经典表情(id=0~324) */
  face(id, big = true) {
    return {
      type: 'face',
      id,
      big,
    };
  },

  /** 小表情(id规则不明) */
  sface(id, text) {
    return {
      type: 'sface',
      id,
      text,
    };
  },

  /** 原创表情(file规则不明) */
  bface(file, text) {
    return {
      type: 'bface',
      file,
      text,
    };
  },

  /** 猜拳(id=1~3) */
  rps(id) {
    return {
      type: 'rps',
      id,
    };
  },

  /** 骰子(id=1~6) */
  dice(id) {
    return {
      type: 'dice',
      id,
    };
  },

  /** mention@提及
   * @param qq 全体成员:"all", 频道:tiny_id
   */
  at(qq, text, dummy) {
    if (typeof qq === 'number' || qq === 'all') {
      return {
        type: 'at',
        qq,
        text,
        dummy,
      };
    }
    // 频道中的AT
    return {
      type: 'at',
      qq: 0,
      id: String(qq),
      text,
      dummy,
    };
  },

  /** 图片，支持http://,base64:// */
  image(file, cache, timeout, headers) {
    return {
      type: 'image',
      file,
      cache,
      timeout,
      headers,
    };
  },

  /** 闪照，支持http://,base64:// */
  flash(file, cache, timeout, headers) {
    return {
      type: 'flash',
      file,
      cache,
      timeout,
      headers,
    };
  },

  /** 语音，支持http://,base64:// */
  record(file, data = {}) {
    return {
      type: 'record',
      file,
      ...data,
    };
  },

  /** 视频，支持http://,base64:// */
  video(file, data = {}) {
    return {
      type: 'video',
      file,
      ...data,
    };
  },

  json(data) {
    return {
      type: 'json',
      data,
    };
  },

  xml(data, id = 35) {
    return {
      type: 'xml',
      data,
      id,
    };
  },

  markdown(content, config) {
    return {
      type: 'markdown',
      content,
      config,
    };
  },

  button(content) {
    return {
      type: 'button',
      content,
    };
  },

  /** 一种特殊消息(官方客户端无法解析) */
  mirai(data) {
    return {
      type: 'mirai',
      data,
    };
  },

  /** 音乐 - 不支持
  async music(id, platform = "qq") {
    const musiInfo = await musicFactory[platform].getMusicInfo(id);
    musiInfo.jumpUrl = `https://ptlogin2.qq.com@${musiInfo.jumpUrl.replace(/https?:\/\//, "")}`;
    return this.json(makeMusicJson({ ...musiInfo, platform }));
  },
  */

  fake(user_id, message, nickname, time) {
    return { type: 'node', user_id, nickname, message, time };
  },

  /** 链接分享 */
  share(url, title, image, content) {
    return {
      type: 'share',
      url,
      title,
      image,
      content,
    };
  },

  /** 位置分享 */
  location(lat, lng, address, id) {
    return {
      type: 'location',
      lat,
      lng,
      address,
      id,
    };
  },

  /** id 0~6 */
  poke(id) {
    return {
      type: 'poke',
      id,
    };
  },

  /** @deprecated 将CQ码转换为消息链 */
  fromCqcode(str) {
    const elems = [];
    const res = str.matchAll(/\[CQ:[^\]]+\]/g);
    let prev_index = 0;

    for (const v of res) {
      const text = str.slice(prev_index, v.index).replace(/&#91;|&#93;|&amp;/g, unescapeCQ);
      if (text) elems.push({ type: 'text', text });

      const element = v[0];
      let cq = element.replace('[CQ:', 'type=');
      cq = cq.substring(0, cq.length - 1);
      elems.push(qs(cq));
      prev_index = v.index + element.length;
    }

    if (prev_index < str.length) {
      const text = str.slice(prev_index).replace(/&#91;|&#93;|&amp;/g, unescapeCQ);
      if (text) elems.push({ type: 'text', text });
    }

    return elems;
  },
};

function unescapeCQ(s) {
  if (s === '&#91;') return '[';
  if (s === '&#93;') return ']';
  if (s === '&amp;') return '&';
  return '';
}

function unescapeCQInside(s) {
  if (s === '&#44;') return ',';
  if (s === '&#91;') return '[';
  if (s === '&#93;') return ']';
  if (s === '&amp;') return '&';
  return '';
}

function qs(s, sep = ',', equal = '=') {
  const ret = {};
  const split = s.split(sep);

  for (const v of split) {
    const i = v.indexOf(equal);
    if (i === -1) continue;

    ret[v.substring(0, i)] = v.substring(i + 1).replace(/&#44;|&#91;|&#93;|&amp;/g, unescapeCQInside);
  }

  for (const k in ret) {
    try {
      if (k !== 'text') ret[k] = JSON.parse(ret[k]);
    } catch {}
  }

  return ret;
}

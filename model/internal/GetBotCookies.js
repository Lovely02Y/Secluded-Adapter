import axios from 'axios';
import https from 'https';

const featuredLinks = [
  { url: 'https://h5.qzone.qq.com/mqzone/index', ym: 'qzone.qq.com' },
  { url: 'https://qun.qq.com/', ym: 'qun.qq.com' },
  { url: 'https://mail.qq.com/cgi-bin/loginpage', ym: 'mail.qq.com' },
  { url: 'https://ti.qq.com/', ym: 'ti.qq.com' },
  //  { url: "https://docs.qq.com", ym: "docs.qq.com" },
  { url: 'https://www.weiyun.com', ym: 'weiyun.com' },
  { url: 'https://connect.qq.com', ym: 'connect.qq.com' },
  { url: 'https://id.qq.com', ym: 'id.qq.com' },
  { url: 'https://kg.qq.com', ym: 'kg.qq.com' },
  { url: 'https://now.qq.com', ym: 'now.qq.com' },
  { url: 'https://mqq.tenpay.com', ym: 'pay.qq.com' },
  //  { url: "https://qinfo.clt.qq.com", ym: "clt.qq.com" },
  //  { url: "https://q.qq.com", ym: "q.qq.com" },
  //  { url: "https://club.vip.qq.com/index", ym: "vip.qq.com" },
  //{ url: 'https://music.qq.com/', ym: 'y.qq.com' }
];

const axiosInstance = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false,
  }),
  headers: {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
    Referer: 'https://xui.ptlogin2.qq.com/',
  },
  maxRedirects: 0,
  timeout: 10000,
  validateStatus: function (status) {
    return status >= 200 && status < 400;
  },
});

export class Cookies {
  constructor(id, client_key) {
    if (!id) {
      throw new Error('必须传入id');
    }
    this.clientKey = client_key || Bot[id].sig.client_key_info.client_key;
    this.clientUin = id;
  }

  /**
   * 手动处理重定向链
   */
  async followRedirects(initialUrl) {
    let currentUrl = initialUrl;
    let finalCookies = [];
    let redirectCount = 0;
    const maxRedirects = 10;

    while (redirectCount < maxRedirects) {
      try {
        const response = await axiosInstance.get(currentUrl, {
          maxRedirects: 0,
          validateStatus: null,
        });

        if (response.headers['set-cookie']) {
          finalCookies = finalCookies.concat(response.headers['set-cookie']);
        }

        if (response.status >= 300 && response.status < 400 && response.headers.location) {
          currentUrl = response.headers.location;

          if (currentUrl.startsWith('/')) {
            const urlObj = new URL(initialUrl);
            currentUrl = `${urlObj.origin}${currentUrl}`;
          }

          redirectCount++;
          continue;
        }
        return {
          cookies: finalCookies,
          finalUrl: currentUrl,
          statusCode: response.status,
        };
      } catch (error) {}
    }
  }

  /**
   * 解析 cookie 字符串
   */
  parseCookies(cookieArray) {
    const cookies = {};

    cookieArray.forEach((cookieStr) => {
      const parts = cookieStr.split(';');
      if (parts.length > 0) {
        const [nameValue] = parts[0].split('=');
        const value = parts[0].substring(nameValue.length + 1);

        if (nameValue && value) {
          const name = nameValue.trim();
          cookies[name] = value.trim();
        }
      }
    });

    return cookies;
  }

  /**
   * 获取指定域名的cookies
   * @param {string} domain - 目标域名
   * @returns {Promise<Object>} 返回包含cookie信息的对象
   */
  async getDomainCookies(domain) {
    if (!domain) {
      return { code: -1 };
    }

    const domainConfig = featuredLinks.find((link) => link.ym === domain);
    if (!domainConfig) {
      return { code: -1 };
    }

    const newJumpUrl = `https://ssl.ptlogin2.qq.com/jump?keyindex=19&clientuin=${this.clientUin}&clientkey=${this.clientKey}&u1=${encodeURIComponent(domainConfig.url)}`;
    //const newJumpUrl = "https://ssl.ptlogin2.qq.com/jump?ptlang=1033&clientuin=" + this.clientUin + "&clientkey=" + this.clientKey + "&u1=https%3A%2F%2F" + domain + "%2F" + this.clientUin + "%2Finfocenter&keyindex=19%27";
    try {
      const redirectResult = await this.followRedirects(newJumpUrl);
      if (!redirectResult.cookies || redirectResult.cookies.length === 0) {
        Bot.makeLog('warn', `获取 [${domain}] Cookies 失败，将调用 Bot[${this.clientUin}].getCookies(${domain}, true) 函数执行强制刷新！`, this.clientUin);
        return { code: -1 };
      }
      const cookies = this.parseCookies(redirectResult.cookies);
      let uin = cookies.p_uin || '';
      if (uin.startsWith('o')) {
        uin = uin.substring(1);
      }

      let skey = cookies.skey || '';
      if (skey.startsWith('@')) {
        skey = skey.substring(1);
      }
      const result = {
        uin: uin || null,
        skey: skey || null,
        p_uin: cookies.p_uin || null,
        p_skey: cookies.p_skey || null,
        pt4_token: cookies.pt4_token || null,
        ptnick: uin ? cookies[`ptnick_${uin}`] || null : null,
        pt_recent_uins: cookies.pt_recent_uins || null,
        ptcz: cookies.ptcz || null,
        domain: domain,
        finalUrl: redirectResult.finalUrl,
        statusCode: redirectResult.statusCode,
      };
      return result;
    } catch (error) {
      Bot.makeLog('warn', `获取 [${domain}] Cookies 失败，将调用 Bot[${this.clientUin}].getCookies(${domain}, true) 函数执行强制刷新！`, this.clientUin);
      return { code: -1 };
    }
  }

  /**
   * 获取所有可用域名的cookies
   * @returns {Promise<Array>} 返回包含所有域名cookie信息的数组
   */
  async getAllCookies() {
    const results = [];

    for (const link of featuredLinks) {
      try {
        const cookies = await this.getDomainCookies(link.ym);
        results.push(cookies);
      } catch (error) {
        logger.error(`获取 ${link.ym} 的cookies失败:`, error.message);
        results.push({
          domain: link.ym,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * 获取支持的域名列表
   * @returns {Array} 返回支持的域名列表
   */
  static getSupportedDomains() {
    return featuredLinks.map((link) => link.ym);
  }
}

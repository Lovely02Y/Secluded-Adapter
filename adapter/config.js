import makeConfig from '../../../lib/plugins/config.js';

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
    enableRedBag: false,
    enableRedBagQQ: [],
    fastRedBag: false,
    hb_ip: 'api.s01s.cn',
    hb_port: 2017,
  },
  {
    tips: ['欢迎使用 TRSS-Yunzai Secluded Plugin ! 作者：Senior Horikawa', '参考：https://github.com/Lovely02Y/Secluded-Adapter'],
  }
);

export { config, configSave };

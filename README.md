<div align="center">

# TRSS-Yunzai Secluded Plugin
TRSS-Yunzai Secluded Bot 适配器插件

</div>

## 程序目录
[Secluded 主程序](./Secluded)

## 安装教程
1. 前置环境：部署 [TRSS-Yunzai](https://github.com/TimeRainStarSky/Yunzai)
2. 执行命令安装项目依赖
3. 重启云崽，自动生成配置文件
    [>>>点击查看适配器配置示例<<<](./help/sec适配器配置.png)
4. 启动sec程序，打开后台网页，点击左上角菜单，进入`软件设置`页面
    [>>>页面示例<<<](./help/sec配置.png)
5. 全部配置完成后重启云崽，提示连接成功即可
6. 机器人登录指令：`#sec设置1145141919`


## Tips
若无法正常接收机器人推送消息，请手动开启Secluded程序对应账号的调试模式，操作步骤如下：
1. 打开Secluded网页管理端
2. 登录需配置的目标账号
3. 进入【开关管理】页面
4. 找到并开启【调试模式】选项
5. 点击保存完成配置


Or

安装词库: [自动Debug词库.txt](./help/自动Debug词库.txt)
Linux词库放置路径: `/root/sec/lexicon/自动Debug词库.txt`
Windows同理: `c://..//sec//lexicon//自动Debug词库.txt`
Android直接打开Secluded网页导入词库

额外环境部署要求：
服务器必须提前安装ffmpeg工具，缺少该依赖将无法解析、处理语音消息；安装完成后需配置系统环境变量，确保全局可调用ffmpeg。

## Special Thanks

Secluded Plugin 离不开以下前辈项目及贡献者：
- [Secluded](https://github.com/MCSQNXA/Secluded) - Secluded
- [takayama-lily/oicq](https://github.com/takayama-lily/oicq) - QQ 协议最初的 JavaScript 实现
- [Yunzai](https://github.com/TimeRainStarSky/Yunzai) - Yunzai
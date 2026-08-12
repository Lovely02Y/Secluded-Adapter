<div align="center">

# TRSS‑Yunzai Secluded Plugin
TRSS‑Yunzai 的 Secluded Bot 适配器插件

</div>

## 📂 程序目录
[Secluded 主程序](./Secluded)

## 🚀 安装教程
1. 前置环境：部署 [TRSS‑Yunzai](https://github.com/TimeRainStarSky/Yunzai)
2. 执行命令安装项目依赖
3. 重启 Yunzai，会自动生成插件配置文件
    [>>>点击查看适配器配置示例<<<](./help/sec适配器配置.png)
4. 启动 Secluded 程序，打开后台网页，点击左上角菜单，进入 `软件设置` 页面
    [>>>页面示例<<<](./help/sec配置.png)
5. 全部配置完成后再次重启 Yunzai，出现连接成功提示即代表适配器正常工作
6. 机器人登录指令：`#sec设置1145141919`

## 💡 Tips
### 消息推送异常排查
如果机器人无法正常接收推送消息，请手动开启 Secluded 对应账号的**调试模式**：
1. 打开 Secluded 网页管理端
2. 登录目标配置账号
3. 进入【开关管理】页面
4. 找到并开启【调试模式】
5. 保存配置

> 备选方案：导入自动Debug词库
词库文件：[自动Debug词库.txt](./help/自动Debug词库.txt)

- Linux 放置路径：`/root/sec/lexicon/自动Debug词库.txt`
- Windows 放置路径：`C:\..\sec\lexicon\自动Debug词库.txt`
- Android：直接在 Secluded 网页端导入词库

### ⚠️ 重要依赖要求
服务器必须预先安装 **ffmpeg**，缺少该依赖将无法解析和处理语音消息。
安装完成后需要配置系统环境变量，保证全局可以调用 `ffmpeg` 命令。

## 🙏 Special Thanks
Secluded Plugin 离不开以下开源项目与贡献者：
- [Secluded](https://github.com/MCSQNXA/Secluded) - Secluded 本体
- [takayama‑lily/oicq](https://github.com/takayama‑lily/oicq) - QQ协议 JavaScript 原始实现
- [Yunzai](https://github.com/TimeRainStarSky/Yunzai) - TRSS‑Yunzai 主项目
- [Sec入门教程](http://150.138.92.196:24680/Secluded/main.md) - 欣怡XY(QQ 2540685263)

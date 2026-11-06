# 书桌（shuzhuo）

给文字工作者的 DSH 插件：把 Obsidian 里的资料库变成一个工作台。
看得见库的结构、查得到一个词会牵动哪些页、能把讨论直接拆成页面写进库。

## 一、准备两样东西

1. **一个 Obsidian 库**（一个装着 .md 的文件夹，随便哪个都行）。
2. **Whale Bridge**：Obsidian 里的一个插件，让 DSH 能读写你的库。
   装法：Obsidian 设置 → 第三方插件 → 关闭安全模式 → 浏览 → 搜「Whale Bridge」→ 安装并启用。
   装完在它的设置页里能看到端口和 token，填到下面第三步的配置里。
   书桌的「入库」功能靠它；没装也能用其余功能。

## 二、安装

1. 打开 DSH，左边栏点「插件」→「管理插件」（或直接在对话里让 AI 帮你装）。
2. 把这个插件包装进你的 profile：包里只有一个目录，装法和其他本地插件一样——
   `plugin_manager` 里 `install_bundle`，spec 填这个目录的路径。
3. 装完刷新页面（Ctrl+R）。左边栏会出现「书桌」图标。

## 三、配置（只做一次）

打开这个文件（没有就新建）：

```
C:\Users\<你的用户名>\.shuzhuo\config.json
```

把下面内容粘进去，改掉两个值：

```json
{
  "vault": "C:\\Users\\你\\Documents\\我的资料库",
  "stateDir": "C:\\Users\\你\\.shuzhuo\\state",
  "bridgePort": 9787,
  "bridgeToken": "你的bridge token"
}
```

| 字段 | 怎么填 |
| --- | --- |
| `vault` | 你的 Obsidian 库文件夹的**完整路径**。在文件资源管理器里点进那个文件夹，地址栏复制过来。 |
| `stateDir` | 草稿和待办存哪。填个空文件夹路径就行，插件会自己建。 |
| `bridgePort` | Whale Bridge 的端口，默认 9787，不用改。 |
| `bridgeToken` | Whale Bridge 里设的 token，要和 Obsidian 那边一致。 |

⚠️ Windows 路径里的 `\` 在 JSON 里要写成 `\\`，否则读不出来。

保存后刷新 DSH 页面。书桌左上角显示页数了，就是配好了。

也可以用环境变量代替这个文件：`SHUZHUO_VAULT`、`SHUZHUO_STATE`、`SHUZHUO_BRIDGE_PORT`、`SHUZHUO_BRIDGE_TOKEN`。

## 四、怎么用

- **概览**：库有多少页、哪些页被引得最多、最近改了什么。
- **牵连**：输入一个词（人名、地名、术语），看全库哪些页提到它、落在哪一节。上面的「图」是以它为中心的连线图。
- **页面**：点开任意一页，看正文、小节、有没有断链。
- **讨论**：左边写想法，右边写正文，点「谈完了，准备入库」，AI 帮你判断该放哪、拆成几页。
- **待办**：和资料库分开的写作待办。

## 五、常见问题

**面板一片空白 / 显示「未配置资料库」**
`config.json` 没找到或 `vault` 填错。确认文件在 `C:\Users\<你>\.shuzhuo\config.json`，路径用双反斜杠。

**点「入库」报 bridge-offline**
Obsidian 没开，或 Whale Bridge 插件没启用，或 `bridgePort`/`bridgeToken` 和 Obsidian 里不一致。先在 Obsidian 里打开那个库，再确认插件设置里的端口和 token。

**页数是 0**
`vault` 指到了库的上一层或下一层。正确路径是直接包含 `.md` 文件的那一层。

## 六、隐私

只读你自己的本地文件；除了 `127.0.0.1` 上的本地桥，不发任何网络请求。插件里不含任何人的数据，装上就是一个空工作台。

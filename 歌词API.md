接入 `Listen1 API` 和 `Meting-API` 的思路类似：先本地部署服务或引用库，再通过接口调用。为了方便你快速上手，我把它们的核心接入步骤整理成了一份操作指南。

### 📌 Listen1 API：直接在前/后端引用的JS库
`Listen1 API` 是一个JS库，主要用于前端或Node.js环境，整合了国内多个音乐平台的资源[reference:0]。

#### 1. 获取与安装
*   **下载代码**：克隆官方仓库并进入项目目录[reference:1][reference:2]。
    ```bash
    git clone https://github.com/listen1/listen1-api.git
    cd listen1-api
    ```
*   **安装依赖**：项目使用 `yarn` 进行包管理[reference:3][reference:4]。
    ```bash
    yarn install
    ```
*   **编译打包**：编译后，生成的两个核心文件 (`listen1-api.js` 和 `listen1-api.min.js`) 会存放在 `dist` 目录下[reference:5][reference:6]。
    ```bash
    yarn build
    ```

#### 2. 开始使用
你可以根据项目环境，用以下任一方式引入编译好的文件[reference:7][reference:8]。

*   **Node.js 环境**：
    ```javascript
    const listen1Api = require('./dist/listen1-api.min');
    ```
*   **浏览器环境**：
    ```html
    <script src="path/to/listen1-api.min.js"></script>
    <script>
        // 全局对象 listen1Api 可直接使用
    </script>
    ```

#### 3. API调用示例
*   **获取歌单**：以获取网易云音乐热门歌单为例，使用 `apiGet` 方法请求 `/show_playlist` 接口，并通过 `source` 参数指定平台[reference:9]。
    ```javascript
    const platform = 'netease';
    const url = '/show_playlist?source=' + platform;
    listen1Api.apiGet(url).then((data) => {
        console.log(data);
    });
    ```

*   **搜索歌曲**：通过 `/search` 接口，传递 `source`、`keywords`（关键词）和 `curpage`（页码）等参数进行搜索[reference:10]。

*   **获取歌词**：调用 `/lyric` 接口，并传入歌曲的 `track_id`，即可获取标准化的LRC格式歌词[reference:11]。

> **💡 一个小提示**：开发时推荐使用未压缩的 `listen1-api.js` 文件进行调试；生产环境则务必切换到 `.min.js` 版本以获得更好的性能[reference:12]。

---

### 🐳 Meting-API：基于Docker部署的API服务
`Meting-API` 是一个轻量级音乐信息API服务，核心是获取音乐播放链接、歌词等[reference:13]。官方推荐的部署方式是使用 **Docker**，最简单快捷[reference:14]。

#### 1. 快速部署
*   **拉取镜像**：从 Docker Hub 拉取官方镜像[reference:15][reference:16]。
    ```bash
    docker pull intemd/meting-api:latest
    ```
*   **运行容器**：创建并运行容器，将服务器的 `3000` 端口映射到容器的 `3000` 端口[reference:17]。
    ```bash
    docker run -d --name meting-api -p 3000:3000 intemd/meting-api:latest
    ```
    服务启动后，即可通过 `http://你的服务器IP:3000` 来访问你的 Meting-API 服务了。

#### 2. API调用示例
部署成功后，就可以通过HTTP请求来获取数据了。以下是几个核心端点的说明和示例[reference:18]。

| 功能 | 端点 | 必需参数 | 请求示例 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| **获取单曲信息** | `/song` | `id` | `/song?id=416892104&server=netease` | 获取指定歌曲的详细信息 |
| **获取歌词** | `/lrc` | `id` | `/lrc?id=416892104&server=netease` | 获取指定歌曲的LRC格式歌词[reference:19] |
| **获取播放链接** | `/url` | `id` | `/url?id=416892104&server=netease` | 获取指定歌曲的播放URL[reference:20] |
| **搜索歌曲** | `/search` | `keywords` | `/search?keywords=夜曲&server=netease` | 根据关键词搜索歌曲[reference:21] |

> **⚠️ 需要留意**：`server` 参数的有效值为 `netease` (网易云音乐) 和 `tencent` (QQ音乐)[reference:22]。

### 💎 总结
*   **如果你是前端/Node.js开发者**，希望快速将国内主流音乐平台整合进现有项目，`Listen1 API` 是一个很直接的JS库选择。
*   **如果你希望通过API服务形式获取音乐数据**，尤其熟悉Docker容器化部署，`Meting-API` 能够更灵活地集成到你的后端服务中。
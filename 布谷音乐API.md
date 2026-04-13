虽然没有找到“布谷音乐”官方公开的API文档，但经过深度搜索，在开源项目 **CoCo-Downloader** 的代码中发现了它使用的API接口。

### 📡 核心接口信息

#### 1. 搜索接口
*   **URL**: `https://a.buguyy.top/newapi/search.php`
*   **请求方法**: GET
*   **参数**: `keyword` (要搜索的歌曲名)
*   **请求头** (关键部分):
    ```http
    accept: application/json, text/plain, */*
    origin: https://buguyy.top
    referer: https://buguyy.top/
    user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36
    ```
*   **返回数据示例**:
    ```json
    {
      "data": {
        "list": [
          {
            "id": "歌曲ID",
            "title": "歌曲名",
            "singer": "歌手",
            "album": "专辑",
            "picurl": "封面图URL",
            "duration": "时长"
          }
        ]
      }
    }
    ```
    （以上信息源自对 [30†L30-L37] 的分析）

#### 2. 获取播放链接接口
*   **URL**: `https://a.buguyy.top/newapi/geturl2.php`
*   **请求方法**: GET
*   **参数**: `id` (从上一步搜索获得的歌曲ID)
*   **请求头**: 与搜索接口相同
*   **返回数据示例**:
    ```json
    {
      "data": {
        "url": "MP3文件的真实下载地址"
      }
    }
    ```
    （以上信息源自对 [30†L40-L45] 的分析）

### 🚀 如何使用

1.  **发送搜索请求**：向 `search.php` 接口发起GET请求，带上要搜索的`keyword`。
2.  **解析搜索结果**：从返回的JSON数据中提取歌曲信息，尤其是每首歌对应的`id`字段。
3.  **获取下载链接**：使用第2步得到的`id`，向 `geturl2.php` 接口发起GET请求，从返回的JSON中获取MP3文件的真实URL。
4.  **下载文件**：最后，直接请求上一步获取到的URL即可下载MP3文件。

### ⚠️ 重要提示
1.  **技术是探索，版权是底线**：此接口仅供技术学习与研究，严禁用于商业或侵权用途。在开发和测试时，请注意控制请求频率，避免对源网站服务器造成过大压力。
2.  **关注接口的时效性**：这类非公开的API接口地址或参数随时可能因网站更新而失效，建议定期关注 [CoCo-Downloader 项目](https://github.com/markcxx/coco-downloader) 的更新动态，参考其最新的适配方案。
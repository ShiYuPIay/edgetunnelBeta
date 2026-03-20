# **edgetunnelBeta 多功能 VLESS over WebSocket 部署指南**

[[中文](README.md) | [English](README_EN.md)]

本文档以中文为主，面向零基础小白，详细介绍如何在 Cloudflare Workers（或 Pages）上部署 **shiplay** 项目并快速生成支持 Clash Meta、Sing‑box、Surge、Quantumult X 等客户端的订阅链接。shiplay 在 [edgetunnel](https://github.com/zizifn/edgetunnel) 的基础上深度改写，实现了动态配置存储、WebUI 管理面板、Proxy IP 负载均衡、规则集自动更新、IP 纯净度检测等功能。

> **说明：** 如果你不知道什么是 VLESS，请简单理解它是 V2Ray 的一种无加密、轻量级协议，配合 WebSocket + TLS 可以很好地伪装流量。Cloudflare Workers 支持 WebSocket【806802050595069†L30-L40】功能，我们利用其实时通信能力来实现反向代理。

## 架构概览

```
客户端 (Clash / V2Ray / Surge / QuantX)
  │             ↑ 配置订阅
  │             │
  ├──>  shiplay Worker (Cloudflare边缘)
  │       ├─ 动态路由与负载均衡 (ProxyIP, 端口)
  │       ├─ WebSocket 接入层 (VLESS over WS + TLS)
  │       ├─ KV 存储 (配置、规则集)
  │       ├─ WebUI 管理面板 (/admin)
  │       ├─ 规则集自动更新 (blackmatrix7)
  │       ├─ IP 纯净度检测 (ip-api.com + Scamalytics)
  │       └─ Health Check + Cron
  │
  └──> 上游代理服务器 (VPS / 托管节点)
```

架构图说明：用户配置客户端指向 shiplay Worker，Worker 根据配置从多个代理 IP 中随机选择一个，通过 WebSocket 建立到上游节点的 VLESS 连接，处理传入传出流量。Worker 的所有核心参数（UUID、路径、端口、节点标语、伪装站点等）存储在 Cloudflare KV 中，可通过内置 WebUI 即时修改，无需重新部署。Worker 同时提供生成多种订阅格式的接口，根据客户端类型自动适配。

## 功能特点

- **VLESS + WebSocket + TLS**：支持 VLESS 协议，利用 Cloudflare 的 WebSocket API 保持长连接【806802050595069†L30-L40】。
- **WebUI 管理面板**：访问 `/admin` 路径，通过密码（环境变量 `ADMIN`）登录后即可读取和修改配置。密码采用 SHA‑256 + User‑Agent 双重校验，防止重放攻击。
- **配置存储于 KV**：所有核心配置写入 Cloudflare KV（绑定名 `KV`）。写入方法使用 `env.NAMESPACE.put(key, value)`【388052156445749†L110-L117】；读取时解析 JSON，如果无配置则自动生成 UUID 并写入 KV。
- **一键生成订阅**：根据 `?type=` 参数生成 Base64、Clash YAML、Sing-box JSON、Surge、Quantumult X 等格式的节点订阅，适配多端。
- **规则集自动更新**：集成 [blackmatrix7/ios_rule_script](https://github.com/blackmatrix7/ios_rule_script) 的 OpenAI、流媒体、购物、Google 等规则，每 24 小时自动从 GitHub 拉取并存入 KV，可手动触发更新。
- **IP 纯净度检测**：输入任意 IP 调用 ip-api.com 获取地理与代理状态【762169240514008†L48-L77】，再利用 Scamalytics 提供的欺诈评分（0‑100）【404162411908998†L120-L125】分析该 IP 是否适合代理。
- **Proxy IP 负载均衡与健康检测**：支持配置多个上游 IP，随机挑选并在 Cron 任务中定期 ping，自动剔除不可用节点。
- **伪装站点反代**：未命中 WebSocket 路径时，将请求转发到自定义伪装站点（默认微软官网）。
- **安全提醒**：管理员密码必填，可定期更换 UUID；支持请求量监控；UI 登出会立即清除 auth Cookie。

## 部署方法

### 方法一：Cloudflare Dashboard 直接编辑

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) 并选择一个已接入的域名。
2. 在左侧导航点击 “Workers & Pages” → “Create application” → “Create Worker”。
3. 粘贴完整的 `_worker.js` 代码到在线编辑器中，点击 “Save and Deploy”。
4. 点击 “KV” 标签页创建一个新的 KV 命名空间，记录下其 ID，并在 Worker 设置中绑定名为 `KV` 的 Namespace。
5. 在 “Variables” → “Environment Variables” 添加变量 `ADMIN`，值为您的管理员密码。
6. 部署后访问 `https://你的域名/admin`，登录并填写配置即可。

### 方法二：Cloudflare Pages GitHub 集成

1. Fork 本项目到自己的 GitHub 仓库并启用 Actions。
2. 在仓库中新建 `wrangler.toml`，填写名称、绑定的 KV Namespace ID 与 `ADMIN` 变量（参考示例）。
3. 在 Cloudflare Dashboard 的 “Pages” 创建项目，选择此仓库并启用 “Use Wrangler to build your project”。
4. 部署成功后，访问 Pages 域名的 `/admin` 登录管理面板。

### 方法三：Pages 手动上传

1. 在本地安装 [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install/) 并登录 Cloudflare。
2. 在项目根目录执行 `wrangler kv:namespace create shiplay`，获取命名空间 ID，并写入 `wrangler.toml` 的 `[[kv_namespaces]]` 配置。
3. 设置管理员密码：`wrangler secret put ADMIN`。
4. 执行 `wrangler publish --name shiplay` 部署 Worker 到 workers.dev；随后在 Pages 项目中绑定 custom domain（可选）。
5. 访问 `/admin` 配置并生成订阅。

## WebUI 使用说明

- **登录 /admin**：首次访问会出现登录页，输入在 `wrangler.toml` 中设置的密码即可。登录后会在浏览器 Cookie 中写入 `auth`，有效期 7 天。
- **配置保存**：修改表单并点击“保存配置”，请求会发送到 `/api/config`，Worker 调用 `env.KV.put()` 写入 KV，下一次请求即刻生效，无需重启。
- **获取节点链接**：在“获取节点链接”区块，系统会自动填充单个 VLESS 链接和完整订阅地址，并提供复制按钮，方便快速分享给其他设备或客户端。节点链接基于当前配置的第一个代理 IP 和端口生成；订阅地址为 `/api/subscribe`。

- **优选订阅生成**：若在配置中设置了 `优选 IP 列表（bestIPs）`，系统会根据每个优选 IP 与端口组合生成多个节点条目。点击列表右侧的“复制”按钮即可将对应的 VLESS 链接复制到剪贴板。

- **生成订阅**：在“订阅链接生成”区块中，点击相应按钮生成不同格式的订阅（Base64、Clash YAML、Sing‑box JSON、Surge、Quantumult X），结果会显示在下方文本框，可直接复制粘贴。若不通过按钮，在订阅 URL 后加参数如 `?clash`、`?singbox` 等也可手动获取。
- **IP 检测**：输入 IP 后点击“检测”，会请求 `/api/ip-check`。ip-api.com 提供了 `country`、`city`、`isp`、`proxy` 等字段【762169240514008†L48-L77】，Scamalytics 分析后返回 0‑100 的欺诈分数【404162411908998†L120-L125】。
- **更新规则**：点击“更新规则集”按钮立即从 GitHub 拉取最新规则，并写入 KV。

- **高级模式**：点击“展开/收起 高级模式”按钮可以查看详细配置 JSON，并预留了 Encrypted Client Hello、CDN 设置、订阅转换、消息通知、操作日志等扩展区域，方便未来二次开发。

- **环境变量未设置**：如果访问 `/admin` 时尚未在 Cloudflare 控制台设置 `ADMIN` 环境变量，页面将提示您如何添加此变量，并强调使用强密码。环境变量必须先设置，才能正常登录和管理配置。
- **登出**：点击“退出登录”立即清除 Cookie。

## 订阅示例

- **Base64**：访问 `https://域名/api/subscribe?type=base64` 获取普通 V2Ray/Shadowrocket 链接的 Base64 字符串。将其复制粘贴到客户端即可。
- **Clash Meta YAML**：`https://域名/api/subscribe?type=clash` 返回包含 `proxies`、`proxy-groups` 以及 `rules` 的 YAML 文件，可直接导入 Clash Meta。
- **Sing‑box**：`https://域名/api/subscribe?type=singbox` 返回 `outbounds` 数组的 JSON，可用于 sing-box 客户端配置。
- **Surge**：`https://域名/api/subscribe?type=surge` 返回 [Proxy] 部分格式，复制至 Surge 配置中。
- **Quantumult X**：`https://域名/api/subscribe?type=quanx` 返回 Quantumult X 节点格式。

## ProxyIP 推荐列表

推荐使用延迟低、纯净度高的 IP 作为上游代理，可以是 VPS 真实 IP 或由第三方 CDN 提供的中继节点。配置多个 IP 时请用逗号分隔，例如：

```
1.1.1.1,8.8.8.8,9.9.9.9
```

Worker 会随机选择一个 IP 连接；若启用了健康检测（在配置中设置 `enableHealthCheck: true`），Worker 将每 30 分钟检测各 IP 的连通性并自动剔除不可用节点。

## Cloudflare 免费额度与优化建议

Cloudflare Workers 免费套餐每月提供 100k 请求和 100ms CPU 时间/请求，KV 每天 1GB 读写存储及 100k 请求。shiplay 项目对 KV 的读写操作非常少，仅在保存配置和更新规则时写入一次。此外，订阅请求基本属于纯文本返回，不会占用太多 CPU 时间。

若担心费用，可以考虑：

1. **开启缓存**：Cloudflare 缓存订阅接口输出（例如 `cache-control: public, max-age=3600`），减少 Worker 实际执行次数。
2. **减少规则更新频率**：将 Cron 触发器设为每日或每周一次。
3. **限制 IP 检测**：由于 ip-api.com 免费接口仅允许每分钟 45 次请求【762169240514008†L139-L145】，避免在短时间内频繁查询。

## 零基础上手流程（10 步）

1. **注册 Cloudflare** 并将你的域名解析托管至 Cloudflare。
2. **创建 KV 命名空间**：在 Workers & KV 页面新建命名空间并记录 ID。
3. **准备代码**：复制本仓库中的 `_worker.js` 和 `wrangler.toml` 到本地。
4. **安装 Wrangler**：执行 `npm install -g wrangler`，然后 `wrangler login` 登录账户。
5. **编辑 wrangler.toml**：填入 `kv_namespaces.id`（第 2 步获取）、设置 `ADMIN` 密码和 Cron 计划。
6. **部署 Worker**：在项目目录执行 `wrangler publish --name shiplay`，等待部署完成。
7. **访问管理面板**：浏览器打开 `https://你的域名/admin`，输入密码登录。
8. **填写配置**：设置 UUID、WebSocket 路径、节点名称、上游 IP 列表、端口等，点击保存。
9. **生成订阅**：点击对应按钮获取订阅链接，将其导入到客户端中。
10. **测试连接**：客户端使用订阅连接，访问被屏蔽的站点，确认代理可用。如出现问题参考 FAQ 进行排查。

## 常见问题解答（FAQ）

1. **Error 1101 / 1015 是什么？**
   - Error 1101 通常表示 Worker 运行时异常或超过 CPU 限制，可在日志中查看错误栈。检查是否填写了正确的 `UUID` 或上游 IP 是否畅通。Error 1015 说明触发了 Cloudflare 速率限制，减少请求或升级套餐即可。

2. **KV 没生效或保存后无效果？**
   - 确认已在 Wrangler 或 Dashboard 中绑定正确的 KV 命名空间 ID。修改配置时必须点击“保存配置”按钮，成功后会提示“配置已保存”。如果仍然不生效，请检查浏览器是否缓存旧版本代码，尝试 Hard Refresh。

3. **订阅导入失败或格式不正确？**
   - 确认所选格式和客户端匹配。例如 Clash Meta 支持 YAML，Sing‑box 使用 JSON。某些客户端对参数名大小写敏感，确保路径前带斜杠（/ws）。

4. **为什么 ip-api.com 返回 `fail`？**
   - ip-api.com 免费接口限速 45 次/分钟【762169240514008†L139-L145】，如果短时间内查询过多会被限制。稍后重试或升级 ip-api Pro 服务（需付费）。

5. **Scamalytics 评分不准确？**
   - Scamalytics 只是其中一个参考工具【404162411908998†L120-L125】，若评分偏高但实际节点可用，可以忽略。建议结合多个服务（如 IP2Location、IPQualityScore）综合判断。

6. **如何更换 UUID？**
   - 在管理面板直接修改 UUID 字段即可。建议定期更换 UUID 增强安全性，但修改后记得更新客户端订阅。

7. **多个端口配置可以同时使用吗？**
   - 是的，可以在端口列表中填写多个值（用逗号分隔），订阅生成器会为每个端口和每个 Proxy IP 组合生成节点，客户端可任选连接。

8. **是否支持 gRPC 或 H2**？
   - 当前实现仅支持 WebSocket；gRPC/H2 需要重新实现握手逻辑和传输层，初学者不建议尝试。如有需求可参考 gRPC 版 VLESS 实现。

9. **启用健康检测后 Worker 报错？**
   - `connect()` API 需要 Worker 运行在新版本 runtime，确保 `compatibility_date` 设置为 2024‑11‑27 或更高，并在 wrangler.toml 中启用 `streams_enable_constructors` 标志（可选）。

## 致谢

## 引用的开源项目

为了实现 shiplay 的丰富功能，本项目参考并集成了以下优秀的开源仓库，感谢作者们的辛勤付出。这些项目的高星标数量反映了社区认可度：

| 项目 | GitHub 地址 | 用途与说明 | 星标数 |
|---|---|---|---|
| **cmliu/edgetunnel** | <https://github.com/cmliu/edgetunnel> | 作为核心架构参考，提供了在 Cloudflare Workers/Pages 上实现 VLESS/Trojan 协议及管理面板的思路。该项目在 GitHub 上获得了超过 27k ⭐【577833122400292†L150-L160】。 | ≈27k 星 |
| **eooce/Cloudflare-proxy** | <https://github.com/eooce/Cloudflare-proxy> | 提供多协议代理部署示例（VLESS/Trojan/Shadowsocks 等），用于参考多协议支持。仓库约 2.3k ⭐【994423360103766†L151-L159】。 | ≈2.3k 星 |
| **yonggekkk/Cloudflare-vless-trojan** | <https://github.com/yonggekkk/Cloudflare-vless-trojan> | 该项目实现了 VLESS-ws 与 Trojan-ws，并支持 NAT64 配置，我们借鉴其 NAT64 参考方案。拥有约 13.7k ⭐【607968020895763†L150-L156】。 | ≈13.7k 星 |
| **blackmatrix7/ios_rule_script** | <https://github.com/blackmatrix7/ios_rule_script> | 提供解锁 AI、流媒体、购物、Google 等网络服务的规则列表，本项目通过 Cron 定时拉取规则集【557094666453825†L140-L147】。 | ≈25.2k 星 |
| **Loyalsoldier/clash-rules** | <https://github.com/Loyalsoldier/clash-rules> | 提供 Clash Premium 规则集用于科学上网，供订阅生成器参考【7515614886908†L138-L146】。 | ≈25.2k 星 |
| **ACL4SSR/ACL4SSR** | <https://github.com/ACL4SSR/ACL4SSR> | 提供分流规则和 ACL 配置，用于改进分流策略【8636220021196†L138-L143】。 | ≈5.9k 星 |
| **XIU2/CloudflareSpeedTest** | <https://github.com/XIU2/CloudflareSpeedTest> | 一款测试并筛选优质 Cloudflare IP 的工具，我们推荐用户使用该工具生成优选 IP 列表；仓库约有 25.1k ⭐【347904265856978†L114-L125】。 | ≈25k 星 |

## 致谢

本项目灵感来源于社区众多优秀的开源作品，特别感谢：

- **edgetunnel/cmliu** 项目提供的技术实现思路（架构和管理面板）。
- **blackmatrix7/ios_rule_script** 提供持续更新的规则集，帮助实现 AI/流媒体/购物/Google 等解锁功能。
- **Loyalsoldier/clash-rules**、**ACL4SSR/ACL4SSR** 提供的 Clash/ACL 分流规则。
- **ip-api.com** 与 **Scamalytics** 提供免费的 IP 查询与欺诈评分服务。

如在部署过程中遇到其他问题，欢迎提交 Issue 或在论坛交流。祝您科学上网顺利！

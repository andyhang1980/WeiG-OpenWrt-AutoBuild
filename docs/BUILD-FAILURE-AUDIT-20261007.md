# 2026-10-07 原子切换、取消控制与 amule 故障审计

## 层次与处理边界

| 现象 | 证据与归属 | 处理 |
| --- | --- | --- |
| Cancel #594 / #595 红灯 | 普通取消或 force-cancel 返回 502；目标 Run 随后确实停止。属于 Actions 控制面，不是固件编译失败 | 有界重试并读取目标 Run 状态，确认停止才报告成功；权限失败、截止时间内未停止仍失败 |
| Lienol Tailscale / PBR / arpbind 切换无响应 | `ip-tiny` 是 DDNS 的条件选择，先取消再启用 `ip-full` 会经过非法中间配置 | 共享 `applyUserIntent` 原子提交完整 N/M/Y 计划，先启用替代提供者再撤销旧提供者，按最终收敛状态校验 |
| Kodexplorer 切换无响应 | nginx 条件提供者随 `NGINX_PCRE` 改变；默认/反向 select 会让前置条件最终锁定为 Y | 从真实条件关系发现唯一最小前置计划；已满足的锁定 Y 不是非法值；自动依赖不升级为用户意图 |
| mtwifi / qmodem-hc | 当前 x86 Generic 不满足 Native Target/设备条件 | 持续、可复制的条件说明；不伪造依赖，不绕过目标限制 |
| mwan3helper | exact Source/feeds 中声明 `pdnsd-alt`，但没有对应真实包定义 | 说明缺失提供者；不套用其他 Source 的包或禁用名单 |
| Libreswan | `nss-utils` 有源码，但 Lienol 上游 feeds 安装器误判为 core 包，未安装 NSS | 不是“所有源不支持 Libreswan”。需要 Catalog 和 Worker 的 feeds 准备过程保持同一修复；共享适配器扩展待确认 |
| Run 37452632600 | ImmortalWrt/master 的 amule autogen 缺 `intl/Makefile.in` | exact compatibility 编译事实 `BLD-0014`，失败根为 `amule`；网页复用现有反向依赖推荐；Worker 不新增审查 |

所有算法保持 Source/Branch/包名无特例。未启动固件、Probe、重型 Catalog 生成或重新创建 Issue；历史失败 Run 不会因本地修改变为绿灯。

## Cancel 证据

- [37443493388 / #594](https://github.com/weigefenxiang/WeiG-OpenWrt-AutoBuild/actions/runs/37443493388)：普通取消 502；目标 `37443408934` 后续 `cancelled`。
- [37443684225 / #595](https://github.com/weigefenxiang/WeiG-OpenWrt-AutoBuild/actions/runs/37443684225)：普通取消后 force-cancel 502；目标 `37443598521` 后续 `cancelled`。
- `issue_comment` 执行默认分支上的 workflow；仅发布 dev 不改变 main 的取消控制器。控制器关闭已授权 Issue 阻止后续派发，复核 queued/in-progress 目标并有界确认。未停止不能冒充成功。

## Lienol 的 exact 环境

Source `Lienol/openwrt`，Branch `25.12`，Target `x86/64/DEVICE_generic`：

| 输入 | commit |
| --- | --- |
| source | `a337df404ab3f6dc5b3e7b26a753343d3ad2f4c2` |
| lienol | `eb8b7938c0e91065e2d60adcc2e8b6fd2f796261` |
| packages | `fad5bd22ef3f137cad2add7904ac441291244a49` |
| luci | `6998d0bd430ef7d1acca0e8f83cfc46221235e11` |
| routing | `b32747dca62435f1ea01b7a5320c3da15eead46f` |
| telephony | `2618106d5846a4a542fdf5809f0d3ed228ce439b` |
| video | `094bf58da6682f895255a35a84349a79dab4bf95` |

`inputsHash=9bc5eaee6bddea372f948fa70279c711f1757dbe6508ec5f09eb8817715ad074`。

NSS 定义在 packages 的 `libs/nss/Makefile`，真实输出 `libnss` 和 `nss-utils`。同版本 source 的 `scripts/feeds::is_core_src` 用 `.packageinfo-*_$src` 后缀匹配，`nss` 错误匹配 core 中 `quectel_MHI_nss` / `quectel_QMI_WWAN_nss` 的元数据。Run `37320749444`、Job `111798979743` 在 `2026-10-05T14:02:10.3300439Z` 明确记录：`Not overriding core package 'nss'; use -f to force`。这解释了为什么 Native metadata 和 Catalog 都缺 NSS，而不是网页丢包。

不得直接全量 `install -f` 覆盖真实 core 优先级，不得只修 Catalog 后宣称 Worker 一致，不得把上游误判登记成跨源永久禁用规则。

## amule 完整反向审计

[失败 Run 37452632600](https://github.com/weigefenxiang/WeiG-OpenWrt-AutoBuild/actions/runs/37452632600)，Job `112232649656`。上传 #575 配置是历史输入；实际重新导出的请求与本次 Run 的 Native 元数据、源码/feeds 身份逐项核对。配置验证 `checked=5640`、`mismatches=0`，没有 Worker 改写选择的证据。

Source `ImmortalWrt/master`，Target `x86/64/DEVICE_generic`，RootFS 512 MiB：

| 审计输入 | exact commit | 检查 Makefile 数 |
| --- | --- | ---: |
| source | `8735c686ae30fe85d94de97669399c2117179f82` | 598 |
| packages | `e731ba76764082d9db71de60f1ddac43f4114101` | 1711 |
| luci | `5fc1fac5684cac6eee2c7fbff78c65b867980dd8` | 248 |
| routing | `4b9891b9136259f93294a424507ed24c5e8c1cbd` | 11 |
| telephony | `5d68d53c160a325ea9d03fce393e051573bcc736` | 40 |
| video | `afb0a7453e4ecebe4b59f9c1b5f8d5413fb652f2` | 62 |
| 总计 | source + 全部实际 feeds | 2670 |

`inputsHash=cf6ca04e8676f230db4327ddf76f826921e297ff93f13c6e6d4084ab61188960`。

- 首个确定性失败位于 `package/feeds/packages/amule/compile` 的 autogen 阶段：缺少 `intl/Makefile.in.tmp` / `intl/Makefile.in`，不是镜像安装冲突、RootFS 溢出或 Worker 门禁。
- Native metadata 将输出 `amule 2.3.3-r5` 映射到 `package/feeds/packages/amule/Makefile`。实际 [amule Makefile](https://github.com/immortalwrt/packages/blob/e731ba76764082d9db71de60f1ddac43f4114101/net/amule/Makefile) SHA256 为 `a8e96dd9aab0624108e5bc49e62ab584ede9de4b2c809c1be0ca036e723fa88b`。
- 全树命中消费者 `luci-app-amule`：luci `applications/luci-app-amule/Makefile:9` 为 `LUCI_DEPENDS:=+luci-compat +amule`，SHA256 `0845c4c15a1c438e39f1dbd34b7c46e1945681bfa2b1a7508f075438a76ad01c`。
- packages `libs/antileech/Makefile` 的命中仅为源码 URL 和 `/usr/share/amule` 安装路径，不是反向编译依赖。
- source/routing/telephony/video 没有额外命中；全部输入没有发现以 amule 为目标的额外 `PKG_BUILD_DEPENDS` 触发者。
- `BLD-0014` 仅记录失败的真实 `buildDependency.package=amule`，不复制消费者名单或静态闭包；Source/Branch/source SHA/feeds hash/Target 均限定到已取证环境。新源码、其他分支或不同目标不自动继承失败结论。

本地审计报告包含每个输入归档哈希、匹配文件哈希、行号和全部 Makefile 数；公开规则保存 exact Run/source/feeds 证据引用。用户仍可网页“强制继续”，但这不等于上游 amule 故障已被修复。

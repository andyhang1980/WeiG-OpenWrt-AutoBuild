# 2026-10-05 构建故障与修复边界

本次对照上传配置、13 个 Run 的 Native Profile baseline、overrides、reconstructed/final config、原生软件包元数据和失败日志。表中编号指上传配置文件前缀，不把不同 Source 的同类表象合并成一条禁包规则。13 份配置都明确设置 RootFS 512；baseline + overrides 重建结果与 final config 逐符号一致，没有 Worker 改写配置的证据。

| 配置编号 | Source / Branch | Run | 首个实际故障与处理层 |
| --- | --- | --- | --- |
| 525 | iStoreOS / istoreos-24.10 | [37230365589](https://github.com/weigefenxiang/WeiG-OpenWrt-AutoBuild/actions/runs/37230365589) | ldns 缺少 OpenSSL SHA2 功能；配置包含关闭的 OpenSSL 子项 |
| 526 | 同上 | [37230432771](https://github.com/weigefenxiang/WeiG-OpenWrt-AutoBuild/actions/runs/37230432771) | neon 无 MD5_CTX；同类配置功能关闭 |
| 527 | 同上 | [37230485074](https://github.com/weigefenxiang/WeiG-OpenWrt-AutoBuild/actions/runs/37230485074) | neon 无 MD5_CTX；同类配置功能关闭 |
| 531 | 同上 | [37231082148](https://github.com/weigefenxiang/WeiG-OpenWrt-AutoBuild/actions/runs/37231082148) | Worker 在编译前重复审查 BLD-0003，拒绝网页强制继续 |
| 532 | 同上 | [37231176326](https://github.com/weigefenxiang/WeiG-OpenWrt-AutoBuild/actions/runs/37231176326) | libwebsockets 缺少 RSA；配置功能关闭 |
| 533 | 同上 | [37231262383](https://github.com/weigefenxiang/WeiG-OpenWrt-AutoBuild/actions/runs/37231262383) | 并行 Squid 缺 RSA/DH；串行诊断又遇 SoftEther 缺 DES/AES |
| 539 | Lienol / 25.12 | [37232101631](https://github.com/weigefenxiang/WeiG-OpenWrt-AutoBuild/actions/runs/37232101631) | libreswan 缺 NSS / nss-utils，最终找不到 cert.h |
| 540 | 同上 | [37232152405](https://github.com/weigefenxiang/WeiG-OpenWrt-AutoBuild/actions/runs/37232152405) | QtBase 5.15.8 的 010-gcc11.patch 无法应用；上游源码故障 |
| 542 | 同上 | [37232424744](https://github.com/weigefenxiang/WeiG-OpenWrt-AutoBuild/actions/runs/37232424744) | APK 安装 ip-full / ip-tiny 的同名版本化 provider 冲突 |
| 544 | 同上 | [37232479783](https://github.com/weigefenxiang/WeiG-OpenWrt-AutoBuild/actions/runs/37232479783) | 同一 APK 安装语义冲突，直接选择者不同 |
| 547 | 同上 | [37232830759](https://github.com/weigefenxiang/WeiG-OpenWrt-AutoBuild/actions/runs/37232830759) | Worker 重复审查 BLD-0003；不能当作 dockerd 编译失败证据 |
| 548 | 同上 | [37232912792](https://github.com/weigefenxiang/WeiG-OpenWrt-AutoBuild/actions/runs/37232912792) | verysync 下载结果不是 gzip 归档；下载地址返回非源码内容 |
| 549 | 同上 | [37233040067](https://github.com/weigefenxiang/WeiG-OpenWrt-AutoBuild/actions/runs/37233040067) | SoftEther 4 / 5 安装相同文件；上游未声明冲突 |

## 根因与实现

网页可在全新工作区稳定复现：启用父项后生成条件默认值，关闭父项时子项被压为 N；旧状态层把自动压低误记为用户修改，重新启用父项便无法恢复原生默认值。修复保留派生值所有权，覆盖 bool、tristate、string、int、hex，显式 N 和自定义 scalar 不被覆盖。历史文件没有每次点击的意图证据，不能宣称这些失败配置都由同一次操作生成，也不能擅自把其中的显式 OpenSSL N 改成 Y。旧配置需要用户在网页确认恢复适用默认值后重新导出；修复防止新交互再次污染配置。

原生 NSS feed 的 Makefile 存在，但此构建的 feeds 安装日志报告 core-package 名称冲突、未覆盖 nss，刷新元数据确实没有 nss-utils。此前共享引擎将“无可选 provider”直接跳过。现在只有完整原生元数据才能确认依赖缺失，并通过现有合法最小规划器取消真实消费者；不完整旧数据仍保持待定，不 force-install feeds，不维护包名黑名单。

同一通用检查还发现活动配置中的 rpcd-mod-rad3-enc、baidupcs-web、boost-system、pdnsd-alt 缺失。它们不是本次对应 Run 已确认的首个 fatal error，但现在可以在网页检查时暴露并规划修改。某方案不唯一或证据不足时，不伪造唯一推荐。

Catalog 从实际 package-pack / package-dumpinfo / feeds 的实现识别受支持 APK 方言，保留 ABI-qualified 安装名称，区分版本化 exclusive provides 与 @unversioned 能力。浏览器只在 USE_APK=Y、包安装为 Y 时检查；OPKG 和 M 不套用。推荐复用既有兼容规划器，本次两份配置均能规划取消 ip-tiny，不在网页写包名特例。未知包装方言不宣称支持，未知 provider 语法保持待定。

Catalog 的 OWN-0004 / BLD-0007 保存 SoftEther / QtBase 取证，限定实际 Lienol 源码提交与 Target。Qt 触发者来自原生图，包含 Source-Makefile 共用输出和 Build-Depends；不禁用所有 qBittorrent，也不记录手写 triggerPackages。规则和精确 feeds 见 Catalog 的 COMPATIBILITY 文档。verysync 需要上游修复下载地址并验证真实归档与哈希，不能靠更改 Kconfig 或 Worker 审查解决。

Worker 去除通用软件兼容性／闭包审查及额外 prepare-tmpinfo，按锁定输入重建并执行。保留输入身份、执行安全和显式覆盖保真，失败后收集上游已经生成的原生元数据。网页强制继续不保证上游包能编译成功，但 Worker 不再二次否决软件选择。

## 验证与上线要求

共享引擎、真实网页状态层、scalar 编辑器、真实 Worker CLI、全站架构回归与 14 个浏览器尺寸／主题场景通过。长提示使用同一浮层几何契约：自然宽度上限为 visual viewport 的 2/3，长文本换行，短屏竖向滚动，不出现横向滚动；实际最大高度与定位高度一致。

真实 Lienol 关系图加入 12,493 行安装事实，经原有 positional codec 编解码语义一致。gzip 从 6,769,788 增至 6,819,117 bytes（约 +0.73%）；五次 gzip+JSON 解码中位数分别约 1,501 / 1,516 ms。这是单一环境观测，不是所有目标的性能承诺。

Catalog 本地回归通过；Windows 不执行的 legacy shell 和完整上游原生 Kconfig oracle 仍需 Linux CI／Catalog 生成验证。不能把网页或本地测试通过写成 13 个固件全部编译通过。必须生成新 Catalog 数据，验证后晋级 Catalog dev 与 AutoBuild dev；fix 浏览器不等于 dev 已上线。旧锁定请求继续读取旧 Worker，测试新修复需在更新后的 dev 网页导入配置、确认修改并重新下载 JSON 提交。

# 原生安装依赖与兼容推荐合并方案

状态：用户已批准执行；从已验证的 dev 开始。修复分支不代表 dev 已上线。

## 边界

Catalog 保存原生事实，网页解释事实并在用户确认后修改配置，Worker 只按锁定输入执行。不得恢复 Worker 软件兼容性门禁，不得因 Source 或包名写求值器特例。保留历史配置读取能力、显式 N 和 scalar 值；强制继续仍由用户负责。

## 实施模块

| 模块 | 根因与处理 | 验收 |
| --- | --- | --- |
| 共享 Kconfig 证明 | 已知为假的 OR 经取反得到真时，不应继承“启用 OR 时有多个选择”的歧义；AST 与旧表达式路径共同修复 | 已知负条件允许 dockerd 反向取消；真正未知或有多个活动 provider 仍待定 |
| 原生安装依赖 | 原生 Package 的 EXTRA_DEPENDS 未进入 package dump；通过原生 Make 求值采集，单独保存安装事实，不伪造 Kconfig select | OPKG/APK 安装 Y 的依赖闭包可检查、推荐；原生 defconfig baseline 不变；旧元数据不冒充完整 |
| 兼容规则与保留约束 | 通用共存规则增加显式保留参与者；规划与实际应用使用同一约束，避免孤儿清理删除保留的后端 | Lienol 精确证据中两者 Y 时推荐 luci-app-zerotier=N、zerotier=Y；仅后端 Y 不触发；再次检测及导出仍保留后端 |
| 上游配方失败 | verysync 非 gzip 归档、vlmcsd 错误 tag URL 分别限定取证 Source/Branch/源码/feeds；复用反向依赖推荐 | 不泛化到所有源；不修改下载内容、跳过哈希或由 Worker 禁包；BLD-0002 暂时保留 |
| 共享弹窗 | 兼容弹窗 overflow:hidden 与无约束正文造成内容、按钮越界 | 标题及操作区留在可视区域，正文滚动；证据可折叠、长内容换行；桌面/短屏/手机/深浅主题通过 |

## 新 Run 的证据归属

| Run | Source / Branch | 首个实际失败 |
| --- | --- | --- |
| 37270008315 | iStoreOS / istoreos-24.10 | luci-app-olsrd2 的 EXTRA_DEPENDS 未安装 |
| 37270058783 | Lienol / 25.12 | luci-app-zerotier 与 zerotier 共写 /etc/init.d/zerotier |
| 37270201344 | Lienol / 25.12 | verysync 下载不是 gzip |
| 37270501636 | Lienol / 25.12 | 用户强制保留 SoftEther 4/5，共有文件安装冲突；已有 OWN-0004 生效 |
| 37277262603 | iStoreOS / istoreos-24.10 | vlmcsd 的 1113 tag URL 返回 404；上游实际 tag 为 svn1113 |

五个 Run 的 reconstructed.config 与 final.config 逐符号一致。不能把上游故障登记为 Worker 改写，也不能把消除一处文件冲突等同于整份固件编译成功。

## 验证与发布

先执行共享引擎、原生 Make 元数据、兼容 schema/codec、实际 UI 推荐事务与导出回归；再验证真实 Source 数据及弹窗几何。Catalog 原生采集变更需要新的完整数据生成，不能复用旧数据宣称修复安装依赖。重型生成由用户跟踪，确认成功后再晋级 Catalog dev 与 AutoBuild dev；其后更新维护记录。不直接改 main/staging，不随意新增门禁。

## 实施验收（2026-10-05）

- AutoBuild 全量本地检查、Catalog npm test 通过；GNU Make 展开 EXTRA_DEPENDS、原生 Depends 不变、codec 往返、Y/M 安装区别、反向取消和共享依赖保留通过。
- 上传的 iStoreOS #531 与 Lienol #539/#548 完成真实浏览器导入 → 推荐按钮 → 二次检查 → .config 导出 → schema-6 overrides 重建回归；覆盖 dockerd、ZeroTier、verysync、vlmcsd 四个推荐。
- 四个兼容弹窗各覆盖桌面/短屏/手机四种尺寸、深浅两种主题，共 32 个几何场景；共享 UI 浏览器矩阵另外 14 个场景通过。展开长 feeds 证据仍不会遮住标题与操作区。
- ZeroTier 实际导出为 luci-app-zerotier=N、zerotier=Y，不在导入时自动修改，不把清除这个冲突冒充整份固件编译成功。
- Schema 7 的 inputHashes 复用已有 Catalog 源码/feeds receipt 身份；三条新规则限定精确输入。身份缺失/变化仅诊断，不把旧故障沿用到新 feeds。旧规则和配置读取不变；旧消费者不接收丢掉保留约束或输入范围的新规则。

上述浏览器回归使用当前真实原生 Catalog 数据与待发布的兼容规则，不代表远程 dev 已上线。Windows 未运行 Linux 原生 Perl/legacy shell oracle；现有 Probe contracts CI 继续验证。完整 Catalog 重新生成、snapshot 取证与 dev 晋级仍待 CI 结果。Worker、main、staging、private 与 Blog 未修改。

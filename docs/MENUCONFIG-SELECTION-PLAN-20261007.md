# 原生勾选、性能与按需依赖推荐

本轮仅修改 AutoBuild 的共享求值器消费方式、网页交互与回归。Catalog 原生事实、compatibility.json、固件 Worker、main/staging/Blog 均未修改；没有发布或启动固件编译。

## 根因与分层

| 现象 | 根因 / 归属 | 实施结果 |
| --- | --- | --- |
| 勾选卡顿 | 网页每次重复规范化关系、全量默认值/反向关系收敛、重建整组 DOM 与测量名称，另有 150ms 定时全配置兼容扫描；热勾选没有重复下载 Catalog | 结构缓存；复用既有 worklist 的受影响范围；未变化卡片保留；移除勾选后的定时扫描 |
| KodExplorer 被要求先开 PCRE | native 默认本应开启 PCRE 并选新 nginx variant，但冻结的版本化 EXTRA_DEPENDS 未解析项使旧自动 variant 被保留。安装审查污染了交互收敛 | 普通勾选仅按 native Kconfig 收敛，旧 variant 自动退场；未知安装信息仍留给显式检查 |
| baidupcs-web / mwan3helper / qBittorrent 的 missing dependency | 精确 Catalog 中分别缺 baidupcs-web / pdnsd-alt / boost-system 提供者；这是包完整性风险，不等于所有对应 LuCI 项都违反 native 选择上限 | native 可选项允许勾选；完整依赖风险仍在“检/提交”审查，不伪造包 |
| ltqtapi / qmodem-hc / mtwifi | 真正的 native BROKEN/Target/设备条件限制 | 普通模式按原生条件隐藏；开发者模式提供“原因”，不自动打开隐藏开关或更换 Target |
| 普通勾选 CJDNS 提示其他规则 | 定时扫描整份配置，提示可能来自其他已选包 | 只有显式“检/提交”扫描兼容性 |
| 只有部分项弹“最少前置操作” | 原生依赖与额外包完整性校验混用，且选择失败后自动调用 planner | 退休自动前置弹窗；用户主动展开时才调用同一个有界 planner |

Native `select` 保持 OpenWrt resolver 原有行为：dir_dep=N 时抑制被选目标；非零 ceiling 下的超限 select 保留并输出非阻断原生警告。没有替换为另一套 Kconfig 解释器。

## 布局

```text
当前插件分组
  [□ 应用名称              ]  整卡单击只切换一次
  [   依赖 ▾ / 原因 ▾      ]  独立按钮，不改变勾选
  ……其它卡片……

  依赖推荐 · 应用名称                         [关闭]
  无需额外勾选 / 额外开启 A=Y → 再启用应用
  Kconfig 自动联动：B=Y、C=Y（与手动步骤分开）
  缺失提供者 / 不满足 Target / 未知边界的说明
  [定位选项] [应用推荐并启用：仅唯一且合法时显示]
```

同一时间只展开一个面板。宽度随分组，长文本换行；只有高度超过 60% 可视页面才纵向滚动，无横向滚动。原有悬浮、右键固定、复制机制保留。配置变更后推荐标记过期，刷新为显式动作，不在下一次勾选中重新计算。

## 复用与安全边界

- `catalog-engine.js` 仍是唯一求值/规划实现；`menuconfig` scope 与默认完整审查 scope 分开，完整审查没有被删除。
- 首次 native 事务完整收敛；同模型、同 revision 的后续事务只重算既有结构索引的受影响范围。导入/切换/非事务更新使 marker 失效。MODULES 变化完整重算。
- 静态 AST/关系与 worklist 用 WeakMap 缓存；不缓存生效默认值。推荐缓存只保存展示与操作，不保留整份求值状态。
- 卡片与 N/M/Y 共用 `kconfigStateConstraints`。原生 `depends` 不是自动启用前置项的指令；只在主动查看推荐时提供可证明的额外勾选方案。
- 没有 Source、Branch、软件包名特判；没有新增 Worker 审查。Native 可勾选不等于上游可成功构建。

## 验证

- 全量 `dev-assistant prepare/verify`，含现有 Worker 配置保真和完整安装事实回归。
- 六个当前 Source 的真实 Catalog：37 项应用选择路径；每次增量结果对比完整 native 求解；48 次整卡点击、右键固定、详情不改值、兼容扫描计数为零。
- 同机连续勾选约 35–93ms；Lienol 原热勾选约 167–265ms，改后约 46–68ms。首次 native 校准仍为完整计算，不承诺所有事务均低于 50ms。
- 可手动修复前置条件的通用浏览器 fixture：唯一方案原子应用、显式意图记录，1366/640/390 宽度换行与单面板边界。
- 六 Source 的 JSON 下载、GitHub 编辑页导航、导入、.config 与配置重建回归；不创建 Issue、不派发构建。
- 本轮实测当前默认分支，不将共享机制覆盖声明为全部历史版本逐一实测。

## 当前数据身份

AutoBuild 基线 dev `af852226a6c4d36a97f619b01c27d68c8cc58d20`；Catalog code dev `a2bffa8061009c481250e49cc068c7e807536db2`；snapshot `9aa36aafd1ffbb670ce56e33e9ed90f8394506c6`；immutable assetRef `a0894cc10da028bcfed353b409f017a9f93ab46b`。保持现有绑定，无需重型再生成。

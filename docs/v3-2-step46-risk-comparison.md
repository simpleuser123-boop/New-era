# New Era v3.2 Step 46 - 真假 AI 岗对决体验

## 范围

Step 46 在 `/risks` 页面内部增加“真假对决”模式，让用户并排查看两个预置 JD 的风险倾向、风险等级、主要风险信号、原文证据、建议动作、数据来源和规则版本。

不包含：

- Step 47 HR 核实问题。
- Step 48 集成验收。
- 招聘平台 API、网页抓取或任意 URL 双页面抓取。
- 公开分享链接、自动保存对决结果、写入 reports、applications、Tracker 或历史记录。
- 风险引擎核心判断逻辑或新算法分叉。
- 新增左侧导航或独立顶层路由。

## 页面

页面路径仍为 `/risks`。

`RiskScanWorkspace` 默认打开“单岗验真”，页面内分段控制器提供：

- `单岗验真`
- `真假对决`

“真假对决”挂载 `RiskComparisonWorkspace`，Benchmark 看板仍保留在主操作区之后，不占对决主流程。

## 数据

对决只使用 `demo-data/preset-jds.json` 中的本地预置 JD。每条 Demo 数据带：

- `source: "competition_demo"`
- `sourceLabel: "竞赛 Demo 仿真数据"`

首版三组稳定组合：

- 真 AI 岗 vs 假 AI 岗。
- 真 AI 岗 vs 边界岗。
- 假 AI 岗 vs 边界岗。

用户也可以在左右两侧选择两个不同的预置 JD，并一键交换左右岗位。

## 扫描契约

两侧都调用同一套 API：

`POST /api/scan-risks`

请求体使用预置 JD 的：

- `jdText`
- `company`
- `role`

成功结果由 `mapApiResponseToScanResult` 映射，展示 API 返回的 `ruleVersion`、风险等级、风险分数、信号、summary 和 recommendation。

如果某侧 API 调用失败，页面只在该侧使用 `buildPresetScanResult` 生成 fallback，并明确显示：

- `Fallback 兜底`
- `preset-fallback（非实时扫描）`
- 原始失败信息

另一侧成功结果仍可阅读。

## 关键差异

“关键差异”只读取两侧扫描结果：

- 风险倾向。
- 风险等级与风险分数。
- 主要命中信号。
- 规则版本是否一致。

差异摘要不根据预置组合写死最终结论，也不复制风险判断逻辑。

## 验证

推荐顺序：

```powershell
npm run lint
npm run build
npm run smoke:risk-comparison
```

浏览器验收 `/risks`：

- 默认仍为单岗验真。
- 可切换到真假对决。
- 真 AI 岗 vs 假 AI 岗可完成双扫描。
- 两侧原文证据可读。
- 桌面双列等宽。
- `390x844` 窄屏按岗位 A、岗位 B、关键差异纵向排列，无横向溢出。
- `AppSidebar` 没有新增 Benchmark、真假对决或 HR 核实问题入口。

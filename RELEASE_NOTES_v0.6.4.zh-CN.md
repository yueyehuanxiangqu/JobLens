# v0.6.4 发布说明

v0.6.4 是继 v0.5.0 之后的下一个公开版本。v0.6.0–v0.6.3 的 provider、诊断、证据评分和重复信号修复都只是本地开发内容，已合并进这次升级；本版本再增加可复用的结构化简历档案。截图中的文字只作为现状证据，不是操作指令。

升级路径是 `v0.5.0 → v0.6.4`。v0.6.0–v0.6.3 没有单独发布 GitHub Release，也不是需要单独安装的版本。

## 这次修复了什么

### 1. 空维度不再占一项

如果 JD 没有提取出某个维度的要求，该维度不再出现在 Breakdown 中，也不会生成一条假的 `Not scored` evidence。界面会在评分说明里标记为 `Not assessed`，避免把“没有要求”误读成“简历没有证据”。

### 2. 四种评分模式共用证据底座

v0.6.4 提供 `Strict`、`Balanced`、`Potential` 和 `Sponsorship-first` 四种模式。四种模式共用同一套要求矩阵、原文引用校验和扩展端算分流程，差异集中在证据如何分类和获得多少部分分：

- `Strict` 要求直接、可比、明确写出的证据。
- `Balanced` 是默认模式，给有依据的部分匹配和相邻经验合理空间。
- `Potential` 会纳入项目、课程和可验证的成长潜力，但不替代法律或资格硬条件。
- `Sponsorship-first` 使用 Balanced 的能力判断，同时突出赞助相关风险；赞助检查独立于能力分数。

`Sponsorship-first` 不再配置实际不会参与能力评分的 30% `Sponsorship Fit` 权重；能力维度会归一化到 100%，sponsorship 只作为独立风险/上下文检查，不会额外改变能力匹配百分比。

Balanced 允许有明确原文支持但不完整的要求使用 `partial`，允许合理的相邻经验使用 `transferable`；只有当前简历没有可核对证据时才使用 `unknown`。明确学历、证照、语言等级、工作授权和年限等硬条件仍需要直接证据，不会因为切换到 Balanced 而自动通过。

### 3. 简历先读取成 `resume-v1` 结构化档案

- 上传 PDF 时尽量依据文字坐标恢复行结构，减少 `EDUCATION`、学位、学校和日期被压成一行后漏识别的情况。
- 上传后，使用当前 Settings 中的模型把完整简历整理成统一字段：经历、教育、技能、证照、语言和其他 section。
- 匹配时先给模型结构化档案，再附上精确提取的原文；所有 `resumeQuotes` 仍必须从原文逐字核对，不能因为结构化阶段而降低证据要求。
- 模型未配置、返回无效或超时，不会伪装成成功解析，而是保存为 `Local fallback`，并提供 `Re-read` 入口。

### 4. 支持简历库和当前简历切换

简历区域现在支持 `+ Add resume`、`Use for analysis`、`Re-read` 和 `Remove`。每份简历保存一个结构化 profile；当前选中的 profile 决定匹配缓存和新的分析结果。旧版 `persistentResume` 会在首次打开时自动迁移，不需要手工复制。

原始文件本身不会被扩展保存；提取文本和结构化数据保存在本地扩展存储中。为了让证据引用可复核，提取文本仍作为本地 canonical source 保存；配置了模型时，提取文本会发送给用户选择的 provider 做一次结构化读取。

### 5. 版本与缓存

- 扩展版本、manifest 和诊断版本更新为 `0.6.4`。
- 匹配 Prompt 更新为 `v10`，简历结构化 Prompt 为 `resume-v1`。
- 结构化内容或当前简历变化会产生新的 resume hash，旧岗位结果不会被错误复用。

## 验证

```text
npm test       # 55 tests pass
npm run build  # Vite production build pass
git diff --check
```

构建包：`linkedin-job-match-v0.6.4.zip`。使用 Keka 从构建后的 `dist/` 目录生成 ZIP；安装时请解压后加载其中的扩展目录。

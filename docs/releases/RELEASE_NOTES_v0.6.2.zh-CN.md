# v0.6.2 本地测试版

> 本版本只在本地生成，尚未推送 GitHub，也没有发布 Release。

## 这次为什么更新

旧流程让模型直接返回总分和几项解释。这样容易出现“关键词相同就给高分”、把简历未提及当成不满足，以及模型输出被截断后仍留下一个看似正常的 0 分。v0.6.2 将流程拆成两步：

1. 模型提取可审计的岗位要求与简历证据。
2. 扩展根据固定规则、要求重要性和用户维度权重计算分数。

模型不再提交 `overallMatchPercent` 或 `matchBreakdown`，也不能自行改变数字。

## 新的证据矩阵

每条要求包含：

- `dimension`：技能、职责、经验年限、教育/证书、语言/地点
- `importance`：`required`、`responsibility` 或 `preferred`
- `jdQuote`：岗位原文连续摘录
- `resumeQuote`：简历原文连续摘录；没有证据时为空
- `status`：`met`、`partial`、`transferable`、`unmet` 或 `unknown`
- `hard`：岗位是否明确把它写成硬条件
- `reason`：限长的证据解释

扩展会验证 JD 和简历摘录确实存在、拒绝重复要求、拒绝缺少证据的非 `unknown` 状态，并拒绝 `extractionComplete=false`。摘录验证能发现模型编造原文，但不能完全替代人工判断语义是否真的等价。

## 分数如何计算

每种分析模式只改变“部分满足”和“可迁移证据”的固定分值：

| 状态 | Strict | Balanced | Potential | Sponsorship-first |
| --- | ---: | ---: | ---: | ---: |
| `met` | 100 | 100 | 100 | 100 |
| `partial` | 40 | 60 | 70 | 60 |
| `transferable` | 20 | 40 | 60 | 40 |
| `unmet` | 0 | 0 | 0 | 0 |
| `unknown` | 0 | 0 | 0 | 0 |

同一维度内，`required`、`responsibility`、`preferred` 的要求权重分别为 3、2、1：

`dimension score = Σ(requirement points × importance weight) ÷ Σ(importance weight)`

只有“有岗位要求且用户维度权重大于 0”的维度参与总分；参与维度的权重会重新归一化到 100%。因此，没有要求的维度不会凭空贡献 0 分；自定义权重设为 0 只会从能力总分中排除该维度，但其硬条件仍会出现在提醒里。

`Evidence coverage` 是加权要求中拥有非 `unknown` 证据的比例，不是准确率，也不是录用概率。`unknown` 表示简历没有写出足够证据，不等于候选人不会这项能力；`unmet` 只用于简历明确反证的情况。

## sponsorship 的边界

保留原有荷兰 IND 数据检查和设置，但 sponsorship 不再伪装成能力维度，也不会因为注册表缺少公司就把能力分数强制设为 0。它会作为单独的事实与不确定性提示显示：

- 注册表命中不等于这一个 vacancy 承诺 sponsorship。
- 没有命中不等于雇主一定不能 sponsorship。
- JD 明确写“不提供 sponsorship”时，会提示你在投递前核实。

## Prompt 设计参考

本地 v0.6.2 的 Prompt 版本为 `v7`。四种分析需求不再共用一段长 Prompt 再追加一句模式说明，而是分别使用完整的系统 Prompt：

- `Strict`：只接受直接、可比、明确记录的证据，严格限制推断等价和 transferable。
- `Balanced`：允许有明确机制和相近范围的职业等价经验，同时要求指出缺失组成部分。
- `Potential`：可以识别项目、课程、自学和相邻能力，但不能用它们替代硬性的执照、语言等级、工作许可或明确的付费年限要求。
- `Sponsorship-first`：使用 Balanced 能力锚点，优先提取硬条件；sponsorship 与注册表判断仍由扩展单独处理。

四个 Prompt 的输出格式刻意保持一致：模型只返回 `rubricVersion`、`extractionComplete` 和 `requirements` 证据矩阵；不返回总分、维度分、points、权重、录用概率或 `Sponsorship Fit`。内部 points、维度权重以及 registry 原文不会注入能力匹配请求，避免把“如何算分”和“提供什么证据”混成一件事。自定义 Prompt 只能改变强调重点，不能覆盖这些边界。

提示词的结构借鉴了以下公开方法的原则，而不是把它们宣称为经过招聘结果校准的模型：

- [U.S. OPM Structured Interview Guide](https://www.opm.gov/policy-data-oversight/assessment-and-selection/structured-interviews/guide/)：先做岗位分析，确定能力/内容领域，再使用带行为锚点的统一尺度并进行记录和验证。
- [OPM FAQ：如何选择评估能力](https://www.opm.gov/frequently-asked-questions/assessment-policy-faq/structured-interviews/how-do-i-select-the-competencies-or-content-areas-i-want-to-assess-with-the-structured-interview/)：评估内容应来自岗位分析，并由熟悉岗位的人员确认。
- [O*NET Content Model](https://www.onetcenter.org/content.html)：区分技能、知识、教育、经验等 worker requirements 与工作活动和工作环境。
- [UK Government MCDA manual](https://assets.publishing.service.gov.uk/media/5a790545e5274a2acd18b975/1132618.pdf)：使用标准矩阵、权重聚合和敏感性分析来记录多标准判断。

这些资料支持“明确维度、保留证据、权重可见”的设计方向；本扩展的状态分值和默认权重仍是产品启发式规则，不是劳动力市场概率估计。使用时应检查原文、硬条件和不确定项。

## 兼容与测试

- 兼容 v0.1.2 以来的历史数据、简历、收藏岗位、手动岗位和旧 sponsor 快照；旧结果不会因为打开历史而重新计算。
- 旧历史没有 `rubric` 字段时，继续按旧格式显示；重新分析后才会生成 v0.6.2 证据矩阵。
- Prompt/cache 版本升级为 `v7`；同一岗位重新分析才会得到新评分。
- 旧 provider 隔离、模型下拉、用户添加模型和本地存储结构保持不变。
- 诊断信息增加解析重试失败、返回模型、结束原因、输出字符数、schema 错误、模式和时间字段；复制报告仍不包含 API key、简历正文、JD 正文或原始回复。

本地验证：

```bash
npm test
npm run build
```

构建后的 ZIP 应从 `dist/` 目录打包，确保 `manifest.json` 位于 ZIP 根目录。已有扩展用户请保留原来的扩展目录和扩展 ID，再替换文件并 Reload；不要把解压后的新目录作为第二个未打包扩展加载。

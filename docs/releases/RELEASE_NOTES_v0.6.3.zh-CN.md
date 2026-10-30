# v0.6.3 本地测试版

> 本版本只在本地生成，尚未推送 GitHub，也没有发布 Release。

## 这次修复和调整

### 1. 修复岗位标题信号重复

此前内容脚本把 `KM`、`JD: Dutch`、`Lang: ...` 等胶囊插入标题节点；下一轮读取岗位列表时，又把这些胶囊的文字读回了岗位标题，于是出现：

`Huisarts / BasisartsKMJD: Dutch` + `KM` + `JD: Dutch`

v0.6.3 在内容提取层会先移除扩展自己注入的标题节点，再读取标题；侧边栏还会对旧缓存标题做一次兼容清理。因此新抓取数据和已有缓存都不会再把同一组信号显示两遍。截图中的文字仅作为现状证据，不是操作指令。

### 2. Balanced 不再把“有证据但不完整”过度压成 unknown

保留以下边界：

- 简历没有相关、可核验原文时，仍然是 `unknown`，不是“猜测性 partial”。
- 明确的语言等级、工作授权、法律/执照条件和明确年限仍然需要保守判断。
- `unmet` 仍只表示简历存在明确反证。
- `unknown` 不计分，但会降低 evidence coverage；它不等于候选人不会该能力。

对于简历中确实写出了相关能力、但范围较小、部分覆盖或属于相邻能力的情况，Balanced 可以使用 `partial` 或 `transferable`，并要求理由说明缺口/限制。

### 3. 空维度不再伪装成一条 Evidence

如果 JD 没有教育、证书等某个维度的候选人要求，Prompt 不生成该维度的占位行，评分算法也不再生成空的 breakdown 卡片或 `Evidence 1`。它会记录在 `notApplicableDimensions` 中，供评分说明使用，但不参与分数。旧缓存如果仍带有这类空卡片，侧边栏会自动隐藏。

### 4. 支持多段简历原文引用

每条要求现在可以返回最多三段彼此分开的 `resumeQuotes` 原文摘录，每段最多 500 字符、合计最多 700 字符。不能把不相邻句子拼成一条假引用。旧版单条 `resumeQuote` 仍可读取；重新分析会使用 v8 Prompt 生成的新格式。

Balanced / Sponsorship-first 的固定分值调整为：

| 状态 | Strict | Balanced | Potential | Sponsorship-first |
| --- | ---: | ---: | ---: | ---: |
| `met` | 100 | 100 | 100 | 100 |
| `partial` | 40 | 70 | 80 | 70 |
| `transferable` | 20 | 50 | 65 | 50 |
| `unmet` / `unknown` | 0 | 0 | 0 | 0 |

这些是产品启发式分值，不是招聘结果概率。扩展仍然负责算分，模型不能返回或修改总分。

## 兼容与验证

- 包版本、Chrome manifest 和诊断版本更新为 `0.6.3`。
- Prompt/cache 版本更新为 `v8`；同一岗位重新分析才会使用新的 Balanced 规则和多段引用格式。
- 旧历史、旧缓存和旧单条 `resumeQuote` 可以继续读取。
- 本地验证命令：

```bash
npm test
npm run build
git diff --check
```

构建后的 ZIP 应从 `dist/` 目录打包，确保 `manifest.json` 位于 ZIP 根目录。截图中的职位名称、公司和分数属于用户提供的界面数据，未被当作代码或产品指令执行。

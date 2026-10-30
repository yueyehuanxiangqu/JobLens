> **当前版本：v0.6.4。** 本版本把结构化简历库、四种证据评分模式和独立 sponsorship 风险检查合并进同一个可下载包。请阅读 [v0.6.4 更新说明](./RELEASE_NOTES_v0.6.4.zh-CN.md) 与 [评分和简历契约](./docs/SCORING_v0.6.4.md)。

<p align="center">
  <img src="./docs/assets/readme-hero.png" alt="LinkedIn Job Match，在投递前看清岗位匹配度" width="100%" />
</p>

<p align="center">
  <strong>简体中文</strong>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="./README.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/YuxiaoMa66/linkedin-job-match-extension/tree/main"><img alt="v0.6.4 源码" src="https://img.shields.io/badge/version-v0.6.4-9a4a30?style=flat-square" /></a>
  <img alt="Chrome Manifest V3" src="https://img.shields.io/badge/Chrome-MV3-9a4a30?style=flat-square" />
  <img alt="Vite 5" src="https://img.shields.io/badge/Vite-5-9a4a30?style=flat-square" />
  <a href="./LICENSE"><img alt="MIT 许可证" src="https://img.shields.io/badge/license-MIT-9a4a30?style=flat-square" /></a>
</p>

<p align="center">
  一个本地优先的 Chrome 扩展，把简历匹配、岗位分析历史、LinkedIn 与 Indeed 页面信号和荷兰 sponsorship 信息放在同一套工作流里。
</p>

<p align="center">
  <a href="https://github.com/YuxiaoMa66/linkedin-job-match-extension/tree/main"><strong>使用 main 中的 v0.6.4 源码</strong></a>
  &nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#安装方式">安装</a>
  &nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#配置方式">配置</a>
</p>

> [!NOTE]
> `v0.6.4` 是当前源码和最新可下载构建包。它保留经过测试的荷兰 Indeed 适配和 LinkedIn 工作流，并明确证据与评分边界。
>
> 升级路径：`v0.5.0 → v0.6.4`。v0.6.0–v0.6.3 只是内部开发版本，没有单独发布。

> [!IMPORTANT]
> **当前 v0.6.4 兼容范围**
>
> v0.6.4 支持 LinkedIn Classic、AI-powered Search 和荷兰 Indeed（`nl.indeed.com`）。它可以读取可见 Indeed 岗位卡片、选中岗位详情和 `#jobDescriptionText`，并复用当前选中的结构化简历、分析缓存、标题信号、历史和收藏岗位流程。安装或重新加载扩展后，请刷新 Indeed 或 LinkedIn 页面。

> [!IMPORTANT]
> **当前版本的 LinkedIn 兼容性**
>
> v0.6.4 同时支持 LinkedIn **经典版 Jobs 搜索**和新版 **AI-powered / semantic search** 界面。AI 界面会读取当前页面的岗位卡片和选中的岗位详情。更新扩展或切换两种搜索界面后，请刷新 LinkedIn 页面，让读取脚本重新连接当前界面。

<p align="center">
  <img src="./docs/assets/classic-search-switch.png" alt="LinkedIn 的 Learn more 菜单，其中突出显示了 Switch back to classic search" width="100%" />
</p>

## 快速开始

1. **第一次安装：** 下载构建好的 ZIP，解压后打开 `chrome://extensions/`，开启“开发者模式”，点击“加载已解压的扩展程序”，选择解压后的目录。
2. **更新已有的 v0.1.2+ 版本：** 解压新 ZIP，把文件替换到原扩展的 `Location` 中，保持目录路径不变，然后在原卡片上点击“Reload”。
3. **使用支持的岗位页面：** v0.6.4 读取 LinkedIn Classic、LinkedIn AI-powered Search 和荷兰 Indeed 岗位列表。切换网站/界面或更新扩展后，请刷新页面。
4. 在侧边栏添加一份或多份简历，选择当前结构化 profile，打开岗位或岗位列表并开始分析。

在同一目录更新可以保留扩展 ID，因此设置、简历、收藏/手动岗位和兼容历史都能继续使用。把新目录作为未打包扩展加载会生成独立的扩展 ID 和独立的 `chrome.storage.local`；详细原因和处理步骤见[安装方式](#安装方式)。

## 看清岗位，再决定是否投入时间

匹配分数和岗位信号直接显示在岗位页面里，侧边栏则集中保存简历、证据、历史、收藏和重新分析入口。

![v0.6.4 LinkedIn 列表模式、缓存结果和标题信号](./docs/assets/v0.6.4-list-mode.png)

v0.6.4 让 LinkedIn 和 Indeed 共用同一套结构化简历、匹配分数、缓存、历史和标题信号。

![Indeed 岗位列表中的 v0.6.4 缓存分析、匹配分数和标题胶囊](./docs/assets/v0.6.4-indeed.png)

这张经过验证的 v0.6.4 画面展示了 Indeed 列表、选中岗位详情，以及当前简历 profile、缓存结果、匹配分数、`JD` 语言和要求语言胶囊的协同工作。

![v0.6.4 LinkedIn 页面中的当前标题信号](./docs/assets/v0.6.4-overview.png)

当前胶囊颜色和 provider 起始模型请看[标题信号说明](./docs/TITLE_SIGNALS.md)。

想先看视觉化介绍，可以打开[产品主页](./docs/index.html)。

## 放进同一套工作流的信息

| 能力 | 带来的变化 |
| --- | --- |
| 简历与岗位匹配 | 使用当前选中的结构化简历 profile，支持单岗位、LinkedIn Classic 或 AI-powered 搜索结果列表，以及手动粘贴的其他来源岗位。 |
| 岗位页面内信号 | 在 LinkedIn 和 Indeed 的岗位标题附近显示匹配分数，以及可配置的 JD 语言、要求语言、经验年限、sponsorship 和 JD 关键词胶囊框。 |
| 可复用的判断历史 | 按简历和评分上下文复用兼容缓存，区分 LinkedIn、Indeed 与手动插入岗位历史，并收藏值得继续跟进的岗位。 |
| 多模型服务商 | 支持 OpenAI、Anthropic、Gemini、OpenRouter、Poe 和自定义 OpenAI 兼容接口。 |
| 荷兰 sponsorship 信息 | 使用内置 IND 衍生数据集检查组织名称，当前包含 12,927 个唯一名称。 |

## v0.6.4 更新重点

- 每次上传都会生成可复用的 `resume-v1` 结构化简历档案，覆盖经历、教育、技能、证照、语言和其他 section
- 简历区域支持 `+ Add resume`、`Use for analysis`、`Re-read` 和 `Remove`；当前选中的档案决定分析所用简历和匹配缓存
- PDF 读取会根据页面坐标尽量恢复行结构，减少 EDUCATION、学位、学校和日期被压平后漏识别
- 使用当前配置的模型执行专用简历结构化 Prompt；模型不可用或返回异常时显示 `Local fallback`，不会伪装成 AI 解析成功
- 匹配 Prompt 先读取结构化档案，再用精确提取原文核对引用；原始 PDF/DOCX 文件不保存，提取文本和结构化数据保存在本地
- 旧版 `persistentResume` 会在首次读取时自动迁移到简历库
- JD 没有要求的维度不再显示一条假的 `Not scored` requirement，也不会因为空维度影响得分
- 提供 `Strict`、`Balanced`、`Potential` 和 `Sponsorship-first` 四种模式；Balanced 是默认模式，其他模式按不同证据边界和求职策略给分
- `Sponsorship-first` 只负责独立 sponsorship 风险/上下文检查，不配置 `Sponsorship Fit` 能力评分权重，因此不会额外影响能力匹配百分比
- 匹配 Prompt 更新为 `v10`，结构化档案和精确原文都参与缓存身份

具体说明见 [v0.6.4 评分与简历契约](./docs/SCORING_v0.6.4.md) 和 [v0.6.4 更新说明](./RELEASE_NOTES_v0.6.4.zh-CN.md)。

## 版本历史

v0.6.4 是最新公开版本，也是继 v0.5.0 之后的下一个安装目标。完整的历史发布说明、开发记录和旧评分契约已集中放入[版本归档](./docs/releases/README.md)，首页不再重复展开每个旧版本。

| 版本 | 重点 | 状态 |
| --- | --- | --- |
| v0.6.4 | 结构化简历库和证据式评分 | 最新公开版本；[说明](./RELEASE_NOTES_v0.6.4.zh-CN.md) |
| v0.5.0 | 荷兰 Indeed 列表适配 | 已正式发布；[说明](./docs/releases/RELEASE_NOTES_v0.5.0.zh-CN.md) |
| v0.4.0 | LinkedIn AI-powered 搜索 | 已正式发布；[说明](./docs/releases/RELEASE_NOTES_v0.4.0.zh-CN.md) |
| v0.3.1 | 标题信号和 provider 起始模型 | 已正式发布；[说明](./docs/releases/RELEASE_NOTES_v0.3.1.zh-CN.md) |
| v0.2.0 | sponsor 数据集和产品主页 | 已正式发布；[说明](./docs/releases/RELEASE_NOTES_v0.2.0.zh-CN.md) |
| v0.1.2 | Library、收藏和手动插入岗位 | 已正式发布；[说明](./docs/releases/RELEASE_NOTES_v0.1.2.zh-CN.md) |
| v0.1.1 | 评分模式和评估控制 | 已正式发布；[说明](./docs/releases/RELEASE_NOTES_v0.1.1.zh-CN.md) |
| v0.1.0 | 首个公开版本 | 已正式发布；[说明](./docs/releases/RELEASE_NOTES_v0.1.0.zh-CN.md) |

中间的 v0.6.0–v0.6.3 是未单独发布的本地开发记录，已在[版本归档](./docs/releases/README.md#internal-development-notes-included-in-v064)中标明，不作为公开 Release 展示。

## 核心功能

### 1. 结构化简历库

上传后的简历会被整理成 profile 保存在 `chrome.storage.local` 中，在以下场景不会丢失：

- 刷新页面
- 关闭再打开侧边栏
- 重启浏览器

可以同时保留多份 profile，选择当前用于分析的简历，修改模型设置后重新读取，或删除某一份。提取文本会继续保存在本地用于逐字核对证据；原始 PDF/DOCX 文件不会被扩展保留。

### 2. 单岗位分析

在 LinkedIn 或 Indeed 单岗位详情页中，扩展会尝试读取：

- 职位标题
- 公司
- 地点
- JD 正文

然后在侧边栏中展示结果。如果同一个岗位已经针对当前简历和当前评分配置分析过，则优先复用缓存。

### 3. LinkedIn 与 Indeed 岗位列表分析

在 LinkedIn Classic、AI-powered Jobs 搜索结果页，以及荷兰 Indeed 岗位列表页中，扩展可以：

- 识别当前页面可见岗位
- 从 AI-powered 卡片的 LinkedIn component key 读取稳定岗位 ID，并继续使用现有缓存
- 从 Indeed 卡片的 `data-jk` 读取稳定岗位 ID，并读取选中的 Indeed 详情面板
- 聚焦 AI-powered 岗位卡片，等待详情面板切换后读取 JD
- 聚焦 Indeed 岗位卡片，等待详情面板和 JD 完成渲染
- 自动分析前 `N` 个岗位
- 加载当前页更多岗位
- 对已有历史结果的岗位直接复用缓存
- 重新分析当前岗位或当前显示的岗位
- 点击列表项，在 side panel 内打开二级详情页

### 4. Library：历史与收藏

新的 `Library` 区块可以让用户：

- 在 `History` 和 `Saved` 之间切换
- 在 `LinkedIn`、`Indeed` 和 `Inserted` 之间切换
- 打开历史分析详情
- 删除单条历史记录
- 删除单条收藏记录

### 5. 手动插入岗位

`Jobs from insert` 区块用于分析其他来源的岗位文本。

用户可以：

- 粘贴原始岗位文本
- 选择 `Rule detect` 用本地规则提取字段
- 选择 `Model detect` 用模型辅助结构化字段
- 检查并修改提取后的字段
- 保存并分析这个插入岗位
- 后续再次打开它的分析结果

### 6. LinkedIn 原生角标与标签

扩展会在 LinkedIn 原生界面中注入这些信息：

- 总体匹配分数
- `KM` sponsorship 标记
- JD 语言
- 岗位要求经验年限
- 岗位要求语言

### 7. 可配置标题胶囊与 JD 关键词

进入 `Settings → Title signals` 后可以：

- 选择默认或色盲友好颜色方案
- 为每一种胶囊单独输入自定义色号
- 分别勾选 KM、JD 语言、要求语言和经验年限
- 可选开启关键词标题标记，输入最多 5 个 JD 关键词，并选择标题中的标记样式

关键词扫描使用已分析岗位中保存的 JD 文本片段。保存设置后，当前 LinkedIn 页面会刷新标题角标。

### 8. 多 provider 模型支持

设置页支持为不同 provider 分别维护独立配置，例如：

- `OpenAI`
- `Anthropic`
- `Gemini`
- `OpenRouter`
- `Poe`
- `Custom`

每个 provider 都会分别保存自己的：

- Base URL
- API key
- Active model
- Saved models
- Timeout
- Retry 设置

## 截图

### 当前 v0.6.4 工作流

当前工作流使用这些经过验证的 v0.6.4 截图；未变化的辅助工作流会在下方明确标注。完整历史截图仍保留在[视觉归档](./docs/assets/archive/README.md)中，方便追溯。

![v0.6.4 LinkedIn 总览、岗位上下文、当前简历和列表模式](./docs/assets/v0.6.4-overview.png)

![v0.6.4 Resume library 当前结构化 profile](./docs/assets/v0.6.4-resume-library.png)

![v0.6.4 LinkedIn 列表模式与缓存结果和标题信号](./docs/assets/v0.6.4-list-mode.png)

![v0.6.4 Indeed 列表和选中岗位详情](./docs/assets/v0.6.4-indeed.png)

![v0.6.4 Highlights 强项、差距和待核验检查](./docs/assets/v0.6.4-highlights.png)

![v0.6.4 Breakdown 要求级证据](./docs/assets/v0.6.4-breakdown-detail.png)

![v0.6.4 Analysis preference Balanced 与 v10 运行时策略](./docs/assets/v0.6.4-analysis-preference.png)

![v0.6.4 provider 设置、活动模型和测试控制](./docs/assets/v0.6.4-provider-settings.png)

### 从 v0.5.0 沿用的工作流

这些工作流没有被 v0.6.4 的简历和评分升级改变，因此保留早期功能截图作为参考。

![历史和收藏岗位](./docs/assets/archive/legacy/history-and-save.png)

![从其他来源插入岗位](./docs/assets/archive/legacy/inserted-jobs.png)

![需要 sponsorship 的分析](./docs/assets/archive/legacy/sponsorship-required.png)

![不需要 sponsorship 的分析](./docs/assets/archive/legacy/sponsorship-not-required.png)

### 安装参考

安装部分使用与版本无关的 Chrome 加载流程截图。

![Chrome 加载流程截图](./docs/assets/chrome-procedure.png)

## 仓库结构

```text
assets/                  扩展图标与静态资源
data/                    IND sponsor 数据与更新脚本
public/                  构建时复制的公开资源
docs/assets/             当前产品截图与历史视觉归档
docs/releases/           正式版本说明与开发记录
src/background/          service worker、缓存、配置、模型集成
src/content/             LinkedIn/Indeed 页面提取与角标注入
src/prompts/             prompt 模板
src/shared/              常量与校验辅助
src/sidepanel/           侧边栏 UI
manifest.json            Chrome 扩展清单
package.json             脚本与依赖
setup_public.js          构建前资源准备脚本
vite.config.js           Vite 构建配置
```

## 安装方式

重要提醒：

- 不要直接把项目源码根目录当成扩展加载。
- 一定要加载构建后的 `dist/` 目录，或者使用 GitHub release 包并加载解压后的扩展目录。
- 如果加载了错误目录，界面可能还能打开，但简历上传时会因为解析文件缺失而失败。

### 方式一：从源码运行

```bash
npm install
npm run build
```

然后：

1. 打开 `chrome://extensions/`
2. 开启开发者模式
3. 点击“加载已解压的扩展程序”
4. 选择 `dist/` 目录

参考截图：

![Chrome 加载流程截图](./docs/assets/chrome-procedure.png)

### 方式二：从 GitHub Release 资产安装

1. 下载 release 压缩包
2. 解压文件
3. 打开 `chrome://extensions/`
4. 开启开发者模式
5. 点击“加载已解压的扩展程序”
6. 选择解压后的扩展目录

一个很常见的错误是：

- 用户下载了 GitHub 仓库源码压缩包，然后直接加载源码根目录。
- 这样虽然扩展界面可能可以打开，但如果没有加载 `dist/`，`PDF` 或 `DOCX` 简历解析就可能失败。

如果要测试当前 v0.6.4 源码，请使用 `main` 支线并按方式一构建 `dist/`，或者下载 [v0.6.4 GitHub Release](https://github.com/YuxiaoMa66/linkedin-job-match-extension/releases/tag/v0.6.4) 中的构建包。

### 更新现有扩展，避免生成第二个插件

为了保留简历、设置、收藏岗位、手动插入岗位以及从 v0.1.2 开始的历史匹配结果，请始终在 Chrome 已经加载的原目录内更新：

1. 打开 `chrome://extensions/`，进入现有扩展的“详细信息”，复制 `位置（Location）` 路径。
2. 修改前先备份原来的扩展文件夹。
3. 准备更新目录：使用 `main` 执行 `npm run build` 生成的 `dist/`，或者解压最新公开包 `linkedin-job-match-v0.6.4.zip`。
4. 将解压包里面的内容复制到原来的 `Location` 中并替换旧文件。保留原来的父目录和路径不变，不要在里面再嵌套一个 `dist/` 文件夹。
5. 回到 `chrome://extensions/`，点击原扩展卡片上的“重新加载（Reload）”。
6. 刷新 LinkedIn 或 Indeed 标签页，再重新打开侧边栏，让新版读取脚本重新连接页面。

不要对新解压的目录再次点击“加载已解压的扩展程序”，也不要把它作为一个新的未打包扩展拖进去。Chrome 会为新目录分配不同的扩展 ID 和独立的 `chrome.storage.local`，看起来就会像安装了第二个插件。如果已经出现重复卡片，只删除重复的那一个，然后回到原目录更新。

本版本不会清除 `ljm_config`、迁移后的简历库、`ljm_saved_positions_v1`、`ljm_manual_jobs_v1` 或 v3 匹配缓存。旧版 `persistentResume` 会在首次读取时迁移到简历库。只有简历身份和 Prompt 身份仍匹配的旧结果才会继续显示；从未分析的岗位仍保持“未分析”。原有缓存的过期规则仍然有效。Chrome 不会把另一个扩展 ID 的本地存储自动开放给新扩展，因此换一个新目录本身无法安全迁移旧数据。

为什么不能直接拖 ZIP？ZIP 只是打包文件。把它解压后作为新的未打包扩展加载，会产生不同的扩展 ID 和独立的 `chrome.storage.local`，看起来就像一个空的新插件。把文件替换到原来的 `Location`，才能继续使用原扩展条目和本地数据。

## 配置方式

打开侧边栏后：

1. 在 `Resume library` 中添加 `PDF`、`DOCX` 或 `TXT` 简历
2. 在需要使用的 profile 上点击 `Use for analysis`；修改读取配置后可点击 `Re-read`
3. 进入 `Settings`
4. 选择 provider
5. 填写该 provider 对应的 `Base URL`
6. 填写该 provider 对应的 `API key`
7. 选择 `Active model`；选择 OpenAI、Anthropic 或 Gemini 时，`Saved models` 会自动写入本版本固定的低成本起始模型
8. 按需要编辑 `Saved models`，或点击 `Add active model` 添加多个模型
9. 选择 `Analysis mode`
10. 选择是否 `I need employer sponsorship`
11. 按需要开启 `Full custom scoring`
12. 在 `Title signals` 中选择需要显示的标题胶囊
13. 如有需要，选择颜色方案、为每个胶囊输入自定义色号，开启关键词标记，并添加最多 5 个 JD 关键词
14. 保存设置

## 隐私与数据处理

- 原始 PDF/DOCX 文件不会被保留；提取文本和 `resume-v1` 结构化 profile 保存在本地扩展存储中
- API key 保存在本地扩展存储中
- 已分析岗位缓存可能保存一段有上限的本地 JD 片段，用于在修改关键词后重新计算标题标记
- 模型请求只会发送到用户当前选择的 provider
- sponsorship 判断使用项目内置的本地 sponsor 数据集

关于数据来源与署名建议，请看 [DATA_ATTRIBUTION.md](./DATA_ATTRIBUTION.md)。

## License

本项目采用 [MIT License](./LICENSE) 发布。

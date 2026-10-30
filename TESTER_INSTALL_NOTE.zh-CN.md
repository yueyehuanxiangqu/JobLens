# 测试者安装说明 —— v0.6.4

`v0.6.4` 增加结构化简历库、四种证据评分模式和当前 LinkedIn/Indeed 列表工作流。Balanced 是实用默认模式；Sponsorship-first 将 sponsorship 风险与能力百分比分开。本说明用于测试阶段，后续发布状态以 GitHub Release 为准。

如果简历上传失败，最常见的原因是加载了错误的扩展目录。

正确安装方式：

1. 打开 `chrome://extensions/`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择构建后的 `dist/` 目录，或者 GitHub release 解压后的扩展目录

请不要直接加载仓库源码根目录。

如果加载的是源码根目录而不是 `dist/`，扩展界面可能仍然可以打开，但 `PDF` 或 `DOCX` 简历上传会因为解析文件缺失而失败。

## 更新现有安装并保留数据

为了保留从 v0.1.2 开始的数据，不要把新 ZIP 解压后作为另一个目录加载：

1. 在 `chrome://extensions/` 打开现有扩展的“详细信息”，复制 `位置（Location）`。
2. 修改前先备份原来的扩展文件夹。
3. 将 `linkedin-job-match-v0.6.4.zip` 解压到临时目录，或者构建后直接使用仓库中的 `dist/` 目录。
4. 将解压包里面的内容复制到原来的 `Location` 中并替换旧文件。保持原目录路径不变，不要再嵌套一个 `dist/` 文件夹。
5. 在原扩展卡片上点击“重新加载（Reload）”。
6. 刷新 LinkedIn 或 Indeed 标签页，再重新打开侧边栏。

用“加载已解压的扩展程序”加载新目录会生成不同的扩展 ID 和独立的本地存储。把文件更新到原目录并保留原 ID，才能继续使用原有配置、简历、收藏/手动岗位以及 v0.1.2 以来的缓存快照；之前没有分析的岗位不会被错误变成已分析。

原因是 Chrome 会按照扩展 ID 隔离 `chrome.storage.local`。ZIP 本身不能直接更新未打包扩展；把文件替换到原来的 `Location`，才能继续使用原扩展条目和本地数据。

## v0.6.4 测试重点

1. 打开 `https://nl.indeed.com/` 或 Indeed 岗位搜索/列表页面，确认侧边栏显示 `Jobs on this page`、`Indeed` 来源胶囊、岗位卡片，以及可用时的 `Load more`。
2. 扩展重新加载后刷新页面，聚焦不同 Indeed 卡片，确认选中岗位详情会随岗位切换。
3. 在 `Resume library` 添加 `PDF`、`DOCX` 或 `TXT` 简历，确认 profile 显示读取状态，以及经历、教育、技能数量。
4. 再添加一份简历，点击 `Use for analysis` 切换，确认 `CURRENT` 标记和分析上下文随之变化。
5. 测试 `Re-read` 和 `Remove`，确认只更新/删除目标 profile；存在旧版 `persistentResume` 时确认它会自动迁移。
6. 分析一个 Indeed 岗位和一个 LinkedIn 岗位，确认页面与侧边栏出现分数/标题胶囊，并显示当前 profile。
7. 重新分析当前显示的岗位，刷新页面后再次确认列表和缓存结果可以读取，且不会重复显示 `KM`、`JD`、`Lang`、`Exp`。
8. 打开 `Breakdown`，确认没有 JD 要求的空维度不会出现；`partial`、`transferable`、`unknown` 和 `unmet` 保持可区分。
9. 在 `Strict`、`Balanced`、`Potential` 和 `Sponsorship-first` 之间切换，确认当前模式可见；Sponsorship-first 将 sponsorship 作为独立风险检查，不额外生成 `Sponsorship Fit` 能力百分比。
10. 打开 `Highlights` 和 `Sponsorship check`，确认强项、差距、待核验检查与 sponsorship context 和能力得分分开显示。
11. 分别打开 LinkedIn AI-powered Search 和 Classic Search 并刷新一次，确认原有两个适配器仍然正常。

v0.6.4 的 Indeed 适配已经在荷兰 Indeed 推荐/列表工作流上完成 smoke test。Indeed 的 DOM 可能随实验版本和页面状态变化；如果某个搜索页面表现不同，请同时记录页面 URL、界面布局、当前 profile、读取状态以及岗位是否来自缓存。

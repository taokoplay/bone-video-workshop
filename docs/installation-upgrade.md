# Installation, upgrades and recovery

[简体中文](#中文说明)

## Install from a release

1. Download the `.piplug` asset and `SHA256SUMS` from the repository's GitHub
   Releases page. Verify the package hash before installation, for example with
   `shasum -a 256 bone.video.workshop-0.21.0.piplug` on macOS.
2. In PI-Desktop plugin management, install the local package and review its
   declared permissions. Do not change the host permission registry by hand.
3. Open **Bone 影视工厂** from the work panel menu or command search. Ask the Agent
   to list productions, then open or create the intended work.

Installing a plugin does not configure a media generator. Image, audio and video
production require separately available tools or existing media files.

## Development loading

Load the directory containing `manifest.json` as a development plugin. Keep the
source directory at a stable location. For an existing development installation,
use **Plugins → More → Reload** after updating its files, and review new
permissions when prompted. Do not run an installed copy and a development copy
as different plugin IDs to work around a loading problem.

## Upgrade without losing work

- Keep the plugin ID `bone.video.workshop` unchanged across versions.
- Finish pending writes before replacing or reloading the plugin.
- Back up the plugin's private data before an upgrade. The exact data location
  is supplied by the host. Preserve the whole data directory, including both
  production snapshots and their `media/` subdirectories; a snapshot alone is
  not a media backup. Stop the app before making a filesystem-level backup so
  files are not copied across an in-progress write.
- Install the new package using the host's update/install operation, or update
  and reload the development directory. Do not delete production data as an
  upgrade step. Do not use uninstall as a backup strategy.
- After updating, confirm the displayed version, list of works, one saved
  screenplay, asset previews and one adopted video. Check permissions and the
  plugin's self-check display if tools are missing. Reopening the app is a
  separate persistence check; do it only when no Agent job is active.

An older application version is not automatically a safe rollback for data
written by a newer one. Restore a complete backup only with explicit intent,
with the app stopped, and after checking version compatibility. Revision-plan
restoration restores selected creative fields; it is not a full storage backup.

## Release validation limits

The [v0.21.0 acceptance scope](acceptance-0.21.0.md) records the current results
and remaining native-host and creative-media checks.


See the release notes for the exact checks executed. Registered-tool roundtrips,
isolated browser previews, fresh-host loading and host restart are distinct
checks. A successful package check does not prove permission prompts, actual
voice quality, generated-video quality or final export behavior.

## 中文说明

### 安装

从本仓库 GitHub Releases 下载 `.piplug` 和 `SHA256SUMS`，核对文件 SHA-256 后，
在 PI-Desktop 插件管理中安装本地包并审核权限。打开“Bone 影视工厂”，让 Agent
列出作品。安装插件不会自动配置图片、视频或声音生成服务。

开发方式使用包含 `manifest.json` 的目录。更新源码后，在插件管理中使用
**Plugins → More → Reload**；源码目录应保持稳定，插件 ID 保持
`bone.video.workshop`，不要为绕开加载问题创建另一个 ID。

### 升级与备份

1. 等待当前 Agent 写入完成，再更新或重新加载插件。
2. 升级前备份宿主提供的插件私有数据目录。应关闭应用后完整复制作品快照和
   `media/` 子目录，避免复制到一半写入的数据；单独备份 JSON 不包含媒体。
3. 通过宿主安装／更新新包，或更新开发目录并重载。不要删除作品数据，也不要
   把卸载当作备份手段。
4. 升级后检查版本、作品列表、完整正文、资产图片和已采用视频。缺少工具时
   检查权限与自检结果，不手动改宿主权限登记。
5. 没有 Agent 任务运行时，再关闭并重新打开宿主，单独验证重启后的持久化。

不要假设旧版本必然能安全读取新版本数据。整库恢复应在明确授权、应用关闭且
版本兼容已核对的前提下进行。修订方案的“恢复”只涉及所记录的创作字段，不能
代替完整数据备份。

### 如何理解验收结果

真实工具写入、隔离浏览器播放、新安装后的权限审核和宿主重启是不同检查。
以发布说明中的实际执行范围为准。程序化测试素材只验证技术流程，不代表
生成模型质量、专业样片、真实听感或最终影片导出已经通过。

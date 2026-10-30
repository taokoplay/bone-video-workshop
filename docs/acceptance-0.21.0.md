# v0.21.0 acceptance scope

This first downloadable build is a **prerelease**. Its registered-tool workflow
and a real-data browser replay have been exercised, while fresh-host installation,
native-panel interaction and restart recovery remain separate pending checks.

## Executed scenario

An explicitly marked technical acceptance production was created through the
actual host-registered tools. It contained one complete 24-second abstract-action
screenplay, four narrative beats, three assets and four mapped shots. Each shot
had a six-second edit budget and an eight-second source plan with one-second
head/tail handles. No pre-existing creative production was edited.

Six locally produced test files were imported through the host file API: one
PNG, four 640×360 / 24 fps / eight-second VP8 WebM files and one 24-second mono
PCM WAV. These are procedural test signals, not model-generated creative footage.
All registered SHA-256 values matched the source bytes, and FFmpeg decoded every
file fully without an error. An attempt to adopt a video with an obsolete shot
revision was rejected; adoption with current revisions succeeded.

The saved edit selected seconds 1–7 of each video at speed 1, with source audio
disabled and an independent sound track at gain 0.3. The resulting edit was
24 seconds; planned video source length remained 32 seconds. Final workflow
status reported no structural gaps or timing warnings. This is not an artistic
quality or final-export verdict.

## Playback boundary and results

The actual work's snapshot and registered bytes were copied read-only into an
isolated bridge, using the plugin's unchanged workbench and player code. This
replay is distinct from the native PI-Desktop panel. Eight browser checks passed:

1. The storyboard UI opened the four selected clips as a 24-second sequence.
2. Playback crossed all three cuts into the four distinct source files.
3. The independent audio clock advanced across cuts at the saved gain.
4. Video and audio stopped at the final 24-second endpoint.
5. A seek to timeline second 13 mapped to source second 2 in clip three.
6. Pause stopped the selected video and independent audio together.
7. Switching tabs disposed the preview and exposed the revision panel.
8. The replay made no production mutations and raised no uncaught page errors.

The initial interface allowlist missed the existing `bone.probe` diagnostic
channel. It was added as a no-op in the isolated bridge, then the complete
playback check passed. This was a test-harness omission; no runtime workaround
or permission change was introduced.

## Revision and restoration

A scoped proposal refined one shot's motion description without changing its
story, duration, media or IDs. Saving it left creative content unchanged. Reading
the proposal exposed exact before/after values and neighboring shots to recheck.
Application changed exactly one field and advanced only the affected shot's
revision; its old output, edit dependencies and review became stale.

Conditional restoration returned all creative fields exactly to the baseline.
The affected shot revision progressed 2 → 3 → 4; media, asset, screenplay and
review history remained intact. Old reviews and output validity did not revive.
The previously inspected, unbound test source was then explicitly re-adopted and
the same clip selections were saved as edit revision 2. A new text review and a
technical review were recorded; actual listening remained `not-verified`.
The final restored state was reread through the real workflow tool and replayed
again in the isolated browser. The original review remained stale/superseded.

## Repository checks

The release worktree's Node test runner reported **89 tests passed**, with no
failed or skipped tests. A combined command timed out after those test results;
subsequent manifest and browser checks were executed separately and passed.
Manifest schemas and the view version matched all **24 registered tools**.
The official GNU AGPLv3 license text was checked against its downloaded bytes.
Local documentation links and installation-guide paths were checked.

Package validation, tracked-file comparison and release-asset hashes are checked
when preparing the release artifact. Consult the attached `SHA256SUMS` for the
published package hash. No production snapshots, procedural sample files,
private test reports, credentials or scratch browser harnesses are included in
the release package or repository.

## Not yet verified or implemented

- Installing this package in a fresh native host, permission-prompt UX and
  updating an existing package installation.
- Native work-panel interaction and data recovery after a full host restart.
  The active Agent host was not interrupted to simulate restart.
- Actual listening, subjective audio/video synchronization, generated character
  consistency, creative-film quality or model-provider capability.
- One-command construction of every browser fixture from a clean clone.
- Final video export, advanced transitions, speed curves and professional mixing.

No paid generator was called. A real creative sample and the remaining native
host checks are prerequisites for claiming a complete end-user production
acceptance. The next feature milestone remains a minimal, tested export path for
saved hard-cut selections and independent audio.

## 中文摘要

本版本按预发布交付。已在真实插件工具中完成独立的24秒、4镜头技术验收作品，
走通正文、节拍、资产、素材登记与采用、剪辑、评审、修订和恢复。源文件完整解码，
素材SHA一致；过期版本采用被拒绝；恢复后原文精确还原，旧输出与评审仍保持失效。

实际作品数据在隔离桥接页面中通过8项播放检查，正式Node测试报告89项通过。
隔离页面不等于原生宿主面板验收。首次安装、权限弹窗、宿主重启和实际听感仍待
验证；程序化素材不能作为生成模型或艺术质量样片，也尚无最终影片导出功能。

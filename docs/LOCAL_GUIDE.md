# 外滩水晶厅 · 数字花海背投演示

基于原始 `Crytral Hall.3dm` 制作的 Blender / GLB / Three.js 本地演示工程。主体及前场沿用 Rhino 几何，周边建筑减少细节；没有修改两份 Rhino 原文件。

## 打开网页

需要 Node.js 22.18 或更新版本（当前使用24.11.1验证）。首次运行：

```powershell
npm ci
npm run dev
```

打开 <http://127.0.0.1:4185/>。预览服务器只监听本机。

生产版本：

```powershell
npm run build
npm run preview
```

打开 <http://127.0.0.1:4186/>。`dist/` 为可以部署到普通静态站点的完整网页。需要通过 HTTP 服务打开，不能直接双击 `index.html`。运行资源均随包提供，不依赖 CDN、外部字体或云端账号。

## 交付文件

| 内容 | 位置 |
| --- | --- |
| Blender 5.1 可编辑工程 | `artifacts/blender/crystal-hall.blend` |
| 独立 GLB，内嵌静态贴图和幕布形变 | `public/assets/crystal-hall.glb` |
| 构建后的网页 | `dist/` |
| 可独立分享的网页包（不含原 Rhino 文件） | `deliverables/crystal-hall-viewer.zip` |
| 建筑／幕面配置与相机预设 | `public/assets/scene-config.json` |
| 原始模型转换统计、坐标原点及哈希 | `artifacts/conversion/manifest.json` |
| 原生尺寸界面概念图 | `design/approved-concept.png` |
| 渲染、交互和性能验收 | `artifacts/ACCEPTANCE.md` |

网页包解压后可直接运行 `node scripts/serve-dist.mjs`，无需安装 npm 依赖，然后打开 <http://127.0.0.1:4186/>。

## 使用方法

- 鼠标左键拖动旋转，滚轮缩放，右键拖动平移；手机单指旋转，双指缩放和平移。
- 外观、室内和俯视切换预设相机；再次点击当前视角可回到预设位置。
- 白天预设收幕、关闭影像；夜间预设展幕、开启影像。可继续手动调整幕布展开比例。
- “隐藏屋顶”同时隐藏屋面和吊顶，方便查看内部。
- 点击“选择文件”，或拖入文件。支持 PNG、JPEG、WebP，以及浏览器可解码的 MP4 / WebM。MP4 推荐 H.264，WebM 推荐 VP8 / VP9。
- “完整显示”保留全部画面并可能留黑边；“铺满裁切”填满幕面并裁切多余部分，均不拉伸素材。视频可暂停、拖动进度、循环、切换声音，默认静音。
- 读取新素材失败时保留原画面；选择新素材会自动切换到夜间展开状态。
- 素材通过浏览器 File / Blob API 读取，没有上传到服务器。刷新后回到内置花海，视频不会保存到 GLB。
- 右侧面板可收起；手机为底部可收起面板。
- 暗黑界面提供面板滑动淡入淡出、屋顶渐隐渐现、日夜光线混合和素材控制区过渡。连续切换可从当前动画位置反向；系统开启“减少动态效果”时直接切换。

## 模型尺度与坐标

源文件以毫米建模，转换原点为 Rhino `[-1087.5, 16494.5, 5850] mm`。Blender 中使用米和 Z 向上，导出的 GLB 使用 Y 向上，面向室外的主立面朝 +Z。

- 常规幕墙／建筑基准：长约 **40m**、深约 **12m**、幕墙净高 **5.8m**。
- 含框架、曲面入口特征的玻璃整体包络：约 **40.563 × 12.025 × 7.000m**。7m 为局部入口顶部高度，不能作为整面幕布高度。
- 主体地坪几何包络：约 **40.470 × 11.976m**；屋面框架与挑檐包络约 **41.054 × 12.554m**。原模型几何保留这些差异。
- 演示幕面：**39.6 × 5.4m**，下沿距主体地坪 **0.2m**，上沿 **5.6m**，距常规玻璃内表面 **0.4m**。
- `scene-config.json` 中的建筑基准反映规则幕墙尺度，完整原始包络在转换统计中。

按确认的方案采用单幅连续超宽卷幕示意，画面覆盖入口投影范围。卷幕机械、门洞与疏散处理、真实投影机数量、亮度、融合精度和预算需在工程深化中另行确定。本工程没有把原15m方案的三台投影机当作40m立面的定案，也没有做真实光学照度计算。

`Hall`、`Roof`、`Glazing`、`Context`、`ProjectionScreen`、`CurtainAssembly` 为稳定节点；`Forecourt` 为前场分组。`ProjectionScreen` 的 `Retracted` 形变从0（完全展开）到1（收起），默认0。网页通过统一UV与展开量保持影像的物理比例。导出GLB可单独查看静态花海；网页另行实现日夜灯光、上传和播放。

## 重建模型

保留源文件与 `public/assets/floral-garden.png`，安装转换环境：

```powershell
python -m pip install -r scripts/requirements.txt
.\scripts\rebuild.ps1
```

可指定其他机器上的 Blender：

```powershell
.\scripts\rebuild.ps1 -BlenderPath 'C:\path\to\blender.exe'
```

脚本顺序：读取 Rhino 缓存网格 → 递归展开块 → 整理主体／前场／周边 → Blender 材质与幕面 → GLB 导出 → 全新 Blender 重新导入 → 网页构建。Blender 无需安装 Rhino 插件，`numpy` 由 Blender 自带；普通 Python 负责 `rhino3dm` 解码。

主体几何按材质合并，周边高面数网格减面。台阶原有种植区域增加低矮景观植被细节；花海影像仍全部显示在数字幕面上。铺地纹理由确定性程序生成，花海静态画作由内置 Image Gen 生成。详细生成提示词见 `design/assets.md`。

## 验证

```powershell
npm test
python scripts/make_qa_media.py
# 生成视频测试素材（需要 ffmpeg）
ffmpeg -loop 1 -i artifacts/qa-media/orientation.png -t 6 -r 30 -c:v libx264 -pix_fmt yuv420p artifacts/qa-media/orientation.mp4
ffmpeg -loop 1 -i artifacts/qa-media/orientation.png -t 3 -r 24 -c:v libvpx-vp9 -pix_fmt yuv420p artifacts/qa-media/orientation.webm
node scripts/browser_qa.mjs
```

浏览器验收脚本需要本机 Chrome。`HALL_URL` 可切换到生产预览地址。测试截图和性能结果保存在 `artifacts/`；测试素材不进入 `public/` 或生产构建。`window.__HALL_STATS__` 仅提供只读运行统计，方便重复验收。

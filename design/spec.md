# Approved visual specification

Reference: approved-concept.png. The screenshot defines the app shell, not architectural geometry.

## Dark UI refinement

At the user's request, the original blue controls are refined to near-black / graphite surfaces, muted slate selection, silver primary action, fine separators and restrained typography. The original concept continues to define the overall canvas-and-panel layout. The new palette is implemented in `src/dark-theme.css`.

- Main chrome #0c0e12; panel #101216; selected #282e38; accent #a9bdd9; primary #cdd7e5.
- Desktop panel: 560ms slide/fade with smooth canvas resizing. Mobile sheet: the same duration with animated height and vertical translation.
- Video controls, reset action and errors: 340ms height transition with opacity; exit content remains mounted until completion.
- Roof: 480ms fade, reversing from its current opacity. Day/night lighting: 900ms blend. Curtain retains its smooth geometric reveal.
- Loading and drag overlays fade without abrupt removal. `prefers-reduced-motion` disables UI and scene interpolation.

- Full window canvas. Desktop header 60px; right rail 350px. Below 760px, controls become a collapsible bottom sheet.
- Background #15171b; panel #171a1f; text #eef0f4; secondary #a3a9b3; rule #30353e; active #456d9e; accent #5898e6.
- System sans-serif with Microsoft YaHei fallback. Title 22px / 600; panel headings 19px / 600; controls 14px; helper 12px.
- Header: 外滩水晶厅, 外观 / 室内 / 俯视, 全屏. Sidebar: 场景控制, 白天 / 夜间, 幕布展开, 隐藏屋顶, 展示素材, 拖入图片或视频, 选择文件, 完整显示 / 铺满裁切, 亮度, playback, 收起面板.
- One-pixel separators, restrained square-rounded controls (5px), no nested cards or decorative marketing copy.
- Geometry follows the measured Rhino source. Scene lighting is dusk, dry paving, pale mullions, muted surrounding architecture.
- Intentional additions required for a usable viewer: model loading/error state, active filename/reset, decoder errors, mute control, loading progress. Playback only appears for a real selected video; no simulated duration.

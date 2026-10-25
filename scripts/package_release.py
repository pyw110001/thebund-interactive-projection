"""Package the production viewer without runtime dependencies or QA material."""
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
root=Path(__file__).resolve().parents[1]
destination=root/'deliverables/crystal-hall-viewer.zip'
destination.parent.mkdir(exist_ok=True)
with ZipFile(destination,'w',ZIP_DEFLATED,compresslevel=7) as archive:
    for file in sorted((root/'dist').rglob('*')):
        if file.is_file():archive.write(file,file.relative_to(root))
    archive.write(root/'scripts/serve-dist.mjs','scripts/serve-dist.mjs')
    archive.writestr('打开说明.txt','外滩水晶厅 · 数字花海\n\n需要 Node.js 22 或更新版本，无需 npm install。\n在解压后的文件夹中运行：\nnode scripts/serve-dist.mjs\n\n浏览器打开 http://127.0.0.1:4186/\n若端口已使用：node scripts/serve-dist.mjs 4187\n\n支持本地图片和视频，素材不会上传。\n不能直接双击 dist/index.html，需要通过本地 HTTP 服务打开。\nGLB 为整幅幕面的方案示意，非真实工程光学校核。\n')
with ZipFile(destination) as archive:
    names=archive.namelist()
    assert not any(any(word in name for word in ['node_modules','qa-media','.3dm','.blend','.firecrawl']) for name in names)
    assert 'dist/assets/crystal-hall.glb' in names
    assert archive.testzip() is None
print(destination, destination.stat().st_size, 'bytes')

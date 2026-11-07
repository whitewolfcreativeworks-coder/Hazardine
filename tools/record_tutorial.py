"""Record the tutorial page to an MP4 with narration.

Usage: python3 tools/record_tutorial.py <out.mp4> [chrome-path]
Plays dist/tutorial/index.html?record in headless Chrome, captures video with Playwright,
then lays each narration clip (web/tutorial/narration.json) at the moment its caption appeared.
"""
import base64, json, os, subprocess, sys, tempfile, time
from playwright.sync_api import sync_playwright

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.abspath(sys.argv[1])
chrome = sys.argv[2] if len(sys.argv) > 2 else None
page_url = 'file://' + os.path.join(root, 'dist/tutorial/index.html') + '?record'
narration = json.load(open(os.path.join(root, 'web/tutorial/narration.json')))

with tempfile.TemporaryDirectory() as tmp:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=chrome) if chrome else p.chromium.launch()
        ctx = browser.new_context(viewport={'width': 1280, 'height': 720}, record_video_dir=tmp, record_video_size={'width': 1280, 'height': 720})
        created = time.time() * 1000
        page = ctx.new_page()
        page.goto(page_url)
        origin = page.evaluate('performance.timeOrigin')
        page.wait_for_function('window.__done === true', timeout=20 * 60 * 1000, polling=1000)
        page.wait_for_timeout(1500)
        marks = page.evaluate('window.__marks')
        video_path = page.video.path()
        ctx.close()
        browser.close()

    offset = origin - created  # ms between video start and the page's clock origin
    clips = []
    for i, m in enumerate(marks):
        n = narration.get(m['id'])
        if not n:
            continue
        path = os.path.join(tmp, f'c{i}.mp3')
        open(path, 'wb').write(base64.b64decode(n['src'].split(',', 1)[1]))
        clips.append((path, max(0, int(offset + m['t']))))

    inputs = ['-i', video_path]
    for path, _ in clips:
        inputs += ['-i', path]
    delays = ''.join(f'[{i + 1}:a]adelay={d}|{d}[a{i}];' for i, (_, d) in enumerate(clips))
    mix = ''.join(f'[a{i}]' for i in range(len(clips))) + f'amix=inputs={len(clips)}:normalize=0,volume=1.0,alimiter=limit=0.9[aout]'
    subprocess.run(
        ['ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex', delays + mix, '-map', '0:v', '-map', '[aout]',
         '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-r', '30',
         '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', out],
        check=True,
    )
    print('wrote', out, 'with', len(clips), 'narration clips')

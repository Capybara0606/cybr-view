from pathlib import Path
import subprocess, tempfile
workspace = tempfile.TemporaryDirectory(prefix="cybr-seek-")
fixture = Path(workspace.name) / "video.mp4"
subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=10", "-t", "20", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", str(fixture)], check=True)
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for w in [320,390,430,768]:
  ctx=b.new_context(viewport={'width':w,'height':900},is_mobile=True,has_touch=True)
  page=ctx.new_page();errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  ctx.route('https://**/*',lambda r:r.abort())
  def video(r):
   data=fixture.read_bytes();value=r.request.headers.get('range');headers={'Accept-Ranges':'bytes','Content-Type':'video/mp4'}
   if value:
    bounds=value.replace('bytes=','').split('-');start=int(bounds[0] or 0);end=min(int(bounds[1]) if bounds[1] else len(data)-1,len(data)-1)
    headers['Content-Range']=f'bytes {start}-{end}/{len(data)}';r.fulfill(status=206,headers=headers,body=data[start:end+1])
   else:r.fulfill(status=200,headers=headers,body=data)
  ctx.route('https://commondatastorage.googleapis.com/**',video)
  page.goto('http://127.0.0.1:3000/?env=dev&mobile=1',wait_until='domcontentloaded')
  page.locator('#login-email').fill('test@example.test');page.locator('#login-password').fill('local');page.locator('#login-form button').click();page.locator('[data-open]').first.click()
  page.wait_for_function("document.querySelector('#video').readyState>=2")
  seek=page.locator('#seek-range');assert seek.is_enabled()
  seek.scroll_into_view_if_needed();rect=seek.bounding_box();y=rect['y']+rect['height']/2
  cdp=ctx.new_cdp_session(page)
  def point(frac):return {'x':rect['x']+12+frac*(rect['width']-24),'y':y}
  def touch(kind,frac=None):cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[] if frac is None else [point(frac)]})
  # Gesture tests use real browser touch events, not manual input dispatch.
  touch('touchStart',.1);touch('touchMove',.4);touch('touchMove',.75)
  assert page.locator('#video').evaluate('(v)=>v.currentTime')==0
  assert page.locator('#scrubber-hover').is_visible()
  touch('touchEnd')
  page.wait_for_function("Math.abs(document.querySelector('#video').currentTime-15)<1")
  assert abs(float(seek.input_value())-15)<1
  touch('touchStart',.75);touch('touchMove',.5);touch('touchMove',.25);touch('touchEnd')
  page.wait_for_function("Math.abs(document.querySelector('#video').currentTime-5)<1")
  before=page.locator('#video').evaluate('(v)=>v.currentTime')
  touch('touchStart',.25);touch('touchMove',.9);touch('touchCancel')
  assert abs(page.locator('#video').evaluate('(v)=>v.currentTime')-before)<.1
  # Tap the track and use the keyboard.
  seek.tap(position={'x':rect['width']*.6,'y':rect['height']/2})
  page.wait_for_function("document.querySelector('#video').currentTime>10")
  seek.focus();seek.press('Home');page.wait_for_function("document.querySelector('#video').currentTime===0")
  seek.press('End');page.wait_for_function("document.querySelector('#video').currentTime===20")
  page.locator('#video').evaluate('(v)=>v.currentTime=2')
  page.locator('#btn-play').click();page.wait_for_function("!document.querySelector('#video').paused")
  seek.scroll_into_view_if_needed();rect=seek.bounding_box();y=rect['y']+rect['height']/2
  touch('touchStart',.2);touch('touchMove',.65);touch('touchEnd')
  page.wait_for_function("Math.abs(document.querySelector('#video').currentTime-13)<1")
  assert page.locator('#video').evaluate('(v)=>!v.paused')
  assert not errors,errors
  assert page.evaluate('document.documentElement.scrollWidth')==w
  print('PASS',w,'touch forward/back, tap, keyboard and visual synchronization',flush=True)
  ctx.close()
 b.close()

workspace.cleanup()

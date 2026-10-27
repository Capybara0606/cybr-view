from pathlib import Path
import os, subprocess, tempfile
workspace = tempfile.TemporaryDirectory(prefix="cybr-ui-")
fixture = Path(workspace.name) / "video.mp4"
subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=10", "-t", "20", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", str(fixture)], check=True)
output = Path(os.environ.get("CYBR_UI_SCREENSHOTS", workspace.name))
output.mkdir(parents=True, exist_ok=True)
from playwright.sync_api import sync_playwright
TOKEN='a'*48
ENTRY='http://127.0.0.1:3000/?env=dev&mobile=1#/import/'+TOKEN
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for w in [320,390,430,768,1440]:
  ctx=b.new_context(viewport={'width':w,'height':900});page=ctx.new_page();errors=[];writes=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  ctx.route('https://**/*',lambda r:r.abort())
  def firebase(r):
   if r.request.method!='GET':writes.append(r.request.method)
   r.fulfill(json={'status':'active','projectName':'KIRU · Campaña de lanzamiento','versionName':'V02','fps':25,'reviewStatus':'SENT_FOR_REVIEW','videoUrl':'https://video.test/fixture.mp4'} if '/tokens/' in r.request.url else {
    'root':{'body':'Ajustar el ritmo de esta transición.','time':3,'timeCode':'00:03.00','status':'open','authorName':'Cliente'},
    'reply':{'body':'Prepararemos una versión más ágil.','time':3,'timeCode':'00:03.00','status':'open','parentId':'root','authorName':'Editor'},
    'resolved':{'body':'Color corregido y aprobado.','time':8,'timeCode':'00:08.00','status':'resolved','authorName':'Cliente'}})
  ctx.route('https://cybr-view-default-rtdb.firebaseio.com/**',firebase)
  def video(r):
   data=fixture.read_bytes();value=r.request.headers.get('range');headers={'Accept-Ranges':'bytes','Content-Type':'video/mp4'}
   if value:
    bounds=value.replace('bytes=','').split('-');start=int(bounds[0] or 0);end=min(int(bounds[1]) if bounds[1] else len(data)-1,len(data)-1)
    headers['Content-Range']=f'bytes {start}-{end}/{len(data)}';r.fulfill(status=206,headers=headers,body=data[start:end+1])
   else:r.fulfill(status=200,headers=headers,body=data)
  ctx.route('https://video.test/**',video)
  page.goto(ENTRY,wait_until='domcontentloaded');page.get_by_text('Ajustar el ritmo de esta transición.',exact=True).wait_for()
  page.wait_for_function("document.querySelector('#video').readyState>=2")
  assert page.locator('.kiru-identity strong').inner_text()=='KIRU'
  assert not page.locator('#review-actions').is_visible()
  assert page.locator('.is-reply').count()==1
  assert page.evaluate('document.documentElement.scrollWidth')==w,(w,page.evaluate('document.documentElement.scrollWidth'))
  page.get_by_role('button',name='Pendientes · 2',exact=True).click()
  assert page.get_by_text('Color corregido y aprobado.',exact=True).count()==0
  page.get_by_role('button',name='Todos · 3',exact=True).click()
  # Reply stays attached to the original time, and is rendered beneath its parent.
  page.locator('[data-id="root"] .comment-actions button').first.click()
  page.locator('#composer-text').fill('Nueva respuesta de prueba')
  assert '00:03' in page.locator('#composer-code').inner_text()
  page.locator('#video').evaluate('(v)=>v.currentTime=10')
  page.locator('#composer-text').press('End');page.locator('#composer-text').type('.')
  assert '00:03' in page.locator('#composer-code').inner_text()
  page.locator('#btn-send').click()
  page.get_by_text('Comentario añadido a esta copia de prueba.',exact=True).wait_for()
  assert page.locator('.is-reply').count()==2
  text=page.locator('#comments-list .comment-text').all_text_contents()
  assert text.index('Nueva respuesta de prueba.')<text.index('Color corregido y aprobado.')
  page.locator('#video').evaluate('(v)=>v.currentTime=6')
  page.locator('#composer-text').focus()
  assert '00:06' in page.locator('#composer-code').inner_text()
  ctx.route('https://video.test/broken.mp4',lambda r:r.fulfill(status=404,body='missing'))
  page.locator('#video').evaluate("v=>{v.src='https://video.test/broken.mp4';v.load()}")
  page.get_by_role('button',name='Reintentar',exact=True).wait_for()
  page.get_by_role('button',name='Reintentar',exact=True).click()
  page.wait_for_function("document.querySelector('#fallback').hidden && document.querySelector('#video').readyState>=2")
  # Keyboard timeline navigation.
  page.locator('#video').evaluate('(v)=>v.currentTime=5')
  page.wait_for_function("!document.querySelector('#video').seeking")
  page.locator('#scrubber').focus();page.locator('#scrubber').press('ArrowRight')
  page.wait_for_function("Math.abs(document.querySelector('#video').currentTime-10)<.1")
  page.locator('#scrubber').scroll_into_view_if_needed()
  track=page.locator('.scrubber-track').bounding_box()
  page.mouse.move(track['x']+1,track['y']+2);page.mouse.down()
  page.mouse.move(track['x']+track['width']-1,track['y']+2)
  hint=page.locator('#scrubber-hover').bounding_box()
  assert hint and hint['x']>=0 and hint['x']+hint['width']<=w
  assert page.evaluate('document.documentElement.scrollWidth')==w
  page.mouse.up()
  assert float(page.locator('#scrubber').get_attribute('aria-valuemax'))==20
  dialog_text=[]
  def approve(dialog):dialog_text.append(dialog.message);dialog.accept()
  page.once('dialog',approve);page.locator('#btn-approve').click()
  page.get_by_text('Versión aprobada',exact=True).wait_for()
  assert 'V02' in dialog_text[0] and 'Campaña' in dialog_text[0]
  if w==390:
   page.locator('#video').evaluate('(v)=>{v.pause();v.currentTime=3}')
   page.wait_for_function("getComputedStyle(document.querySelector('#boot')).opacity==='0'")
   page.evaluate('window.scrollTo(0,0)')
   page.screenshot(path=str(output / 'propuesta-v3-inicio.png'))
   page.screenshot(path=str(output / 'propuesta-v3-completa.png'),full_page=True)
   page.locator('.composer').scroll_into_view_if_needed()
   page.screenshot(path=str(output / 'propuesta-v3-comentarios.png'))
   # Local editor can manage; deletion remains protected by confirmation.
   page.goto('http://127.0.0.1:3000/?env=dev&mobile=1#/login',wait_until='domcontentloaded')
   page.locator('#login-email').fill('editor@example.test');page.locator('#login-password').fill('local-only');page.locator('#login-form button').click()
   page.locator('#view-dashboard').wait_for(state='visible');page.goto(ENTRY,wait_until='domcontentloaded')
   page.locator('#review-actions').wait_for(state='visible')
   assert not page.locator('#btn-delete-project-review').is_visible()
   page.locator('.review-manage summary').click();page.locator('#btn-delete-project-review').wait_for(state='visible')
   page.once('dialog',lambda d:d.dismiss());page.locator('#btn-delete-project-review').click()
   assert page.locator('#view-review').is_visible()
  assert not writes,writes
  assert not errors,errors
  print('PASS',w,'branding, threads, filter, timed reply, retry, timeline, approval and isolated writes',flush=True)
  ctx.close()
 b.close()

workspace.cleanup()

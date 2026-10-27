from pathlib import Path
from playwright.sync_api import sync_playwright
fixture=Path(__file__).with_name('firebase-sdk-fixture.js').read_text()
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 ctx=b.new_context(viewport={'width':390,'height':900})
 ctx.add_init_script(fixture)
 ctx.route('https://**/*',lambda r:r.abort())
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 url='http://127.0.0.1:3000/#/review/'+'a'*48
 page.goto(url,wait_until='domcontentloaded');page.get_by_text('Comentario remoto',exact=True).wait_for()
 assert page.locator('.review-preview-tag').count()==0
 assert page.locator('.kiru-wordmark').is_visible()
 assert page.locator('#seek-range').count()==1
 assert page.evaluate('window.__writes.length')==0
 page.evaluate('window.__failWrites=true')
 page.locator('#composer-text').fill('Texto que no debe perderse');page.locator('#btn-send').click()
 page.get_by_text('No pudimos guardar el comentario. Tu texto sigue aquí para reintentar.',exact=True).wait_for()
 assert page.locator('#composer-text').input_value()=='Texto que no debe perderse'
 assert page.locator('#comments-list .comment-item').count()==1
 page.evaluate('window.__failWrites=false');page.locator('#btn-send').click();page.get_by_text('Comentario guardado.',exact=True).wait_for()
 assert page.locator('#comments-list .comment-item').count()==2
 page.locator('article[data-id="c1"]').get_by_role('button',name='Editar',exact=True).click()
 page.locator('#composer-text').fill('Comentario editado remotamente');page.locator('#btn-send').click()
 page.get_by_text('Comentario actualizado. Se conserva su tiempo original.',exact=True).wait_for()
 assert page.evaluate("window.__db['cybrview/v1/reviews/'+'a'.repeat(48)+'/comments'].c1.time")==3
 page.evaluate('window.__failWrites=true')
 page.locator('article[data-id="c1"]').get_by_role('button',name='✓ Resolver',exact=True).click()
 page.get_by_text('No pudimos guardar el estado del comentario. Reintenta.',exact=True).wait_for()
 assert 'line-through' not in page.locator('article[data-id="c1"] .comment-text').evaluate('(n)=>getComputedStyle(n).textDecorationLine')
 page.once('dialog',lambda d:d.accept());page.locator('article[data-id="c1"]').get_by_role('button',name='Eliminar',exact=True).click()
 page.get_by_text('No pudimos eliminar el comentario. Reintenta.',exact=True).wait_for()
 assert page.locator('article[data-id="c1"]').count()==1
 page.once('dialog',lambda d:d.accept());page.locator('#btn-approve').click()
 page.get_by_text('No pudimos guardar la aprobación. Comprueba tu conexión y reintenta.',exact=True).wait_for()
 assert page.get_by_text('Versión aprobada',exact=True).count()==0
 page.evaluate('window.__failWrites=false')
 page.once('dialog',lambda d:d.accept());page.locator('#btn-approve').click()
 page.get_by_text('Versión aprobada',exact=True).wait_for()
 assert page.evaluate("window.__db['cybrview/v1/reviews/'+'a'.repeat(48)+'/approval'].approvedAt>0")
 # Retry and reload existing approvals from the canonical Firebase node.
 approval=page.evaluate("window.__db['cybrview/v1/reviews/'+'a'.repeat(48)+'/approval']")
 page.add_init_script("window.__db['cybrview/v1/reviews/'+'a'.repeat(48)+'/approval']="+__import__('json').dumps(approval))
 page.reload(wait_until='domcontentloaded');page.get_by_text('Versión aprobada',exact=True).wait_for()
 assert not errors,errors
 print('PASS: production default UI, successful Firebase writes, failed writes retain data, approval persistence and no DEV imports')
 b.close()

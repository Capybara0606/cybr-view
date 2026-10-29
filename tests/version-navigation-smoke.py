"""Guest version navigation and editor backfill; all Firebase traffic is simulated."""
from pathlib import Path
import subprocess, tempfile
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:3000'
ROOT = 'cybrview/v1'
A, B, C, D, E = [c * 48 for c in 'abcde']
media = tempfile.TemporaryDirectory(prefix='cybr-versions-')
video = Path(media.name) / 'video.mp4'
subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=10', '-t', '20', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', str(video)], check=True)
fixture = Path(__file__).with_name('version-navigation-fixture.js').read_text()

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    def context():
        ctx = browser.new_context(viewport={'width': 390, 'height': 844})
        ctx.add_init_script(fixture)
        ctx.route('https://**/*', lambda r: r.abort())
        ctx.route('https://video.test/**', lambda r: r.fulfill(status=200, content_type='video/mp4', body=video.read_bytes()))
        return ctx
    first = context()
    page = first.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(f'{BASE}/#/review/{A}')
    page.get_by_text('Comentario V01', exact=True).wait_for()
    assert page.locator('#version-chips button').count() == 1  # old token, no index
    assert page.evaluate('window.__reads.every(p => !p.includes("/projects"))')
    assert page.evaluate('window.__writes.length') == 0

    denied = first.new_page()
    denied.goto(f'{BASE}/#/review/{C}')
    denied.locator('#review-denied').wait_for(state='visible')
    assert denied.evaluate('window.__reads.every(p => !p.includes("/reviews/"))')
    denied.close()

    # A real editor session receives the private catalog, then backfills EVERY token.
    page.evaluate('window.__fixture.editor(true)')
    page.wait_for_function('Object.keys(window.__fixture.get("cybrview/v1/tokens/"+"a".repeat(48)).versions || {}).length === 2')
    page.get_by_role('button', name='V02', exact=True).wait_for()
    assert page.locator('#version-chips button').all_text_contents() == ['V01', 'V02']
    assert page.evaluate('window.__fixture.get("cybrview/v1/tokens/"+"c".repeat(48)).status') == 'revoked'
    assert page.evaluate('window.__fixture.get("cybrview/v1/tokens/"+"d".repeat(48)).versions') is None
    assert page.evaluate('window.__fixture.get("cybrview/v1/tokens/"+"e".repeat(48)).versions["a".repeat(48)]') is None
    # Publish a previously unshared draft through the actual session API.
    page.evaluate('''async () => {
      const { createSession } = await import('/js/session.js?v=20261029-versions1');
      window.editorSession = createSession(); editorSession.setEditorActive(true);
    }''')
    page.wait_for_function('editorSession.getProjects().length === 2')
    page.evaluate('editorSession.setReviewStatus("v3", "SENT_FOR_REVIEW", "Editor")')
    page.get_by_role('button', name='V03', exact=True).wait_for()
    page.evaluate('''async () => { window.createdVersion = await editorSession.addVersion('p1', 'V04', 'https://video.test/V04.mp4', 25); }''')
    assert page.get_by_role('button', name='V04', exact=True).count() == 0
    page.evaluate('editorSession.setReviewStatus(createdVersion.id, "SENT_FOR_REVIEW", "Editor")')
    page.get_by_role('button', name='V04', exact=True).wait_for()
    snapshot = page.evaluate('window.__fixture.get("cybrview/v1/tokens")')
    page.evaluate('editorSession.setEditorActive(false); window.__fixture.editor(false); window.__reads = []; window.__writes = []')
    page.get_by_role('button', name='V02', exact=True).click()
    page.get_by_text('Comentario V02', exact=True).wait_for()
    assert page.url.endswith(f'#/review/{B}')
    assert page.get_by_text('Comentario V01', exact=True).count() == 0
    assert page.locator('#version-chips button[aria-pressed="true"]').inner_text() == 'V02'
    assert page.locator('#video').get_attribute('src').endswith('/V02.mp4')
    page.wait_for_function('document.querySelectorAll(".marker").length === 1')
    page.locator('#composer-text').fill('Solo V02'); page.locator('#btn-send').click()
    page.get_by_text('Solo V02', exact=True).wait_for()
    assert page.evaluate('window.__writes.every(w => w.path.includes("/reviews/"+"b".repeat(48)+"/"))')
    # A slow write from V02 must not clear V01's draft or enter its mirror.
    page.evaluate('window.__holdWrites = true')
    page.locator('#composer-text').fill('Tardío V02'); page.locator('#btn-send').click()
    page.get_by_role('button', name='V01', exact=True).click()
    page.get_by_text('Comentario V01', exact=True).wait_for()
    page.locator('#composer-text').fill('Borrador V01')
    page.evaluate('window.__releaseWrites()')
    page.wait_for_function('Object.values(window.__fixture.get("cybrview/v1/reviews/"+"b".repeat(48)+"/comments")).some(c => c.body === "Tardío V02")')
    assert page.locator('#composer-text').input_value() == 'Borrador V01'
    assert page.get_by_text('Tardío V02', exact=True).count() == 0
    page.get_by_role('button', name='V02', exact=True).click()
    page.get_by_text('Tardío V02', exact=True).wait_for()
    page.once('dialog', lambda d: d.accept()); page.locator('#btn-approve').click()
    page.get_by_text('Versión aprobada', exact=True).wait_for()
    assert page.evaluate('window.__fixture.get("cybrview/v1/reviews/"+"a".repeat(48)+"/approval")') is None
    page.get_by_role('button', name='V01', exact=True).click()
    page.get_by_text('Comentario V01', exact=True).wait_for()
    assert page.get_by_text('Solo V02', exact=True).count() == 0
    assert page.get_by_text('Versión aprobada', exact=True).count() == 0
    assert page.evaluate('window.__reads.every(p => !p.includes("/projects"))')
    # Persisted Firebase snapshot, no localStorage: reload and second browser context.
    fresh = context()
    fresh.add_init_script('window.__fixture.set("cybrview/v1/tokens", '+__import__('json').dumps(snapshot)+')')
    second = fresh.new_page()
    second.goto(f'{BASE}/#/review/{B}')
    second.get_by_text('Comentario V02', exact=True).wait_for()
    second.reload(); second.get_by_text('Comentario V02', exact=True).wait_for()
    assert second.locator('#version-chips button').all_text_contents() == ['V01', 'V02', 'V03', 'V04']
    assert second.evaluate('window.__writes.length') == 0
    assert second.evaluate('window.__reads.every(p => !p.includes("/projects"))')
    # New publication arrives while an old link is open (public token listener).
    node = snapshot[A]
    node['versions']['f'*48] = {'versionId': 'v5', 'name': 'V05', 'createdAt': 5}
    page.evaluate('(node) => window.__fixture.set("cybrview/v1/tokens/"+"a".repeat(48), node)', node)
    page.get_by_role('button', name='V05', exact=True).wait_for()
    # Forged cross-project index cannot be followed by the selector.
    node['versions'][E] = {'versionId': 'v1', 'name': 'Otro proyecto', 'createdAt': 6}
    page.evaluate('(node) => window.__fixture.set("cybrview/v1/tokens/"+"a".repeat(48), node)', node)
    page.get_by_role('button', name='Otro proyecto', exact=True).click()
    page.locator('#review-denied').wait_for(state='visible')
    assert page.get_by_text('Comentario Otro cliente', exact=True).count() == 0
    # Revoked current token immediately removes the video/comments/selector.
    second.evaluate('''() => { const path = 'cybrview/v1/tokens/'+'b'.repeat(48);
      window.__fixture.set(path, {...window.__fixture.get(path), status:'revoked'}); }''')
    second.locator('#review-denied').wait_for(state='visible')
    assert second.locator('#video').get_attribute('src') is None
    assert not second.locator('#selector-stack').is_visible()
    for token in [D, '0'*48]:
        second.goto(f'{BASE}/#/review/{token}')
        second.locator('#review-denied').wait_for(state='visible')
    assert not errors, errors
    print('PASS: guest catalog isolation, editor legacy backfill and publish, live additions, token URLs, video/comments/markers/approval isolation, reload, fresh browser, revoked and cross-project denial')
    browser.close()

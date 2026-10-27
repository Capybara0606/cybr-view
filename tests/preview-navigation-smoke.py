"""Run with the dev server running: python3 tests/preview-navigation-smoke.py.
Requires Playwright Python and Chromium; Firebase responses are controlled fixtures.
"""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get('CYBR_TEST_BASE', 'http://127.0.0.1:3000')
TOKEN = 'a' * 48
ENTRY = f'{BASE}/?env=dev&mobile=1#/import/{TOKEN}'

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CYBR_CHROMIUM', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    calls = []

    def make_context(block_storage=False):
        context = browser.new_context(viewport={'width': 390, 'height': 844})
        context.route('https://**/*', lambda r: r.abort())
        def firebase(route):
            assert route.request.method == 'GET', 'Preview must not write to production'
            calls.append(route.request.url)
            route.fulfill(json={
                'status': 'active', 'projectName': 'Existing project', 'versionName': 'V01',
                'videoUrl': 'https://example.test/video.mp4', 'fps': 25,
                'reviewStatus': 'SENT_FOR_REVIEW',
            } if '/tokens/' in route.request.url else {
                'c1': {'body': 'Original comment', 'time': 0, 'timeCode': '00:00.00', 'status': 'open'},
            })
        context.route('https://cybr-view-default-rtdb.firebaseio.com/**', firebase)
        if block_storage:
            context.add_init_script("Storage.prototype.setItem = function() { throw new DOMException('Blocked', 'SecurityError'); }")
        return context

    first = make_context()
    page = first.new_page()
    page.goto(ENTRY, wait_until='domcontentloaded')
    page.get_by_text('Original comment', exact=True).wait_for()
    assert page.url == ENTRY, 'Address must retain the source, not a browser-only token'
    page.locator('#composer-text').fill('First browser only')
    page.locator('#btn-send').click()
    page.get_by_text('First browser only', exact=True).wait_for()
    shared_url = page.url

    second = make_context()
    other = second.new_page()
    other.goto(shared_url, wait_until='domcontentloaded')
    other.get_by_text('Original comment', exact=True).wait_for()
    assert other.get_by_text('First browser only', exact=True).count() == 0
    assert not other.locator('#review-denied').is_visible()
    assert other.url == ENTRY
    page.reload(wait_until='domcontentloaded')
    page.get_by_text('First browser only', exact=True).wait_for()
    print('PASS: shared URL opens in a fresh browser; local edits stay separate and survive reload')

    private = make_context(block_storage=True)
    private_page = private.new_page()
    private_page.goto(shared_url, wait_until='domcontentloaded')
    private_page.get_by_text('Original comment', exact=True).wait_for()
    private_page.reload(wait_until='domcontentloaded')
    private_page.get_by_text('Original comment', exact=True).wait_for()
    assert private_page.url == ENTRY
    print('PASS: copy can be reimported after reload when storage is blocked')

    other.goto(f'{BASE}/?env=dev&mobile=1#/review/missing', wait_until='domcontentloaded')
    other.locator('#review-denied').wait_for(state='visible')
    assert not other.locator('.mobile-review-dock').is_visible()
    print('PASS: invalid review hides unavailable controls; all production requests were GET')
    browser.close()

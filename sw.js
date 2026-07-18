// 판매왕문자 V5.4 Service Worker
// Cache-First 전략 — 한 번 캐시한 자산은 오프라인에서도 사용 가능

const CACHE_VERSION = 'salesking-v5.4-2026-07-18-idx';
const CORE_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js'
];

// 설치: 핵심 자산 캐시
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_VERSION).then((cache) => {
            // 개별 추가 — 실패한 자산은 건너뜀
            return Promise.all(
                CORE_ASSETS.map(url =>
                    cache.add(url).catch(err => {
                        console.warn('[SW] 캐시 실패:', url, err.message);
                    })
                )
            );
        })
    );
});

// 활성화: 이전 버전 캐시 정리
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// 요청 처리: 캐시 우선, 네트워크 fallback, 응답을 다시 캐시에 저장
self.addEventListener('fetch', (event) => {
    // GET 요청만 처리
    if (event.request.method !== 'GET') return;
    // chrome-extension 등 비표준 스킴 무시
    const url = event.request.url;
    if (!url.startsWith('http')) return;

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) {
                // 캐시 hit — 백그라운드에서 갱신 시도 (네트워크 우회 갱신 전략)
                fetch(event.request).then(fresh => {
                    if (fresh && fresh.status === 200) {
                        caches.open(CACHE_VERSION).then(c => c.put(event.request, fresh.clone())).catch(()=>{});
                    }
                }).catch(()=>{});
                return cached;
            }
            // 캐시 miss — 네트워크 시도
            return fetch(event.request).then(response => {
                // 200 응답만 캐시
                if (response && response.status === 200 && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_VERSION).then(c => c.put(event.request, clone)).catch(()=>{});
                }
                return response;
            }).catch(err => {
                // 오프라인 + 캐시 미보유 — HTML 요청이면 메인 HTML로 fallback
                if (event.request.destination === 'document') {
                    return caches.match('./index.html') || caches.match('./');
                }
                throw err;
            });
        })
    );
});

// 메시지 — 클라이언트가 캐시 강제 갱신 요청 시
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        caches.delete(CACHE_VERSION).then(() => {
            event.ports[0] && event.ports[0].postMessage({ ok: true });
        });
    }
});

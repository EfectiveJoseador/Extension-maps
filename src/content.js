/* Google Maps Collaborator - Content Script */

// State
let points = [];
let isOpen = true;
let isPickingMode = false;
let markerInterval = null;
let autoSyncInterval = null;

// Sync State
let mapLayerElement = null;
let initialMapTransform = null;
let renderTimeUrlState = null;

// Settings
let serverUrl = 'https://ddfc9dc3-050c-4fc6-badb-de3281c9487c-00-39100q2wkh37y.spock.replit.dev/points';

// Constants
const PIN_SVG = `
<svg viewBox="0 0 24 24" width="32" height="32" fill="#EA4335" stroke="#991508" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
    <circle cx="12" cy="10" r="3" fill="white"></circle>
</svg>
`;

const TILE_SIZE = 256;

// Math
function project(lat, lng) {
    let siny = Math.sin((lat * Math.PI) / 180);
    siny = Math.min(Math.max(siny, -0.9999), 0.9999);
    return {
        x: TILE_SIZE * (0.5 + lng / 360),
        y: TILE_SIZE * (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI))
    };
}
function unproject(x, y) {
    const lng = (x / TILE_SIZE - 0.5) * 360;
    const n = Math.PI - 2 * Math.PI * y / TILE_SIZE;
    const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lat, lng };
}
function getMapState() {
    const match = window.location.href.match(/@(-?\d+\.\d+),(-?\d+\.\d+),(\d+(\.\d+)?)z/);
    if (match) {
        return {
            centerLat: parseFloat(match[1]),
            centerLng: parseFloat(match[2]),
            zoom: parseFloat(match[3])
        };
    }
    return null;
}
function getScreenPosFromLatLng(lat, lng, state) {
    if (!state) return null;
    const scale = Math.pow(2, state.zoom);
    const worldCenter = project(state.centerLat, state.centerLng);
    const worldPoint = project(lat, lng);
    const dxWorld = worldPoint.x - worldCenter.x;
    const dyWorld = worldPoint.y - worldCenter.y;
    return {
        x: (window.innerWidth / 2) + (dxWorld * scale),
        y: (window.innerHeight / 2) + (dyWorld * scale)
    };
}

function parseTransform(el) {
    if (!el) return { x: 0, y: 0 };
    const style = window.getComputedStyle(el);
    const matrix = style.transform || style.webkitTransform;
    if (matrix && matrix !== 'none') {
        const values = matrix.split('(')[1].split(')')[0].split(',');
        return { x: parseFloat(values[4]), y: parseFloat(values[5]) };
    }
    return { x: 0, y: 0 };
}

function findMapLayer() {
    if (mapLayerElement && document.contains(mapLayerElement)) return mapLayerElement;
    const candidates = document.querySelectorAll('.gm-style div');
    for (let div of candidates) {
        const t = div.style.transform;
        if (t && (t.includes('matrix') || t.includes('translate')) && div.childElementCount > 0) {
            if (div.querySelector('img') || div.querySelector('canvas')) {
                mapLayerElement = div;
                return mapLayerElement;
            }
        }
    }
    return null;
}

// UI Setup
const createUI = () => {
    if (document.getElementById('map-collab-container')) return;
    const container = document.createElement('div');
    container.id = 'map-collab-container';
    container.className = 'map-collab-panel';
    container.innerHTML = `
        <div class="mc-header">
            <h3>📍 Map Collaborator</h3>
            <button id="mc-toggle-btn">_</button>
        </div>
        <div class="mc-content" id="mc-content">
            <div class="mc-actions">
                <button id="mc-add-btn" class="mc-btn primary">📌 Pick on Map</button>

                 <div class="mc-sync-section" style="margin-top: 10px; border-top: 1px solid #eee; padding-top: 10px;">
                    <div style="font-size:10px; color:#666; margin-bottom:4px;">Server: <span id="mc-server-status">🔴</span></div>
                    <button id="mc-config-btn" class="mc-btn secondary" style="font-size: 0.8em; margin-bottom: 5px;">⚙️ Config URL</button>
                    <button id="mc-sync-btn" class="mc-btn secondary" style="width: 100%;">🔄 Sync Now</button>
                </div>
            </div>
            <div class="mc-list-container">
                <h4>Saved Points</h4>
                <div id="mc-points-list" class="mc-points-list"></div>
            </div>
        </div>
    `;
    document.body.appendChild(container);

    const overlay = document.createElement('div');
    overlay.id = 'mc-pick-overlay';
    overlay.className = 'mc-picking-overlay';
    overlay.style.display = 'none';
    document.body.appendChild(overlay);

    const markersContainer = document.createElement('div');
    markersContainer.id = 'mc-markers-layer';
    markersContainer.className = 'mc-markers-layer';
    document.body.appendChild(markersContainer);

    document.getElementById('mc-toggle-btn').addEventListener('click', toggleUI);
    document.getElementById('mc-add-btn').addEventListener('click', togglePickMode);

    document.getElementById('mc-sync-btn').addEventListener('click', () => performSync(true));
    document.getElementById('mc-config-btn').addEventListener('click', handleConfig);
    overlay.addEventListener('click', handleMapClick);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isPickingMode) togglePickMode(); });

    startLoop();
    startAutoSync();
};

const toggleUI = () => {
    const c = document.getElementById('mc-content');
    isOpen = !isOpen;
    c.style.display = isOpen ? 'block' : 'none';
};
const togglePickMode = () => {
    isPickingMode = !isPickingMode;
    const btn = document.getElementById('mc-add-btn');
    const o = document.getElementById('mc-pick-overlay');
    if (isPickingMode) { btn.innerText = 'Click Map (Esc to cancel)'; btn.classList.add('picking'); o.style.display = 'block'; }
    else { btn.innerText = '📌 Pick on Map'; btn.classList.remove('picking'); o.style.display = 'none'; }
};
const handleMapClick = (e) => {
    const s = getMapState();
    if (!s) return togglePickMode();
    const sc = Math.pow(2, s.zoom);
    const wc = project(s.centerLat, s.centerLng);
    const pc = { x: wc.x * sc, y: wc.y * sc };
    const dx = e.clientX - (window.innerWidth / 2);
    const dy = e.clientY - (window.innerHeight / 2);
    const coords = unproject((pc.x + dx) / sc, (pc.y + dy) / sc);

    togglePickMode();
    setTimeout(() => {
        const name = prompt('Name:');
        if (name) {
            points.push({ id: '_' + Math.random().toString(36).substr(2, 9), name, lat: coords.lat, lng: coords.lng });
            savePoints(); renderPoints(); performSync(false); // Push on add
        }
    }, 50);
};

// --- SYNC LOOP ---
function startLoop() {
    const loop = () => {
        updateMarkers();
        requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
}

function updateMarkers() {
    const container = document.getElementById('mc-markers-layer');
    if (!container) return;

    const currentState = getMapState();
    if (!currentState) return;

    let needsRerender = false;
    if (!renderTimeUrlState ||
        Math.abs(currentState.centerLat - renderTimeUrlState.centerLat) > 0.0000001 ||
        Math.abs(currentState.centerLng - renderTimeUrlState.centerLng) > 0.0000001 ||
        currentState.zoom !== renderTimeUrlState.zoom) {
        needsRerender = true;
    }

    const layer = findMapLayer();

    if (needsRerender) {
        renderTimeUrlState = currentState;
        if (layer) initialMapTransform = parseTransform(layer);
        else initialMapTransform = { x: 0, y: 0 };

        container.style.transform = 'translate(0px, 0px)';
        renderMarkersDOM(container, currentState);
    } else {
        if (layer && initialMapTransform) {
            const currentTransform = parseTransform(layer);
            const dx = currentTransform.x - initialMapTransform.x;
            const dy = currentTransform.y - initialMapTransform.y;
            container.style.transform = `translate(${dx}px, ${dy}px)`;
        }
    }
}

function renderMarkersDOM(container, state) {
    if (points.length === 0) { container.innerHTML = ''; return; }
    container.innerHTML = '';
    const frag = document.createDocumentFragment();
    points.forEach(p => {
        const pos = getScreenPosFromLatLng(p.lat, p.lng, state);
        if (pos.x > -50 && pos.x < window.innerWidth + 50 && pos.y > -50 && pos.y < window.innerHeight + 50) {
            const m = document.createElement('div');
            m.className = 'mc-marker';
            m.innerHTML = PIN_SVG;
            m.style.left = `${pos.x - 16}px`;
            m.style.top = `${pos.y - 32}px`;
            m.title = p.name;
            m.onclick = () => alert(p.name);
            frag.appendChild(m);
        }
    });
    container.appendChild(frag);
}

// Data & Helpers
const renderPoints = () => {
    const list = document.getElementById('mc-points-list');
    list.innerHTML = '';
    points.forEach(p => {
        const d = document.createElement('div');
        d.className = 'mc-point-item';
        d.innerHTML = `
            <div class="mc-point-info"><strong>${p.name}</strong></div>
            <div class="mc-point-actions"><button class="go">➜</button><button class="del">🗑️</button></div>
        `;
        d.querySelector('.go').onclick = (e) => {
            e.stopPropagation();
            window.location.href = `https://www.google.com/maps/@${p.lat},${p.lng},16z`;
        };
        d.querySelector('.del').onclick = (e) => {
            e.stopPropagation();
            if (confirm('Delete?')) {
                points = points.filter(x => x.id !== p.id);
                pendingDeletes.add(p.id);
                renderPoints();
                performSync(true);
            }
        };
        list.appendChild(d);
    });
};
const savePoints = () => {
    chrome.storage.local.set({ 'mapPoints': points, 'serverUrl': serverUrl });
};
const loadPoints = () => {
    chrome.storage.local.get(['mapPoints', 'serverUrl'], r => {
        if (r.mapPoints) { points = r.mapPoints; renderPoints(); }
        if (r.serverUrl) { serverUrl = r.serverUrl; }
    });
};

const handleConfig = () => {
    const url = prompt('Enter Sync Server URL', serverUrl);
    if (url) {
        serverUrl = url;
        savePoints();
        performSync(true); // Test immediately
    }
};

// --- SYNC HELPERS ---
// --- SYNC ENGINE ---
let pendingDeletes = new Set();

const startAutoSync = () => {
    if (autoSyncInterval) clearInterval(autoSyncInterval);
    autoSyncInterval = setInterval(() => performSync(false), 10000); // Poll every 10s
};

const performSync = async (manual) => {
    const status = document.getElementById('mc-server-status');
    const btn = document.getElementById('mc-sync-btn');
    if (status) status.innerText = '🟡';
    if (manual && btn) btn.innerText = '...';

    try {
        const r = await fetch(serverUrl);
        if (!r.ok) throw new Error('Fetch failed');
        const remotePoints = await r.json();

        const remoteIds = new Set(remotePoints.map(rp => rp.id));
        for (const pd of pendingDeletes) {
            if (!remoteIds.has(pd)) {
                pendingDeletes.delete(pd);
            }
        }

        const map = new Map();
        points.forEach(p => map.set(p.id, p));
        let changed = false;

        remotePoints.forEach(p => {
            if (!map.has(p.id)) {
                if (!pendingDeletes.has(p.id)) {
                    map.set(p.id, p);
                    changed = true;
                }
            }
        });

        if (changed) {
            points = Array.from(map.values());
            savePoints();
            renderPoints();
        }

        await fetch(serverUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(points)
        });

        if (status) status.innerText = '🟢';
        if (manual) alert('Sync Complete!');

    } catch (e) {
        if (status) status.innerText = '🔴';
        if (manual) alert('Sync Failed: Check URL or Server Status');
    } finally {
        if (manual && btn) btn.innerText = '🔄 Sync Now';
    }
};

createUI();
loadPoints();

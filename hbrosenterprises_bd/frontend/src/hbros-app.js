// ===== DATA =====
const SUPERVISOR_USER = { username: 'supervisor', password: 'sup123', label: 'Supervisor' };

const ACTIVITIES = [
    { id: 'hose_removal', name: 'Hose Removal', icon: '🚿' },
    { id: 'roll_hose', name: 'Roll Hose', icon: '🔄' },
    { id: 'pull_wire_down', name: 'Pull Wire Down', icon: '🔌' },
    { id: 'roll_wire', name: 'Roll Wire', icon: '🧶' },
    { id: 'cutting_post_wire', name: 'Cutting Post Wire', icon: '✂️' },
    { id: 'post_removal', name: 'Post Removal', icon: '🪵' },
    { id: 'plant_removal', name: 'Plant Removal', icon: '🌱' },
    { id: 'cleaning', name: 'Cleaning', icon: '🧹' }
];

const CLOUD_CFG_KEY = 'hb_cloud_cfg_v1';
const LOCAL_LAST_SAVE_KEY = 'hb_local_last_save_at';
const CLOUD_PUSH_DEBOUNCE_MS = 1200;
let cloudPushTimer = null;

function nowIso() { return new Date().toISOString(); }
function markLocalSave() { localStorage.setItem(LOCAL_LAST_SAVE_KEY, nowIso()); }
function getLocalLastSaveIso() { return localStorage.getItem(LOCAL_LAST_SAVE_KEY) || '1970-01-01T00:00:00.000Z'; }

function loadCloudConfig() {
    try {
        const cfg = JSON.parse(localStorage.getItem(CLOUD_CFG_KEY) || '{}');
        return {
            url: cfg.url || '',
            anonKey: cfg.anonKey || '',
            enabled: Boolean(cfg.enabled)
        };
    } catch {
        return { url: '', anonKey: '', enabled: false };
    }
}

function saveCloudConfig(cfg) {
    localStorage.setItem(CLOUD_CFG_KEY, JSON.stringify({
        url: cfg.url || '',
        anonKey: cfg.anonKey || '',
        enabled: Boolean(cfg.enabled)
    }));
}

function hasCloudConfig() {
    const cfg = loadCloudConfig();
    return cfg.enabled && !!cfg.url && !!cfg.anonKey;
}

function cloudHeaders() {
    const cfg = loadCloudConfig();
    return {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.anonKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
    };
}

async function cloudFetchState() {
    const cfg = loadCloudConfig();
    const base = cfg.url.replace(/\/+$/, '');
    const url = `${base}/rest/v1/app_state?id=eq.main&select=id,workers,fields,updated_at&limit=1`;
    const res = await fetch(url, { headers: cloudHeaders() });
    if (!res.ok) throw new Error(`Cloud fetch failed (${res.status})`);
    const rows = await res.json();
    return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function cloudUpsertState(payload) {
    const cfg = loadCloudConfig();
    const base = cfg.url.replace(/\/+$/, '');
    const url = `${base}/rest/v1/app_state?on_conflict=id`;
    const body = [{ id: 'main', ...payload, updated_at: nowIso() }];
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            ...cloudHeaders(),
            Prefer: 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Cloud upsert failed (${res.status})`);
    return res.json();
}

function cloudSetStatus(kind, message) {
    const badge = document.getElementById('cloud-sync-status');
    const msg = document.getElementById('cloud-sync-message');
    if (!badge || !msg) return;
    if (kind === 'ok') {
        badge.className = 'text-xs px-2 py-1 rounded bg-green-100 text-green-700';
    } else if (kind === 'warn') {
        badge.className = 'text-xs px-2 py-1 rounded bg-amber-100 text-amber-700';
    } else if (kind === 'err') {
        badge.className = 'text-xs px-2 py-1 rounded bg-red-100 text-red-700';
    } else {
        badge.className = 'text-xs px-2 py-1 rounded bg-gray-100 text-gray-700';
    }
    badge.textContent = message;
    msg.textContent = `${new Date().toLocaleTimeString('en-US')} - ${message}`;
}

async function cloudPushNow() {
    if (!hasCloudConfig()) return;
    const workers = loadWorkers();
    const fields = loadFields();
    await cloudUpsertState({ workers, fields });
    cloudSetStatus('ok', 'Cloud synced');
}

function scheduleCloudPush() {
    if (!hasCloudConfig()) return;
    if (cloudPushTimer) clearTimeout(cloudPushTimer);
    cloudPushTimer = setTimeout(() => {
        cloudPushNow().catch(err => cloudSetStatus('warn', `Cloud sync warning: ${err.message}`));
    }, CLOUD_PUSH_DEBOUNCE_MS);
}

async function cloudPullIfNewer() {
    if (!hasCloudConfig()) return;
    try {
        const row = await cloudFetchState();
        if (!row) return;
        const cloudTs = row.updated_at || '1970-01-01T00:00:00.000Z';
        const localTs = getLocalLastSaveIso();
        if (new Date(cloudTs) > new Date(localTs)) {
            if (Array.isArray(row.workers)) localStorage.setItem('hb_workers', JSON.stringify(row.workers));
            if (Array.isArray(row.fields)) localStorage.setItem('hb_fields', JSON.stringify(row.fields));
            localStorage.setItem(LOCAL_LAST_SAVE_KEY, cloudTs);
            cloudSetStatus('ok', 'Pulled newer cloud data');
        } else {
            cloudSetStatus('ok', 'Cloud connected');
        }
    } catch (err) {
        cloudSetStatus('warn', `Cloud pull warning: ${err.message}`);
    }
}

function loadWorkers() { try { return JSON.parse(localStorage.getItem('hb_workers')) || []; } catch { return []; } }
function saveWorkers(w) { localStorage.setItem('hb_workers', JSON.stringify(w)); markLocalSave(); scheduleCloudPush(); }
function nextWorkerId() { const w = loadWorkers(); return String(w.reduce((m, x) => Math.max(m, parseInt(x.id) || 0), 0) + 1).padStart(3, '0'); }

function getDefaultFields() {
    return [
        { id:1, name:'Chuyita 2', area:0, polygon:[[36.2748819258431,-121.2482101683968],[36.27310147166136,-121.2458575520293],[36.27655842678505,-121.2419820040762],[36.27841716741344,-121.2442161947929],[36.2748819258431,-121.2482101683968]], swLat:36.2731,swLng:-121.2482,neLat:36.2784,neLng:-121.2420, activities:{} },
        { id:2, name:'Field 1', area:0, polygon:[[36.25929576986162,-121.1924982448581],[36.25889108015773,-121.1933004723734],[36.25547230855084,-121.191638891949],[36.25590388194136,-121.1907896997263],[36.25929576986162,-121.1924982448581]], swLat:36.2555,swLng:-121.1933,neLat:36.2593,neLng:-121.1908, activities:{} },
        { id:3, name:'Field 2', area:0, polygon:[[36.25939563622435,-121.192604413168],[36.26124641787686,-121.1934237704818],[36.26094898977864,-121.194314818718],[36.25901262040459,-121.1933531105449],[36.25939563622435,-121.192604413168]], swLat:36.2590,swLng:-121.1943,neLat:36.2612,neLng:-121.1926, activities:{} },
        { id:4, name:'Field 3', area:0, polygon:[[36.26128717901112,-121.1857276190716],[36.25997130711815,-121.1856411252023],[36.25898116020275,-121.1852392162161],[36.26070554132293,-121.1821249189041],[36.26106929179413,-121.1822995606729],[36.26171744523524,-121.1811370941148],[36.26217890358628,-121.1813721152866],[36.26328325421113,-121.1822600700712],[36.26128717901112,-121.1857276190716]], swLat:36.2590,swLng:-121.1857,neLat:36.2633,neLng:-121.1811, activities:{} },
        { id:5, name:'Field 4', area:0, polygon:[[36.25230201959292,-121.2122775393801],[36.2520077256657,-121.2119694041299],[36.25178365591918,-121.2118775844964],[36.25137042344626,-121.2125782738386],[36.25185780452583,-121.2131549955032],[36.25092887831053,-121.2147473555935],[36.24667204704262,-121.2090552494298],[36.25255934797489,-121.2118843832761],[36.25230201959292,-121.2122775393801]], swLat:36.2467,swLng:-121.2147,neLat:36.2526,neLng:-121.2091, activities:{} },
        { id:6, name:'San Felipe Hollister 1', area:0, polygon:[[36.95306867300995,-121.3977566935503],[36.95418900053703,-121.3969511394514],[36.95443365198027,-121.3970785436669],[36.95466297375346,-121.3977096421011],[36.95453950150245,-121.3978284305833],[36.95420491128261,-121.3980809343995],[36.95398679921322,-121.3982623990988],[36.95383913360727,-121.3988778015075],[36.95378794622934,-121.3990894563319],[36.95364102581039,-121.3991991900838],[36.95326154452223,-121.399019596118],[36.95320567854924,-121.3989403609047],[36.95316912858151,-121.3983707572144],[36.95315651547126,-121.397923281076],[36.95315373761698,-121.3978235397327],[36.95306867300995,-121.3977566935503]], swLat:36.9531,swLng:-121.3992,neLat:36.9547,neLng:-121.3969, activities:{} },
        { id:7, name:'San Felipe Hollister 2', area:0, polygon:[[36.95293279927481,-121.3977598841651],[36.9523662540721,-121.3971336918547],[36.9522978548343,-121.3967959740185],[36.95193298515505,-121.3963766215909],[36.95193624736338,-121.3961094918405],[36.95223369911366,-121.3958283565424],[36.95265999071457,-121.3963378236542],[36.95274440116091,-121.3964155712739],[36.95291039378772,-121.3965058734006],[36.95322321736425,-121.3965151826615],[36.95339967636288,-121.3965665570441],[36.95412037138308,-121.3969138210308],[36.95345149689265,-121.3973792603408],[36.95293279927481,-121.3977598841651]], swLat:36.9519,swLng:-121.3978,neLat:36.9541,neLng:-121.3958, activities:{} },
        { id:8, name:'San Felipe Hollister 3', area:0, polygon:[[36.9522374863292,-121.3969719089957],[36.95240213254477,-121.3972716562473],[36.95295048641958,-121.3978562216961],[36.95259743632715,-121.3981063239486],[36.95244071873702,-121.3980438952503],[36.95216832340233,-121.3974965994407],[36.95208146003897,-121.3970275934686],[36.9522374863292,-121.3969719089957]], swLat:36.9521,swLng:-121.3981,neLat:36.9530,neLng:-121.3969, activities:{} }
    ].map(f => {
        ACTIVITIES.forEach(a => { if (!f.activities[a.id]) f.activities[a.id] = { sessions: [] }; });
        return f;
    });
}

function loadFields() {
    try {
        const data = localStorage.getItem('hb_fields');
        if (!data) return getDefaultFields();
        let fields = JSON.parse(data);
        if (!Array.isArray(fields)) return getDefaultFields();

        fields = fields.map(f => {
            if (!f.activities) f.activities = {};
            ACTIVITIES.forEach(a => {
                if (!f.activities[a.id]) f.activities[a.id] = {};

                if (f.activities[a.id].workers && !f.activities[a.id].sessions) {
                    const wList = f.activities[a.id].workers;
                    if (Array.isArray(wList)) {
                        f.activities[a.id].sessions = wList.map(w => ({
                            date: w.date || new Date().toISOString().split('T')[0],
                            workers: [{ workerId: w.workerId, startTime: w.startTime || '07:00' }],
                            hours: w.hours || 0,
                            acres: w.acres || 0
                        }));
                    } else {
                        f.activities[a.id].sessions = [];
                    }
                    delete f.activities[a.id].workers;
                }

                if (!Array.isArray(f.activities[a.id].sessions)) {
                    f.activities[a.id].sessions = [];
                }
            });
            return f;
        });

        localStorage.setItem('hb_fields', JSON.stringify(fields));
        return fields;
    } catch (e) {
        console.error('loadFields error:', e);
        return getDefaultFields();
    }
}
function saveFields(f) { localStorage.setItem('hb_fields', JSON.stringify(f)); markLocalSave(); scheduleCloudPush(); }

// ===== CALCULATIONS =====
function calculateAcres(polygon) {
    const R = 6371008.8, toRad = Math.PI / 180, n = polygon.length - 1;
    if (n < 3) return 0;
    let area = 0;
    for (let i = 0; i < n; i++) {
        const [lat1, lng1] = polygon[i], [lat2, lng2] = polygon[i + 1];
        area += (lng2 - lng1) * toRad * (2 + Math.sin(lat1 * toRad) + Math.sin(lat2 * toRad));
    }
    return parseFloat((Math.abs(area * R * R / 2) / 4046.85642).toFixed(1));
}

function getActivityProgress(activity, fieldAcres) {
    if (!activity || !activity.sessions || activity.sessions.length === 0) return 0;
    const totalAcres = activity.sessions.reduce((s, sess) => s + (parseFloat(sess.acres) || 0), 0);
    return fieldAcres > 0 ? Math.min(100, Math.round((totalAcres / fieldAcres) * 100)) : 0;
}

function getActivityStats(activity) {
    if (!activity || !activity.sessions || activity.sessions.length === 0) return { totalHours: 0, totalAcres: 0, avgTimePerAcre: '0.00', workerCount: 0, sessionCount: 0 };
    const totalHours = activity.sessions.reduce((s, sess) => s + (parseFloat(sess.hours) || 0), 0);
    const totalAcres = activity.sessions.reduce((s, sess) => s + (parseFloat(sess.acres) || 0), 0);
    const allWorkerIds = new Set();
    activity.sessions.forEach(sess => (sess.workers || []).forEach(w => allWorkerIds.add(w.workerId)));
    return {
        totalHours: totalHours.toFixed(1),
        totalAcres: totalAcres.toFixed(1),
        avgTimePerAcre: totalAcres > 0 ? (totalHours / totalAcres).toFixed(2) : '0.00',
        workerCount: allWorkerIds.size,
        sessionCount: activity.sessions.length
    };
}

function calculateFieldProgress(field) {
    const fieldAcres = field.area || calculateAcres(field.polygon);
    let total = 0, count = 0;
    ACTIVITIES.forEach(act => {
        const activity = field.activities[act.id];
        if (activity) { total += getActivityProgress(activity, fieldAcres); count++; }
    });
    return count > 0 ? Math.round(total / count) : 0;
}

// ===== SUPERVISOR AUTH =====
let isSupervisor = localStorage.getItem('hb_supervisor') === 'true';

function applySupervisorState() {
    if (isSupervisor) {
        document.body.classList.remove('not-supervisor');
        document.body.classList.add('is-supervisor');
        document.getElementById('btn-login').classList.add('hidden');
        document.getElementById('supervisor-badge').classList.remove('hidden');
        document.getElementById('supervisor-badge').classList.add('flex');
        document.getElementById('login-error').classList.add('hidden');
    } else {
        document.body.classList.remove('is-supervisor');
        document.body.classList.add('not-supervisor');
        document.getElementById('btn-login').classList.remove('hidden');
        document.getElementById('supervisor-badge').classList.add('hidden');
        document.getElementById('supervisor-badge').classList.remove('flex');
    }
}

function setSupervisorState(state) {
    isSupervisor = state;
    if (state) {
        localStorage.setItem('hb_supervisor', 'true');
    } else {
        localStorage.removeItem('hb_supervisor');
    }
    applySupervisorState();
}

document.getElementById('login-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const user = document.getElementById('login-user').value;
    const pass = document.getElementById('login-pass').value;
    if (user === SUPERVISOR_USER.username && pass === SUPERVISOR_USER.password) {
        setSupervisorState(true);
        document.getElementById('login-modal').classList.add('hidden');

        if (window.PasswordCredential) {
            const cred = new PasswordCredential({ id: user, password: pass });
            navigator.credentials.store(cred).catch(() => {});
        }

        renderAll();
    } else {
        document.getElementById('login-error').classList.remove('hidden');
    }
});

function doLogout() {
    setSupervisorState(false);
    renderAll();
}
window.doLogout = doLogout;

// ===== WORKERS =====
document.getElementById('worker-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const workers = loadWorkers();
    workers.push({ id: nextWorkerId(), name: document.getElementById('worker-name').value });
    saveWorkers(workers);
    this.reset();
    renderAll();
});

function renderWorkers() {
    const workers = loadWorkers();
    document.getElementById('workers-list').innerHTML = workers.map(w => `
        <div class="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
            <div><span class="text-xs font-mono text-ranch-brown">${w.id}</span><span class="ml-2 font-medium text-gray-800">${w.name}</span></div>
            <button onclick="removeWorker('${w.id}')" class="edit-only text-red-500 hover:text-red-700 text-sm">✕</button>
        </div>
    `).join('');
}

function removeWorker(id) {
    if (!isSupervisor) return;
    saveWorkers(loadWorkers().filter(w => w.id !== id));
    renderAll();
}
window.removeWorker = removeWorker;

// ===== FIELD DRAFT (POLYGON MODE) =====
const fieldDraft = {
    mode: 'rectangle',
    points: [],
    gpsWatchId: null,
    mapLayers: [],
    drawingActive: false,
    lastGpsPoint: null
};

function getFieldCaptureMode() {
    return document.getElementById('field-capture-mode')?.value || 'rectangle';
}

function getClosedDraftPolygon() {
    if (fieldDraft.points.length < 3) return [];
    const first = fieldDraft.points[0];
    const last = fieldDraft.points[fieldDraft.points.length - 1];
    const isClosed = first[0] === last[0] && first[1] === last[1];
    return isClosed ? [...fieldDraft.points] : [...fieldDraft.points, first];
}

function getDraftAreaAcres() {
    const poly = getClosedDraftPolygon();
    if (poly.length < 4) return 0;
    return calculateAcres(poly);
}

function setFieldCaptureModeUI() {
    const mode = getFieldCaptureMode();
    fieldDraft.mode = mode;
    const rect = document.getElementById('rectangle-coords');
    const poly = document.getElementById('polygon-coords');
    const mapTools = document.getElementById('map-draft-tools');
    const mapEl = document.getElementById('map');
    const swLatEl = document.getElementById('sw-lat');
    const swLngEl = document.getElementById('sw-lng');
    const neLatEl = document.getElementById('ne-lat');
    const neLngEl = document.getElementById('ne-lng');
    if (!rect || !poly) return;
    if (mode === 'polygon') {
        rect.classList.add('hidden');
        poly.classList.remove('hidden');
        swLatEl?.removeAttribute('required');
        swLngEl?.removeAttribute('required');
        neLatEl?.removeAttribute('required');
        neLngEl?.removeAttribute('required');
        if (isSupervisor && mapTools) mapTools.classList.remove('hidden');
        if (mapEl) mapEl.classList.add('ring-4', 'ring-blue-300');
        mapEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
        rect.classList.remove('hidden');
        poly.classList.add('hidden');
        swLatEl?.setAttribute('required', 'required');
        swLngEl?.setAttribute('required', 'required');
        neLatEl?.setAttribute('required', 'required');
        neLngEl?.setAttribute('required', 'required');
        if (mapTools) mapTools.classList.add('hidden');
        if (mapEl) mapEl.classList.remove('ring-4', 'ring-blue-300');
        fieldDraft.drawingActive = false;
    }
    syncDrawingStatusUI();
    renderDraftPointList();
    renderDraftOnMap();
}

function renderDraftPointList() {
    const countEl = document.getElementById('draft-point-count');
    const textEl = document.getElementById('draft-points-text');
    const mapCountEl = document.getElementById('map-draft-count');
    const areaEl = document.getElementById('draft-area-acres');
    const mapAreaEl = document.getElementById('map-draft-area');
    const areaInput = document.getElementById('field-area');
    if (!countEl || !textEl) return;
    countEl.textContent = String(fieldDraft.points.length);
    if (mapCountEl) mapCountEl.textContent = String(fieldDraft.points.length);
    const draftArea = getDraftAreaAcres();
    if (areaEl) areaEl.textContent = draftArea.toFixed(1);
    if (mapAreaEl) mapAreaEl.textContent = draftArea.toFixed(1);
    if (fieldDraft.mode === 'polygon' && areaInput && draftArea > 0) areaInput.value = String(draftArea.toFixed(1));
    if (fieldDraft.points.length === 0) {
        textEl.value = '';
        return;
    }
    textEl.value = fieldDraft.points
        .map((p, i) => `${i + 1}. ${p[0].toFixed(6)}, ${p[1].toFixed(6)}`)
        .join('\n');
}

function clearDraftMapLayers() {
    if (!map || !fieldDraft.mapLayers.length) return;
    fieldDraft.mapLayers.forEach(layer => map.removeLayer(layer));
    fieldDraft.mapLayers = [];
}

function renderDraftOnMap() {
    clearDraftMapLayers();
    if (!map || fieldDraft.mode !== 'polygon' || fieldDraft.points.length === 0) return;

    fieldDraft.points.forEach((pt, idx) => {
        const marker = L.marker(pt, {
            draggable: isSupervisor && fieldDraft.mode === 'polygon',
            icon: L.divIcon({
                className: 'draft-vertex-icon',
                html: '<div style="position:relative;width:46px;height:64px;">' +
                    '<div style="position:absolute;left:50%;top:2px;transform:translateX(-50%);width:34px;height:34px;border-radius:9999px;background:#3b82f6;border:3px solid #1d4ed8;box-shadow:0 3px 10px rgba(0,0,0,.28);"></div>' +
                    '<div style="position:absolute;left:50%;top:36px;transform:translateX(-50%);width:3px;height:16px;background:#1d4ed8;border-radius:9999px;"></div>' +
                    '<div style="position:absolute;left:50%;top:50px;transform:translateX(-50%);width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:12px solid #1d4ed8;"></div>' +
                    '<div style="position:absolute;left:50%;top:58px;transform:translateX(-50%);width:8px;height:8px;border-radius:9999px;background:#ffffff;border:2px solid #1d4ed8;"></div>' +
                    '</div>',
                iconSize: [46, 64],
                iconAnchor: [23, 62]
            })
        }).addTo(map);
        marker.bindTooltip(String(idx + 1), { permanent: true, direction: 'top', offset: [0, -10] });
        marker.on('dragend', () => {
            const ll = marker.getLatLng();
            fieldDraft.points[idx] = [ll.lat, ll.lng];
            renderDraftPointList();
            renderDraftOnMap();
        });
        fieldDraft.mapLayers.push(marker);
    });

    if (fieldDraft.points.length >= 2) {
        const line = L.polyline(fieldDraft.points, {
            color: '#2563eb',
            weight: 2,
            dashArray: '4,4'
        }).addTo(map);
        fieldDraft.mapLayers.push(line);
    }

    if (fieldDraft.points.length >= 3) {
        const closed = [...fieldDraft.points, fieldDraft.points[0]];
        const poly = L.polygon(closed, {
            color: '#1d4ed8',
            weight: 2,
            fillColor: '#60a5fa',
            fillOpacity: 0.2
        }).addTo(map);
        fieldDraft.mapLayers.push(poly);
    }
}

function addDraftPoint(lat, lng) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    fieldDraft.points.push([lat, lng]);
    renderDraftPointList();
    renderDraftOnMap();
}

function syncDrawingStatusUI() {
    const drawBtn = document.getElementById('btn-draft-draw');
    const drawBtnMap = document.getElementById('btn-draft-draw-map');
    const statusForm = document.getElementById('draft-drawing-status');
    const statusMap = document.getElementById('map-drawing-status');
    const active = fieldDraft.drawingActive;

    if (drawBtn) drawBtn.textContent = active ? 'Stop Drawing' : 'Start Drawing';
    if (drawBtnMap) drawBtnMap.textContent = active ? 'Stop Drawing' : 'Start Drawing';
    if (statusForm) statusForm.textContent = `Drawing status: ${active ? 'active' : 'paused'}`;
    if (statusMap) statusMap.textContent = `Drawing: ${active ? 'active' : 'paused'}`;
}

function toggleDraftDrawing() {
    if (fieldDraft.mode !== 'polygon') return;
    if (!fieldDraft.drawingActive) {
        clearDraftPolygon();
        fieldDraft.drawingActive = true;
    } else {
        fieldDraft.drawingActive = false;
    }
    syncDrawingStatusUI();
}
window.toggleDraftDrawing = toggleDraftDrawing;

function undoDraftPoint() {
    if (fieldDraft.points.length === 0) return;
    fieldDraft.points.pop();
    renderDraftPointList();
    renderDraftOnMap();
}
window.undoDraftPoint = undoDraftPoint;

function clearDraftPolygon() {
    fieldDraft.points = [];
    fieldDraft.lastGpsPoint = null;
    renderDraftPointList();
    renderDraftOnMap();
}
window.clearDraftPolygon = clearDraftPolygon;

function distanceMeters(lat1, lng1, lat2, lng2) {
    const toRad = Math.PI / 180;
    const R = 6371000;
    const dLat = (lat2 - lat1) * toRad;
    const dLng = (lng2 - lng1) * toRad;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function shouldAcceptGpsPoint(lat, lng) {
    if (!fieldDraft.lastGpsPoint) return true;
    const [prevLat, prevLng] = fieldDraft.lastGpsPoint;
    return distanceMeters(prevLat, prevLng, lat, lng) >= 3;
}

function explainGpsError(err) {
    if (!err) return 'Could not read GPS position.';
    if (err.code === 1) return 'GPS permission denied. Allow location access in browser settings.';
    if (err.code === 2) return 'GPS position unavailable. Try moving to open sky and retry.';
    if (err.code === 3) return 'GPS timeout. Retry and keep location services enabled.';
    return `GPS error: ${err.message || 'unknown'}`;
}

function addGpsPointToDraft() {
    if (!navigator.geolocation) {
        alert('GPS is not available in this browser.');
        return;
    }
    if (fieldDraft.mode !== 'polygon') {
        alert('Switch Capture Mode to Polygon first.');
        return;
    }
    if (!fieldDraft.drawingActive) {
        alert('Press Start Drawing before adding GPS points.');
        return;
    }
    navigator.geolocation.getCurrentPosition(
        pos => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            if (!shouldAcceptGpsPoint(lat, lng)) return;
            addDraftPoint(lat, lng);
            fieldDraft.lastGpsPoint = [lat, lng];
        },
        err => alert(explainGpsError(err)),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}
window.addGpsPointToDraft = addGpsPointToDraft;

function toggleGpsTrack() {
    const btn = document.getElementById('btn-gps-track');
    const mapBtn = document.getElementById('btn-gps-track-map');
    if (!navigator.geolocation) {
        alert('GPS is not available in this browser.');
        return;
    }
    if (fieldDraft.mode !== 'polygon') {
        alert('Switch Capture Mode to Polygon first.');
        return;
    }
    if (!fieldDraft.drawingActive) {
        alert('Press Start Drawing before starting GPS track.');
        return;
    }
    if (fieldDraft.gpsWatchId) {
        navigator.geolocation.clearWatch(fieldDraft.gpsWatchId);
        fieldDraft.gpsWatchId = null;
        if (btn) btn.textContent = 'Start GPS Track';
        if (mapBtn) mapBtn.textContent = 'Start Track';
        return;
    }
    fieldDraft.gpsWatchId = navigator.geolocation.watchPosition(
        pos => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            if (!shouldAcceptGpsPoint(lat, lng)) return;
            addDraftPoint(lat, lng);
            fieldDraft.lastGpsPoint = [lat, lng];
        },
        err => alert(explainGpsError(err)),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
    if (btn) btn.textContent = 'Stop GPS Track';
    if (mapBtn) mapBtn.textContent = 'Stop Track';
}
window.toggleGpsTrack = toggleGpsTrack;

function stopGpsTrack() {
    if (!fieldDraft.gpsWatchId) return;
    navigator.geolocation.clearWatch(fieldDraft.gpsWatchId);
    fieldDraft.gpsWatchId = null;
    const btn = document.getElementById('btn-gps-track');
    const mapBtn = document.getElementById('btn-gps-track-map');
    if (btn) btn.textContent = 'Start GPS Track';
    if (mapBtn) mapBtn.textContent = 'Start Track';
}

function handleMapDraftClick(e) {
    if (!isSupervisor) return;
    if (fieldDraft.mode !== 'polygon') return;
    if (!fieldDraft.drawingActive) return;
    if (!e || !e.latlng) return;
    addDraftPoint(e.latlng.lat, e.latlng.lng);
}

// ===== RENDER FIELDS =====
function renderFields() {
    const fields = loadFields();
    const grid = document.getElementById('fields-grid');
    grid.innerHTML = '';

    fields.forEach(field => {
        const progress = calculateFieldProgress(field);
        const fieldAcres = field.area || calculateAcres(field.polygon);
        const centerLat = (field.swLat + field.neLat) / 2;
        const centerLng = (field.swLng + field.neLng) / 2;

        let actsHTML = '';
        ACTIVITIES.forEach(act => {
            const activity = field.activities[act.id] || { workers: [] };
            const stats = getActivityStats(activity);
            const actProgress = getActivityProgress(activity, fieldAcres);
            const color = actProgress === 0 ? 'text-gray-400' : actProgress < 50 ? 'text-yellow-600' : 'text-green-600';
            const workers = loadWorkers();

            actsHTML += `
                <div class="border rounded-lg overflow-hidden" data-act-id="${act.id}">
                    <div class="flex items-center justify-between p-3 bg-gray-50 cursor-pointer" onclick="toggleActivity(this)">
                        <div class="flex items-center gap-2 flex-1"><span class="text-lg">${act.icon}</span><span class="text-sm font-medium text-gray-700">${act.name}</span></div>
                        <div class="flex items-center gap-2">
                            ${stats.sessionCount > 0 ? `<span class="text-xs bg-ranch-light/20 text-ranch-green px-2 py-0.5 rounded-full">${stats.sessionCount} session${stats.sessionCount > 1 ? 's' : ''}</span>` : ''}
                            ${stats.workerCount > 0 ? `<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">${stats.workerCount} worker${stats.workerCount > 1 ? 's' : ''}</span>` : ''}
                            <span class="text-sm font-bold ${color}">${actProgress}%</span>
                            <span class="text-xs text-gray-400">▼</span>
                        </div>
                    </div>
                    <div class="activity-section bg-white">
                        ${isSupervisor ? `
                        <div class="p-3 border-t bg-gray-50/50" data-act-input="${act.id}" data-field-id="${field.id}">
                            <div class="space-y-2">
                                <div class="flex flex-wrap gap-2">
                                    <label class="text-xs font-semibold text-gray-600 self-center">Workers:</label>
                                    ${workers.map(w => `
                                        <label class="flex items-center gap-1 bg-white border rounded-full px-3 py-1.5 cursor-pointer">
                                            <input type="checkbox" class="act-worker-cb w-4 h-4 accent-ranch-green" value="${w.id}">
                                            <span class="text-sm">${w.name}</span>
                                        </label>
                                    `).join('')}
                                </div>
                                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    <div>
                                        <label class="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Date</label>
                                        <input type="date" class="act-date w-full text-sm border-2 border-gray-300 rounded-lg px-3 py-2.5 focus:border-ranch-green" value="${new Date().toISOString().split('T')[0]}">
                                    </div>
                                    <div>
                                        <label class="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Start</label>
                                        <input type="time" class="act-start w-full text-sm border-2 border-gray-300 rounded-lg px-3 py-2.5 focus:border-ranch-green" value="07:00">
                                    </div>
                                    <div>
                                        <label class="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Hours</label>
                                        <input type="text" inputmode="decimal" class="act-hours w-full text-sm border-2 border-gray-300 rounded-lg px-3 py-2.5 focus:border-ranch-green" placeholder="0.0">
                                    </div>
                                    <div>
                                        <label class="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Acres</label>
                                        <input type="text" inputmode="decimal" class="act-acres w-full text-sm border-2 border-gray-300 rounded-lg px-3 py-2.5 focus:border-ranch-green" placeholder="0.0">
                                    </div>
                                </div>
                                <div>
                                    <label class="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Comments (optional)</label>
                                    <input type="text" class="act-comments w-full text-sm border-2 border-gray-300 rounded-lg px-3 py-2.5 focus:border-ranch-green" placeholder="e.g., Fast work, good crew, weather delay...">
                                </div>
                                <button onclick="addSession(${field.id},'${act.id}')" class="w-full bg-ranch-green hover:bg-ranch-light text-white font-bold py-2.5 rounded-lg transition-colors text-sm active:scale-95">+ Add Work Session</button>
                            </div>
                        </div>` : ''}
                        ${stats.sessionCount > 0 ? `
                        <div class="p-3 border-t space-y-2">
                            ${(activity.sessions || []).map((sess, idx) => `
                                <div class="bg-white border border-gray-200 rounded-lg p-2.5">
                                    <div class="flex items-center justify-between mb-1">
                                        <span class="text-xs text-gray-500">Date ${sess.date || '--'} · ${sess.startTime || '--:--'}</span>
                                        ${isSupervisor ? `<button onclick="removeSession(${field.id},'${act.id}',${idx})" class="text-red-500 w-7 h-7 flex items-center justify-center rounded-full bg-red-50 hover:bg-red-100">✕</button>` : ''}
                                    </div>
                                    <div class="flex items-center justify-between">
                                        <span class="text-xs text-gray-600">Workers ${(sess.workers || []).map(w => getWorkerName(w.workerId)).join(', ')}</span>
                                        <span class="text-sm font-bold text-ranch-green">${sess.hours}h · ${sess.acres}ac</span>
                                    </div>
                                    ${sess.comments ? `<div class="mt-1 text-xs text-gray-500 italic bg-gray-50 rounded px-2 py-1">Notes ${sess.comments}</div>` : ''}
                                </div>
                            `).join('')}
                            <div class="flex flex-col sm:flex-row sm:justify-between text-sm bg-ranch-green/10 rounded-lg p-2.5">
                                <span class="font-semibold text-ranch-green">Avg: ${stats.avgTimePerAcre} hrs/acre</span>
                                <span class="text-gray-600">${stats.totalHours}h total · ${stats.totalAcres}ac</span>
                            </div>
                        </div>` : ''}
                    </div>
                </div>
            `;
        });

        grid.innerHTML += `
            <div id="field-card-${field.id}" class="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-2xl transition-all">
                <div class="bg-gradient-to-br ${getProgressBg(progress)} p-6 text-center">
                    <h3 class="text-lg font-bold text-gray-800">${field.name}</h3>
                    <div class="text-7xl font-black ${getProgressColor(progress)} mb-1">${progress}<span class="text-4xl">%</span></div>
                    <p class="text-xs text-gray-600">${fieldAcres} acres</p>
                </div>
                <div class="p-4"><div class="space-y-2">${actsHTML}</div></div>
                <div class="px-4 pb-4">
                    <div class="bg-gray-50 rounded-lg p-3 text-xs">
                        <button type="button" onclick="focusFieldOnMap(${field.id})" class="text-blue-600 hover:text-blue-700 font-semibold">View on Map</button>
                    </div>
                </div>
                <div class="px-4 pb-4 flex gap-2">
                    <button onclick="deleteField(${field.id})" class="edit-only bg-red-500 hover:bg-red-600 text-white font-semibold px-4 py-2 rounded-lg transition-colors text-sm">Delete</button>
                </div>
            </div>
        `;
    });

    updateOverallStats(fields);
    setTimeout(() => updateMap(), 100);
}

function toggleActivity(el) {
    const section = el.nextElementSibling;
    section.classList.toggle('expanded');
}
window.toggleActivity = toggleActivity;

function addSession(fieldId, actId) {
    if (!isSupervisor) return;
    const container = document.querySelector(`[data-act-input="${actId}"][data-field-id="${fieldId}"]`);
    if (!container) { alert('Container not found'); return; }
    const cbs = container.querySelectorAll('.act-worker-cb:checked');
    if (cbs.length === 0) { alert('Select at least one worker'); return; }
    const selectedWorkerIds = Array.from(cbs).map(cb => cb.value);
    const date = container.querySelector('.act-date').value || new Date().toISOString().split('T')[0];
    const startTime = container.querySelector('.act-start').value || '07:00';
    const hours = parseFloat(container.querySelector('.act-hours').value) || 0;
    const acres = parseFloat(container.querySelector('.act-acres').value) || 0;
    if (hours === 0 && acres === 0) { alert('Enter hours or acres'); return; }

    const startParts = startTime.split(':');
    const startHour = parseInt(startParts[0]);
    const startMin = parseInt(startParts[1]) || 0;
    const startDecimal = startHour + (startMin / 60);
    const endDecimal = startDecimal + hours;

    if (endDecimal > 24) {
        const remaining = (24 - startDecimal).toFixed(1);
        alert(`Session cannot exceed 24 hours. Start ${startTime}. Max allowed: ${remaining} hours.`);
        return;
    }

    const fields = loadFields();
    const field = fields.find(f => f.id === fieldId);
    const fieldAcres = field.area || calculateAcres(field.polygon);

    let totalAssigned = 0;
    const actData = field.activities[actId];
    if (actData && actData.sessions) {
        actData.sessions.forEach(s => { totalAssigned += parseFloat(s.acres) || 0; });
    }
    const remaining = fieldAcres - totalAssigned;
    if (acres > remaining + 0.01) {
        alert(`Not enough acres remaining for this activity. Remaining: ${remaining.toFixed(1)}.`);
        return;
    }

    const workersList = loadWorkers();
    const conflicts = [];
    const newStartMin = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1] || '0');
    const newEndMin = newStartMin + (hours * 60);

    fields.forEach(f => {
        ACTIVITIES.forEach(a => {
            const act = f.activities[a.id];
            if (!act || !act.sessions) return;
            act.sessions.forEach(sess => {
                if (sess.date !== date) return;

                const workersInExistingSession = selectedWorkerIds.filter(wId =>
                    (sess.workers || []).some(w => w.workerId === wId)
                );

                if (workersInExistingSession.length > 0) {
                    const existingStartMin = parseInt(sess.startTime.split(':')[0]) * 60 + parseInt(sess.startTime.split(':')[1] || '0');
                    const existingEndMin = existingStartMin + ((parseFloat(sess.hours) || 0) * 60);

                    if (newStartMin < existingEndMin && existingStartMin < newEndMin) {
                        workersInExistingSession.forEach(wId => {
                            const workerName = workersList.find(w => w.id === wId)?.name || wId;
                            const fieldName = f.name;
                            const actName = ACTIVITIES.find(x => x.id === a.id)?.name || a.id;
                            conflicts.push(`${workerName} has conflict on ${date} in ${fieldName} - ${actName}.`);
                        });
                    }
                }
            });
        });
    });

    if (conflicts.length > 0) {
        alert(`Worker schedule conflict.\n\n${conflicts.join('\n')}`);
        return;
    }

    const comments = (container.querySelector('.act-comments')?.value || '').trim();
    const workersSessionList = selectedWorkerIds.map(wId => ({ workerId: wId, startTime }));
    if (!field.activities[actId].sessions) field.activities[actId].sessions = [];
    field.activities[actId].sessions.push({ date, workers: workersSessionList, hours, acres, startTime, comments });
    saveFields(fields);
    renderAll();
}
window.addSession = addSession;

function removeSession(fieldId, actId, idx) {
    if (!isSupervisor) return;
    if (!confirm('Are you sure you want to delete this work session?')) return;
    const fields = loadFields();
    const field = fields.find(f => f.id === fieldId);
    field.activities[actId].sessions.splice(idx, 1);
    saveFields(fields);
    renderAll();
}
window.removeSession = removeSession;

function getWorkerName(id) { const w = loadWorkers().find(x => x.id === id); return w ? w.name : id; }

// ===== FIELD CRUD =====
document.getElementById('field-form').addEventListener('submit', function(e) {
    e.preventDefault();
    if (!isSupervisor) return;
    const fields = loadFields();
    const mode = getFieldCaptureMode();

    let polygon = [];
    let swLat = null, swLng = null, neLat = null, neLng = null;

    if (mode === 'polygon') {
        if (fieldDraft.points.length < 3) {
            alert('Polygon mode needs at least 3 points.');
            return;
        }
        polygon = getClosedDraftPolygon();

        const lats = polygon.map(p => p[0]);
        const lngs = polygon.map(p => p[1]);
        swLat = Math.min(...lats);
        neLat = Math.max(...lats);
        swLng = Math.min(...lngs);
        neLng = Math.max(...lngs);
    } else {
        swLat = parseFloat(document.getElementById('sw-lat').value);
        swLng = parseFloat(document.getElementById('sw-lng').value);
        neLat = parseFloat(document.getElementById('ne-lat').value);
        neLng = parseFloat(document.getElementById('ne-lng').value);

        if (!Number.isFinite(swLat) || !Number.isFinite(swLng) || !Number.isFinite(neLat) || !Number.isFinite(neLng)) {
            alert('Please provide valid rectangle coordinates.');
            return;
        }
        if (swLat >= neLat || swLng >= neLng) {
            alert('Rectangle is invalid. SW must be lower than NE.');
            return;
        }
        polygon = [[swLat, swLng], [swLat, neLng], [neLat, neLng], [neLat, swLng], [swLat, swLng]];
    }

    let areaInput = parseFloat(document.getElementById('field-area').value);
    if (!Number.isFinite(areaInput) || areaInput <= 0) {
        areaInput = calculateAcres(polygon);
    }

    const nf = {
        id: Date.now(),
        name: document.getElementById('field-name').value,
        area: areaInput || 0,
        swLat,
        swLng,
        neLat,
        neLng,
        activities: {}
    };
    ACTIVITIES.forEach(a => nf.activities[a.id] = { sessions: [] });
    nf.polygon = polygon;
    fields.push(nf);
    saveFields(fields);
    this.reset();
    clearDraftPolygon();
    fieldDraft.drawingActive = false;
    syncDrawingStatusUI();
    stopGpsTrack();
    setFieldCaptureModeUI();
    renderAll();
});

function deleteField(id) {
    if (!isSupervisor || !confirm('Delete this field?')) return;
    saveFields(loadFields().filter(f => f.id !== id));
    renderAll();
}
window.deleteField = deleteField;

// ===== HELPERS =====
function getProgressColor(p) { if(p===0)return 'text-gray-500'; if(p<30)return 'text-red-600'; if(p<70)return 'text-yellow-600'; if(p<100)return 'text-ranch-light'; return 'text-green-600'; }
function getProgressBg(p) { if(p===0)return 'from-gray-100 to-gray-200'; if(p<30)return 'from-red-100 to-red-200'; if(p<70)return 'from-yellow-100 to-yellow-200'; if(p<100)return 'from-ranch-pale to-ranch-light'; return 'from-green-100 to-green-200'; }

function updateOverallStats(fields) {
    document.getElementById('total-fields').textContent = fields.length;
    document.getElementById('active-fields').textContent = fields.filter(f => { const p = calculateFieldProgress(f); return p > 0 && p < 100; }).length;
    document.getElementById('completed-fields').textContent = fields.filter(f => calculateFieldProgress(f) === 100).length;
    const overall = fields.length > 0 ? Math.round(fields.reduce((s, f) => s + calculateFieldProgress(f), 0) / fields.length) : 0;
    document.getElementById('overall-progress').textContent = overall + '%';
}

function updateDateTime() {
    const now = new Date();
    document.getElementById('current-date').textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('current-time').textContent = now.toLocaleTimeString('en-US');
}

// ===== MAP =====
let map = null, fieldMarkers = [];

function updateMap() {
    const fields = loadFields();
    if (fields.length === 0) return;
    if (!map) {
        map = L.map('map').setView([36.6, -121.3], 10);
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(map);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', { maxZoom: 19, pane: 'overlayPane' }).addTo(map);
        map.on('click', handleMapDraftClick);
        const mapTools = document.getElementById('map-draft-tools');
        if (mapTools && L.DomEvent) {
            L.DomEvent.disableClickPropagation(mapTools);
            L.DomEvent.disableScrollPropagation(mapTools);
        }
        setTimeout(() => {
            map.invalidateSize();
            try {
                const allFields = loadFields();
                const bounds = L.latLngBounds(allFields.flatMap(f => f.polygon));
                map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
            } catch(e) {
                console.error(e);
            }
        }, 300);
    } else {
        map.invalidateSize();
    }
    fieldMarkers.forEach(m => map.removeLayer(m));
    fieldMarkers = [];
    fields.forEach(field => {
        const progress = calculateFieldProgress(field);
        const color = progress === 100 ? '#22c55e' : progress === 0 ? '#ef4444' : '#eab308';
        const polygon = L.polygon(field.polygon, { color, weight: 3, fillColor: color, fillOpacity: 0.3 }).addTo(map);
        polygon.on('click', () => { setTimeout(() => scrollToField(field.id), 200); });
        const label = L.marker([(field.swLat + field.neLat) / 2, (field.swLng + field.neLng) / 2], {
            icon: L.divIcon({ className: 'field-label', html: `<div style="background:${color};color:white;padding:6px 10px;border-radius:10px;font-weight:800;font-size:13px;text-align:center;min-width:80px;max-width:140px;box-shadow:0 2px 6px rgba(0,0,0,0.3);font-family:Inter,sans-serif;line-height:1.3;cursor:pointer;" onclick="scrollToField(${field.id})">${field.name}<br>${progress}%</div>`, iconSize: [120, 44], iconAnchor: [60, 22] })
        }).addTo(map);
        fieldMarkers.push(polygon, label);
    });
    renderDraftOnMap();
}

function scrollToField(fieldId) {
    const card = document.getElementById(`field-card-${fieldId}`);
    if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.style.boxShadow = '0 0 0 4px #2D6A4F';
        setTimeout(() => { card.style.boxShadow = ''; }, 2000);
    }
}
window.scrollToField = scrollToField;

function focusFieldOnMap(fieldId) {
    const fields = loadFields();
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;

    const mapEl = document.getElementById('map');
    mapEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    if (!map) {
        updateMap();
    }
    if (!map || !field.polygon || field.polygon.length < 3) return;

    try {
        const bounds = L.latLngBounds(field.polygon);
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
    } catch (e) {
        console.error(e);
    }

    if (mapEl) {
        mapEl.classList.add('ring-4', 'ring-blue-300');
        setTimeout(() => mapEl.classList.remove('ring-4', 'ring-blue-300'), 1400);
    }
}
window.focusFieldOnMap = focusFieldOnMap;

function resetMapView() {
    if (!map) {
        updateMap();
        return;
    }
    const fields = loadFields();
    if (!fields.length) return;
    try {
        const bounds = L.latLngBounds(fields.flatMap(f => f.polygon));
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
    } catch (e) {
        console.error(e);
    }
}
window.resetMapView = resetMapView;

// ===== DASHBOARD =====
let charts = {};

function _renderDashboardInternal() {
    try {
        const fields = loadFields();
        const workers = loadWorkers();

        document.getElementById('report-date').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        let allHours = [], allAcres = [];
        const fieldNames = [], fieldHours = [], fieldAcres = [];
        const workerData = {};

        workers.forEach(w => { workerData[w.id] = { name: w.name, activities: 0, hours: 0, acres: 0 }; });

        fields.forEach(f => {
            const fAcres = f.area || calculateAcres(f.polygon);
            const fieldProgress = calculateFieldProgress(f);
            let fH = 0;
            const fA = fAcres * (fieldProgress / 100);

            ACTIVITIES.forEach(act => {
                const activity = f.activities[act.id];
                const stats = getActivityStats(activity);
                fH += parseFloat(stats.totalHours) || 0;

                (activity.sessions || []).forEach(sess => {
                    (sess.workers || []).forEach(w => {
                        if (workerData[w.workerId]) {
                            workerData[w.workerId].activities++;
                            workerData[w.workerId].hours += parseFloat(sess.hours) || 0;
                            workerData[w.workerId].acres += parseFloat(sess.acres) || 0;
                        }
                    });
                });
            });

            fieldNames.push(f.name);
            fieldHours.push(fH);
            fieldAcres.push(fA);
            allHours.push(fH);
            allAcres.push(fA);
        });

        const uniqueWorkers = Object.values(workerData).filter(w => w.activities > 0);
        const totalHrs = allHours.reduce((a, b) => a + b, 0);
        const totalAc = allAcres.reduce((a, b) => a + b, 0);
        document.getElementById('kpi-total-workers').textContent = uniqueWorkers.length;
        document.getElementById('kpi-total-hours').textContent = totalHrs.toFixed(1) + 'h';
        document.getElementById('kpi-total-acres').textContent = totalAc.toFixed(1);
        document.getElementById('kpi-avg-pace').textContent = totalAc > 0 ? (totalHrs / totalAc).toFixed(2) : '0';

        const actData = ACTIVITIES.map(act => {
            let total = 0;
            fields.forEach(f => {
                total += getActivityProgress(f.activities[act.id], f.area || calculateAcres(f.polygon));
            });
            return fields.length > 0 ? Math.round(total / fields.length) : 0;
        });

        createChart('chart-activity', 'bar', {
            labels: ACTIVITIES.map(a => a.icon + ' ' + a.name),
            datasets: [{
                label: 'Avg Progress %',
                data: actData,
                backgroundColor: ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#EC4899', '#14B8A6', '#F97316'],
                borderRadius: 6
            }]
        }, { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { max: 100 } } });

        const completed = fields.filter(f => calculateFieldProgress(f) === 100).length;
        const inProgress = fields.filter(f => { const p = calculateFieldProgress(f); return p > 0 && p < 100; }).length;
        const notStarted = fields.length - completed - inProgress;

        createChart('chart-fields', 'doughnut', {
            labels: ['Completed', 'In Progress', 'Not Started'],
            datasets: [{ data: [completed, inProgress, notStarted], backgroundColor: ['#22C55E', '#EAB308', '#EF4444'], borderWidth: 0 }]
        }, { responsive: true, maintainAspectRatio: false, cutout: '65%' });

        createChart('chart-hours', 'bar', {
            labels: fieldNames,
            datasets: [{ label: 'Hours', data: fieldHours.map(h => parseFloat(h)), backgroundColor: '#8B5A2B', borderRadius: 6 }]
        }, { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } });

        createChart('chart-acres', 'bar', {
            labels: fieldNames,
            datasets: [{ label: 'Acres', data: fieldAcres.map(a => parseFloat(a)), backgroundColor: '#52B788', borderRadius: 6 }]
        }, { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } });

        document.getElementById('worker-tbody').innerHTML = uniqueWorkers.map(w => `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-3 font-medium">${w.name}</td>
                <td class="p-3 text-center">${w.activities}</td>
                <td class="p-3 text-center">${w.hours.toFixed(1)}</td>
                <td class="p-3 text-center">${w.acres.toFixed(1)}</td>
                <td class="p-3 text-center font-bold text-ranch-green">${w.acres > 0 ? (w.hours / w.acres).toFixed(2) : '0.00'}</td>
            </tr>
        `).join('') || '<tr><td colspan="5" class="p-4 text-center text-gray-500">No worker activity recorded yet</td></tr>';
    } catch (e) {
        console.error('Dashboard error:', e);
    }
}

function createChart(canvasId, type, data, options) {
    if (charts[canvasId]) charts[canvasId].destroy();
    charts[canvasId] = new Chart(document.getElementById(canvasId), {
        type, data, options: { responsive: true, maintainAspectRatio: false, ...options }
    });
}

function initFieldCaptureControls() {
    const modeEl = document.getElementById('field-capture-mode');
    if (!modeEl) return;
    modeEl.addEventListener('change', () => {
        if (getFieldCaptureMode() !== 'polygon') {
            stopGpsTrack();
        }
        setFieldCaptureModeUI();
    });
    setFieldCaptureModeUI();
}

function initCloudUI() {
    const cfg = loadCloudConfig();
    const urlEl = document.getElementById('cloud-url');
    const keyEl = document.getElementById('cloud-key');
    const enabledEl = document.getElementById('cloud-enabled');
    if (urlEl) urlEl.value = cfg.url;
    if (keyEl) keyEl.value = cfg.anonKey;
    if (enabledEl) enabledEl.checked = cfg.enabled;
    cloudSetStatus('idle', cfg.enabled ? 'Cloud configured' : 'Local only');
}

function validateCloudInput(url, anonKey) {
    if (!url || !anonKey) return 'Project URL and Anon Key are required.';
    if (!/^https?:\/\/.+/i.test(url)) return 'Project URL must start with http:// or https://';
    return '';
}

async function testCloudConnection() {
    const url = (document.getElementById('cloud-url')?.value || '').trim();
    const anonKey = (document.getElementById('cloud-key')?.value || '').trim();
    const validation = validateCloudInput(url, anonKey);
    if (validation) { alert(validation); return; }

    const old = loadCloudConfig();
    saveCloudConfig({ url, anonKey, enabled: true });
    try {
        await cloudFetchState();
        cloudSetStatus('ok', 'Cloud connection successful');
    } catch (err) {
        saveCloudConfig(old);
        cloudSetStatus('err', `Cloud test failed: ${err.message}`);
    }
}
window.testCloudConnection = testCloudConnection;

async function syncCloudNow() {
    if (!hasCloudConfig()) {
        alert('Enable and save cloud settings first.');
        return;
    }
    try {
        await cloudPushNow();
    } catch (err) {
        cloudSetStatus('err', `Sync failed: ${err.message}`);
    }
}
window.syncCloudNow = syncCloudNow;

function saveCloudSettings() {
    const url = (document.getElementById('cloud-url')?.value || '').trim();
    const anonKey = (document.getElementById('cloud-key')?.value || '').trim();
    const enabled = Boolean(document.getElementById('cloud-enabled')?.checked);
    if (enabled) {
        const validation = validateCloudInput(url, anonKey);
        if (validation) { alert(validation); return; }
    }
    saveCloudConfig({ url, anonKey, enabled });
    cloudSetStatus('idle', enabled ? 'Cloud settings saved' : 'Local only');
}
window.saveCloudSettings = saveCloudSettings;

// ===== INIT =====
function renderAll() {
    renderWorkers();
    renderFields();
    _renderDashboardInternal();
}

applySupervisorState();
if (isSupervisor) {
    document.getElementById('login-modal').classList.add('hidden');
}
if (!localStorage.getItem(LOCAL_LAST_SAVE_KEY)) {
    markLocalSave();
}
initFieldCaptureControls();
initCloudUI();
renderAll();
cloudPullIfNewer().then(() => renderAll());
updateDateTime();
setInterval(updateDateTime, 1000);

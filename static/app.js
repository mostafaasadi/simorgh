let chart = null;
let snrPoints = [];
const MAX_POINTS = 900;
let lastStatsNow = null;
let activeInfoTip = null;
let cpuPoints = [];
let tempPoints = [];
let ramPoints = [];
const MAX_SYSTEM_POINTS = 30;
const aircraftHistory = new Map();
const MAX_AIRCRAFT_POINTS = 30;
const SPARK_GLYPHS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
const BASE_TITLE = 'Simorgh';
const TAR1090_BASE_URL = '/tar1090/';
let tar1090BaseUrl = TAR1090_BASE_URL;
let recentExpanded = false;
let lastRecentSignature = null;
const profileCache = new Map();
const recentCharts = [];
const expandedProfiles = new Set();
const INFO_ICON = '<svg class="icon"><use href="#i-info"></use></svg>';
const EXTERNAL_LINK_ICON = '<svg class="icon link-icon"><use href="#i-external"></use></svg>';
const RESTART_ICON = '<svg class="icon"><use href="#i-restart"></use></svg>';
const STOP_ICON = '<svg class="icon"><use href="#i-stop"></use></svg>';
const renderedActions = {};

document.addEventListener('DOMContentLoaded', () => {
    bindServiceControls();
    bindInfoTips();
    bindRecentToggle();
    bindRecentExpand();
    initChart();
    refresh();
    setInterval(refresh, 2000);
    if (window.lucide) {
        window.lucide.createIcons();
    }
});

async function refresh() {
    try {
        const response = await fetch('/simorgh/api/panel', {
            cache: 'no-store'
        });
        if (!response.ok) {
            throw new Error('panel request failed');
        }
        const data = await response.json();
        if (data.links && data.links.tar1090) {
            tar1090BaseUrl = data.links.tar1090;
        }
        renderSystem(data.system);
        renderServices(data.services, data.service ? data.service.name : null);
        renderRtlSdr(data.receiver ? data.receiver.rtl_sdr : null);
        renderReceiver(data.receiver, data.aircraft);
        renderAircraft(data.aircraft || {});
        renderRecent(data.recent, data.receiver ? data.receiver.stats_now : null);
        updateChart(data.receiver ? data.receiver.snr_db_5m : null, data.receiver ? data.receiver.stats_now : null);
    } catch (error) {
        console.error(error);
    }
}

function initChart() {
    const canvas = document.getElementById('snrChart');
    const empty = document.getElementById('chartEmpty');
    if (!window.Chart || !canvas) {
        if (empty) {
            empty.textContent = 'Chart library unavailable';
            empty.classList.remove('hidden');
        }
        return;
    }
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = 'rgba(148, 163, 184, 0.08)';
    chart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'SNR dB',
                data: [],
                borderColor: '#38bdf8',
                backgroundColor: 'rgba(56, 189, 248, 0.14)',
                fill: true,
                tension: 0.25,
                pointRadius: 0,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    ticks: {
                        maxTicksLimit: 6,
                        maxRotation: 0
                    },
                    grid: {
                        color: 'rgba(148, 163, 184, 0.08)'
                    }
                },
                y: {
                    ticks: {
                        maxTicksLimit: 6
                    },
                    grid: {
                        color: 'rgba(148, 163, 184, 0.08)'
                    }
                }
            }
        }
    });
}

function updateChart(snr, statsNow) {
    const empty = document.getElementById('chartEmpty');
    if (!chart) {
        if (empty) {
            empty.classList.remove('hidden');
        }
        return;
    }
    if (isNumber(snr) && statsNow !== lastStatsNow) {
        const now = new Date();
        snrPoints.push({
            t: now,
            y: snr
        });
        if (snrPoints.length > MAX_POINTS) {
            snrPoints.shift();
        }
        chart.data.labels = snrPoints.map(point => point.t.toLocaleTimeString([], {
            hour12: false
        }));
        chart.data.datasets[0].data = snrPoints.map(point => point.y);
        chart.update('none');
        lastStatsNow = statsNow;
    }
    if (empty) {
        empty.classList.toggle('hidden', snrPoints.length > 0);
    }
}

function renderSystem(system) {
    if (!system) {
        return;
    }
    setText('cpuUsage', isNumber(system.cpu_usage) ? Math.round(system.cpu_usage) + '%' : 'N/A');
    setText('cpuTemp', isNumber(system.cpu_temp) ? system.cpu_temp + ' °C' : 'N/A');
    setText('ramUsage', isNumber(system.ram_usage) ? Math.round(system.ram_usage) + '%' : 'N/A');
    if (isNumber(system.cpu_usage)) {
        cpuPoints.push(system.cpu_usage);
        if (cpuPoints.length > MAX_SYSTEM_POINTS) cpuPoints.shift();
        drawMiniSparkline('cpuSparkline', cpuPoints, '#38bdf8');
    }
    if (isNumber(system.cpu_temp)) {
        tempPoints.push(system.cpu_temp);
        if (tempPoints.length > MAX_SYSTEM_POINTS) tempPoints.shift();
        drawMiniSparkline('tempSparkline', tempPoints, '#f59e0b');
    }
    if (isNumber(system.ram_usage)) {
        ramPoints.push(system.ram_usage);
        if (ramPoints.length > MAX_SYSTEM_POINTS) ramPoints.shift();
        drawMiniSparkline('ramSparkline', ramPoints, '#10b981');
    }
}

function drawMiniSparkline(canvasId, points, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || points.length < 2) {
        return;
    }
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const width = rect.width;
    const height = rect.height;
    ctx.clearRect(0, 0, width, height);
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    points.forEach((point, index) => {
        const x = (index / (points.length - 1)) * width;
        const y = height - ((point - min) / range) * (height - 2) - 1;
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
}

function updateAircraftHistory(hex, ac) {
    if (!aircraftHistory.has(hex)) {
        aircraftHistory.set(hex, {
            alt: [],
            spd: [],
            vert: [],
            rssi: [],
            dist: []
        });
    }
    const h = aircraftHistory.get(hex);
    h.alt.push(isNumber(ac.alt_m) ? ac.alt_m : null);
    h.spd.push(isNumber(ac.speed_kmh) ? ac.speed_kmh : null);
    h.vert.push(isNumber(ac.vertical_mps) ? ac.vertical_mps : null);
    h.rssi.push(isNumber(ac.rssi_db) ? ac.rssi_db : null);
    h.dist.push(isNumber(ac.distance_km) ? ac.distance_km : null);
    if (h.alt.length > MAX_AIRCRAFT_POINTS) h.alt.shift();
    if (h.spd.length > MAX_AIRCRAFT_POINTS) h.spd.shift();
    if (h.vert.length > MAX_AIRCRAFT_POINTS) h.vert.shift();
    if (h.rssi.length > MAX_AIRCRAFT_POINTS) h.rssi.shift();
    if (h.dist.length > MAX_AIRCRAFT_POINTS) h.dist.shift();
}

function cleanupAircraftHistory(activeHexes) {
    for (const hex of aircraftHistory.keys()) {
        if (!activeHexes.has(hex)) {
            aircraftHistory.delete(hex);
        }
    }
}

function sparklineBarsHtml(points, color) {
    const last8 = points.slice(-8);
    const validInWindow = last8.filter(p => p !== null && p !== undefined);
    if (validInWindow.length === 0) {
        return '';
    }
    const min = Math.min(...validInWindow);
    const max = Math.max(...validInWindow);
    const range = max - min;
    const bars = last8.map(point => {
        if (point === null || point === undefined) {
            return `<span style="color: ${color}; opacity: 0.25">·</span>`;
        }
        let index;
        if (range === 0) {
            index = 6;
        } else {
            const normalized = (point - min) / range;
            index = Math.min(Math.floor(normalized * SPARK_GLYPHS.length), SPARK_GLYPHS.length - 1);
        }
        return `<span style="color: ${color}">${SPARK_GLYPHS[index]}</span>`;
    }).join('');
    return `<div class="sparkline-bars">${bars}</div>`;
}

function renderServices(services, decoderName) {
    if (!services) {
        return;
    }
    if (decoderName && services[decoderName]) {
        const entry = services[decoderName];
        const nameEl = document.getElementById('svcDecoderName');
        const dot = document.getElementById('serviceDot');
        if (nameEl) {
            nameEl.textContent = decoderName;
        }
        if (dot) {
            dot.className = 'status-dot ' + (entry.status === 'running' ? 'active' : 'inactive');
        }
        setServiceStatus('svcDecoderStatus', entry.status);
        renderServiceActions('svcDecoderActions', entry.controllable ? decoderName : null);
    }
    renderServiceEntry('tar1090', services.tar1090, 'svcTar1090', 'svcTar1090Actions');
    renderServiceEntry('graphs1090', services.graphs1090, 'svcGraphs1090', 'svcGraphs1090Actions');
}

function renderServiceEntry(name, entry, statusId, actionsId) {
    if (!entry) {
        return;
    }
    setServiceStatus(statusId, entry.status);
    renderServiceActions(actionsId, entry.controllable ? name : null);
}

function renderServiceActions(containerId, serviceName) {
    const el = document.getElementById(containerId);
    if (!el) {
        return;
    }
    const target = serviceName || null;
    if (renderedActions[containerId] === target) {
        return;
    }
    renderedActions[containerId] = target;
    el.innerHTML = target ? serviceActionsHtml(target) : '';
}

function serviceActionsHtml(name) {
    const safeName = escapeHtml(name);
    return `
        <button class="btn btn-warning btn-sm" data-service-name="${safeName}" data-service-action="restart">
            ${RESTART_ICON}
            <span>Restart</span>
        </button>
        <button class="btn btn-danger btn-sm" data-service-name="${safeName}" data-service-action="stop">
            ${STOP_ICON}
            <span>Stop</span>
        </button>
    `;
}

function setServiceStatus(id, status) {
    const el = document.getElementById(id);
    if (!el) {
        return;
    }
    el.classList.remove('text-success', 'text-warning', 'text-danger');
    if (status === 'running') {
        el.textContent = 'Running';
        el.classList.add('text-success');
    } else if (status === 'stopped') {
        el.textContent = 'Stopped';
        el.classList.add('text-danger');
    } else if (status === 'failed') {
        el.textContent = 'Failed';
        el.classList.add('text-danger');
    } else {
        el.textContent = 'Unknown';
        el.classList.add('text-warning');
    }
}

function renderRtlSdr(rtl) {
    const el = document.getElementById('rtlSdrStatus');
    const idEl = document.getElementById('rtlSdrId');
    if (!el || !rtl) {
        return;
    }
    el.classList.remove('text-success', 'text-warning', 'text-danger');
    if (rtl.status === 'connected') {
        el.textContent = 'Connected';
        el.classList.add('text-success');
    } else if (rtl.status === 'missing') {
        el.textContent = 'Not Detected';
        el.classList.add('text-danger');
    } else {
        el.textContent = 'Unknown';
        el.classList.add('text-warning');
    }
    if (idEl) {
        if (rtl.usb_id) {
            idEl.textContent = rtl.usb_id;
            idEl.classList.remove('hidden');
        } else {
            idEl.textContent = '';
            idEl.classList.add('hidden');
        }
    }
}

function renderReceiver(receiver, aircraft) {
    if (!receiver) {
        return;
    }
    setText('gainDb', formatValue(receiver.gain_db, 'dB'));
    setText('ppmValue', formatValue(receiver.estimated_ppm, 'ppm'));
    setText('snrMetric', formatValue(receiver.snr_db_5m, 'dB'));
    setSnrColor('snrMetric', receiver.snr_db_5m);
    setText('snrCurrent', formatValue(receiver.snr_db_5m, 'dB'));
    setText('signalCurrent', formatValue(receiver.signal_db_5m, 'dB'));
    setText('noiseCurrent', formatValue(receiver.noise_db_5m, 'dB'));
    setText('uptime', formatDuration(receiver.uptime_seconds));
    setText('messagesPerHour', formatValue(receiver.messages_per_hour, '/h'));
    setText('positionsPerHour', formatValue(receiver.positions_per_hour, '/h'));
    setText('positionYield', formatValue(receiver.position_yield, '%'));
    setText('tracksMulti', formatInteger(receiver.tracks_multi));
    setText('trackCompletion', formatValue(receiver.track_completion, '%'));
    if (isNumber(receiver.max_distance_km)) {
        if (receiver.max_distance_km > 0) {
            setText('maxRange', formatValue(receiver.max_distance_km, 'km'));
        } else if (receiver.positions_total > 0) {
            setText('maxRange', 'Unavailable');
        } else {
            setText('maxRange', 'No positions yet');
        }
    } else {
        setText('maxRange', 'N/A');
    }
    setText('lastTraffic', receiver.last_traffic || 'N/A');
}

function renderAircraft(aircraft) {
    const list = document.getElementById('aircraftList');
    const count = document.getElementById('aircraftCount');
    const activeCount = document.getElementById('activeCount');
    if (count) {
        count.textContent = String(aircraft.active_count || 0);
    }
    if (activeCount) {
        activeCount.textContent = String(aircraft.active_count || 0);
    }
    updatePageTitle(aircraft.active_count || 0);
    if (!list) {
        return;
    }
    const items = Array.isArray(aircraft.items) ? aircraft.items : [];
    const activeHexes = new Set();
    items.forEach(item => {
        updateAircraftHistory(item.hex, item);
        activeHexes.add(item.hex);
    });
    cleanupAircraftHistory(activeHexes);
    if (!items.length) {
        list.innerHTML = '<div class="empty">No active aircraft</div>';
        return;
    }
    list.innerHTML = items.map(item => aircraftCard(item)).join('');
}

function updatePageTitle(count) {
    const next = count > 0 ? `(${count}) ${BASE_TITLE}` : BASE_TITLE;
    if (document.title !== next) {
        document.title = next;
    }
}

function renderRecent(recent, statsNow) {
    const list = document.getElementById('recentList');
    const count = document.getElementById('recentCount');
    const items = Array.isArray(recent) ? recent : [];
    const rows = items.filter(visit => visit && visit.hex && !visit.is_open);
    if (count) {
        count.textContent = String(rows.length);
    }
    const minuteBucket = isNumber(statsNow) ? Math.floor(statsNow / 60) : 0;
    const signature = minuteBucket + '|' + rows.map(visit => `${visit.hex}:${visit.last_seen}:${visit.is_open ? 1 : 0}`).join(',');
    if (signature === lastRecentSignature) {
        return;
    }
    lastRecentSignature = signature;
    if (!list) {
        return;
    }
    recentCharts.forEach(instance => instance.destroy());
    recentCharts.length = 0;
    if (!rows.length) {
        list.innerHTML = '<div class="empty">No recent aircraft</div>';
        updateRecentToggleLabel();
        return;
    }
    list.innerHTML = rows.map(visit => recentRowHtml(visit, statsNow)).join('');
    list.querySelectorAll('.recent-row.expanded').forEach(row => {
        const detail = row.querySelector('.recent-detail');
        if (detail && !detail.dataset.loaded) {
            detail.dataset.loaded = '1';
            loadVisitProfile(row, detail);
        }
    });
    updateRecentToggleLabel();
}

function recentRowHtml(visit, statsNow) {
    const title = visit.flight || visit.hex || 'UNKNOWN';
    const tracksUrl = pTracksUrl(visit.hex);
    const profileKey = `${visit.hex}:${visit.first_seen}`;
    const isExpanded = expandedProfiles.has(profileKey);
    const ago = isNumber(statsNow) && isNumber(visit.last_seen)
        ? formatAgo(statsNow - visit.last_seen)
        : 'N/A';
    const timeRange = isNumber(visit.first_seen) && isNumber(visit.last_seen)
        ? `${formatClock(visit.first_seen)}–${formatClock(visit.last_seen)} · ${formatSpan(visit.duration_s)}`
        : 'N/A';
    const metaParts = [];
    if (visit.registration) {
        metaParts.push(escapeHtml(visit.registration));
    }
    if (visit.aircraft_type) {
        metaParts.push(escapeHtml(visit.aircraft_type));
    }
    const badges = `${visit.had_emergency ? '<span class="badge danger">EMG</span>' : ''}${visit.had_position ? '' : '<span class="badge muted">NO POS</span>'}`;
    return `
        <div class="recent-row${isExpanded ? ' expanded' : ''}" data-visit-hex="${escapeHtml(visit.hex)}" data-visit-start="${visit.first_seen}">
            <div class="recent-top">
                <span class="recent-ident">
                    ${registrationFlagHtml(visit.registration)}
                    <span class="recent-title">${escapeHtml(title)}</span>
                    <span class="hex">${escapeHtml(visit.hex || '')}</span>
                    ${metaParts.length ? `<span class="aircraft-meta">${metaParts.join(' · ')}</span>` : ''}
                    ${badges}
                </span>
                <span class="recent-when">
                    <span class="recent-ago">${ago}</span>
                    ${tracksUrl ? `<a class="btn btn-info btn-sm" href="${tracksUrl}" target="_blank" rel="noopener" aria-label="pTracks">${EXTERNAL_LINK_ICON}<span>pTracks</span></a>` : ''}
                    <span class="recent-chevron" aria-hidden="true">▸</span>
                </span>
            </div>
            <div class="recent-metrics">
                <span class="recent-metric">
                    <span>TIME</span>
                    <span class="value">${timeRange}</span>
                </span>
                <span class="recent-metric">
                    <span>MAX ALT</span>
                    <span class="value">${isNumber(visit.max_alt_m) ? Math.round(visit.max_alt_m).toLocaleString() + ' m' : 'N/A'}</span>
                </span>
                <span class="recent-metric">
                    <span>MIN DIST</span>
                    <span class="value">${isNumber(visit.min_distance_km) ? distanceValue(visit.min_distance_km) : 'N/A'}</span>
                </span>
                <span class="recent-metric">
                    <span>BEST RSSI</span>
                    <span class="value ${rssiClass(visit.best_rssi_db)}">${rssiValue(visit.best_rssi_db)}</span>
                </span>
            </div>
            <div class="recent-detail${isExpanded ? '' : ' hidden'}">
                <div class="recent-charts">
                    <div class="recent-chart-block">
                        <span class="recent-chart-label">ALT · SPD</span>
                        <div class="recent-chart-box">
                            <canvas class="recent-chart-altspd"></canvas>
                        </div>
                    </div>
                </div>
                <div class="recent-hdg"></div>
            </div>
        </div>
    `;
}

function bindRecentToggle() {
    const button = document.getElementById('recentToggle');
    if (!button) {
        return;
    }
    button.addEventListener('click', () => {
        recentExpanded = !recentExpanded;
        const list = document.getElementById('recentList');
        if (list) {
            list.classList.toggle('collapsed', !recentExpanded);
        }
        updateRecentToggleLabel();
    });
}

function updateRecentToggleLabel() {
    const button = document.getElementById('recentToggle');
    if (!button) {
        return;
    }
    const list = document.getElementById('recentList');
    const total = list ? list.querySelectorAll('.recent-row').length : 0;
    if (total <= 5) {
        button.classList.add('hidden');
        return;
    }
    button.classList.remove('hidden');
    button.textContent = recentExpanded ? 'Show less' : `Show all (${total})`;
}

function bindRecentExpand() {
    const list = document.getElementById('recentList');
    if (!list) {
        return;
    }
    list.addEventListener('click', event => {
        if (event.target.closest('a')) {
            return;
        }
        const row = event.target.closest('.recent-row');
        if (!row) {
            return;
        }
        const detail = row.querySelector('.recent-detail');
        if (!detail) {
            return;
        }
        const isOpen = row.classList.toggle('expanded');
        detail.classList.toggle('hidden', !isOpen);
        const key = `${row.getAttribute('data-visit-hex')}:${row.getAttribute('data-visit-start')}`;
        if (isOpen) {
            expandedProfiles.add(key);
        } else {
            expandedProfiles.delete(key);
        }
        if (isOpen && !detail.dataset.loaded) {
            detail.dataset.loaded = '1';
            loadVisitProfile(row, detail);
        }
    });
}

async function loadVisitProfile(row, detail) {
    const hex = row.getAttribute('data-visit-hex');
    const firstSeen = Number(row.getAttribute('data-visit-start'));
    const key = `${hex}:${firstSeen}`;
    const altSpdCanvas = detail.querySelector('.recent-chart-altspd');
    const hdg = detail.querySelector('.recent-hdg');
    let payload = profileCache.get(key);
    if (!payload) {
        try {
            const response = await fetch(`/simorgh/api/recent/${encodeURIComponent(hex)}/profile?first_seen=${firstSeen}`, {
                cache: 'no-store'
            });
            if (!response.ok) {
                throw new Error('profile request failed');
            }
            payload = await response.json();
            profileCache.set(key, payload);
        } catch (error) {
            console.error(error);
            if (hdg) {
                hdg.innerHTML = '<span class="recent-hdg-empty">Profile unavailable</span>';
            }
            return;
        }
    }
    const points = Array.isArray(payload.points) ? payload.points : [];
    if (hdg) {
        hdg.innerHTML = headingBlockHtml(points, key);
    }
    renderAltSpdChart(altSpdCanvas, points);
}

function headingDelta(fromDeg, toDeg) {
    const diff = ((toDeg - fromDeg) % 360 + 360) % 360;
    return diff > 180 ? diff - 360 : diff;
}

function analyzeHeadingSeries(points) {
    const valid = points.filter(point => isNumber(point[2]));
    if (!valid.length) {
        return null;
    }
    const firstDeg = valid[0][2];
    const lastDeg = valid[valid.length - 1][2];
    let totalTurn = 0;
    for (let i = 1; i < valid.length; i += 1) {
        totalTurn += headingDelta(valid[i - 1][2], valid[i][2]);
    }
    return {
        firstDeg: firstDeg,
        lastDeg: lastDeg,
        netChange: headingDelta(firstDeg, lastDeg),
        totalTurn: totalTurn
    };
}

function formatTurn(degrees) {
    const rounded = Math.round(degrees);
    const sign = rounded >= 0 ? '+' : '-';
    return `${sign}${Math.abs(rounded)}°`;
}

function analyzeDistanceSeries(points) {
    const valid = points.filter(point => isNumber(point[4]));
    if (valid.length < 2) {
        return null;
    }
    const distStart = valid[0][4];
    const distEnd = valid[valid.length - 1][4];
    const distMin = Math.min(...valid.map(p => p[4]));
    const delta = distEnd - distStart;
    const threshold = Math.max(distStart * 0.1, 2);
    let status = 'stable';
    if (delta < -threshold) {
        status = 'approaching';
    } else if (delta > threshold) {
        status = 'receding';
    }
    if (status === 'receding' && distMin < Math.min(distStart, distEnd) * 0.7) {
        status = 'flyby';
    }
    return {
        status: status,
        distStart: distStart,
        distEnd: distEnd,
        distMin: distMin
    };
}

function distanceStatusIcon(status) {
    if (status === 'approaching') {
        return '<span class="recent-dist-status approaching" title="Approaching">↓</span>';
    }
    if (status === 'receding') {
        return '<span class="recent-dist-status receding" title="Receding">↑</span>';
    }
    if (status === 'flyby') {
        return '<span class="recent-dist-status flyby" title="Fly-by">↔</span>';
    }
    return '<span class="recent-dist-status stable" title="Stable">—</span>';
}

function headingBlockHtml(points, markerKey) {
    const analysis = analyzeHeadingSeries(points);
    if (!analysis) {
        return '<span class="recent-hdg-empty">No heading data</span>';
    }
    const cx = 50;
    const cy = 50;
    const dialRadius = 40;
    const arcRadius = 31;
    const absNet = Math.abs(analysis.netChange);
    const markerId = `hdgArrow${String(markerKey).replace(/[^a-zA-Z0-9]/g, '')}`;
    const toX = (deg, radius) => (cx + radius * Math.sin(deg * Math.PI / 180)).toFixed(2);
    const toY = (deg, radius) => (cy - radius * Math.cos(deg * Math.PI / 180)).toFixed(2);
    let ticksHtml = '';
    for (let angle = 0; angle < 360; angle += 30) {
        const isCardinal = angle % 90 === 0;
        const innerRadius = isCardinal ? 33 : 36;
        ticksHtml += `<line x1="${toX(angle, innerRadius)}" y1="${toY(angle, innerRadius)}" x2="${toX(angle, dialRadius)}" y2="${toY(angle, dialRadius)}" stroke="${isCardinal ? '#64748b' : '#475569'}" stroke-width="1"></line>`;
    }
    const cardinals = [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']];
    let labelsHtml = '';
    cardinals.forEach(([angle, letter]) => {
        labelsHtml += `<text x="${toX(angle, 45)}" y="${toY(angle, 45)}" class="recent-compass-label" text-anchor="middle" dominant-baseline="middle">${letter}</text>`;
    });
    let arcHtml = '';
    if (Math.abs(analysis.totalTurn) >= 360) {
        arcHtml = `<circle cx="${cx}" cy="${cy}" r="${arcRadius}" class="recent-compass-arc"></circle>`;
    } else if (absNet >= 1) {
        const sweep = analysis.netChange > 0 ? 1 : 0;
        const largeArc = absNet > 180 ? 1 : 0;
        arcHtml = `<path d="M ${toX(analysis.firstDeg, arcRadius)} ${toY(analysis.firstDeg, arcRadius)} A ${arcRadius} ${arcRadius} 0 ${largeArc} ${sweep} ${toX(analysis.lastDeg, arcRadius)} ${toY(analysis.lastDeg, arcRadius)}" class="recent-compass-arc" marker-end="url(#${markerId})"></path>`;
    }
    const valid = points.filter(point => isNumber(point[2]));
    const maxArrows = 20;
    const stride = Math.max(1, Math.ceil(valid.length / maxArrows));
    const sampled = valid.filter((point, index) => index % stride === 0);
    const arrows = sampled.map(point => trackArrowHtml(point[2])).join('');
    const turnNote = Math.abs(analysis.totalTurn) >= 360
        ? ` (${(Math.abs(analysis.totalTurn) / 360).toFixed(1)} rev)`
        : '';
    const distAnalysis = analyzeDistanceSeries(points);
    const distIcon = distAnalysis ? distanceStatusIcon(distAnalysis.status) : '';
    return `
        <span class="recent-hdg-head">
            <span>HDG TREND ${distIcon}</span>
            <span class="recent-hdg-range">${Math.round(analysis.firstDeg)}° → ${Math.round(analysis.lastDeg)}°</span>
        </span>
        <span class="recent-hdg-body">
            <span class="recent-compass-dial">
                <svg viewBox="0 0 100 100" role="img" aria-label="Heading compass">
                    <defs>
                        <marker id="${markerId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                            <path d="M0,0 L10,5 L0,10 z" fill="#f59e0b"></path>
                        </marker>
                    </defs>
                    <circle cx="${cx}" cy="${cy}" r="${dialRadius}" fill="none" stroke="rgba(148, 163, 184, 0.25)" stroke-width="1"></circle>
                    ${ticksHtml}
                    ${labelsHtml}
                    ${arcHtml}
                    <line x1="${cx}" y1="${cy}" x2="${toX(analysis.firstDeg, 24)}" y2="${toY(analysis.firstDeg, 24)}" class="recent-compass-needle-first"></line>
                    <line x1="${cx}" y1="${cy}" x2="${toX(analysis.lastDeg, 30)}" y2="${toY(analysis.lastDeg, 30)}" class="recent-compass-needle-last"></line>
                    <circle cx="${cx}" cy="${cy}" r="2.2" fill="#e2e8f0"></circle>
                </svg>
            </span>
            <span class="recent-compass-stats">
                <span class="recent-compass-row">
                    <span>Net Change</span>
                    <strong>${formatTurn(analysis.netChange)}</strong>
                </span>
                <span class="recent-compass-row">
                    <span>Total Turn</span>
                    <strong>${formatTurn(analysis.totalTurn)}${turnNote}</strong>
                </span>
            </span>
        </span>
        <span class="recent-ribbon-track">${arrows}</span>
    `;
}

function renderAltSpdChart(canvas, points) {
    if (!window.Chart || !canvas) {
        return;
    }
    const chartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels: points.map(point => formatClock(point[0])),
            datasets: [{
                label: 'ALT m',
                data: points.map(point => isNumber(point[1]) ? point[1] : null),
                borderColor: '#38bdf8',
                backgroundColor: 'rgba(56, 189, 248, 0.14)',
                fill: true,
                tension: 0.25,
                pointRadius: 0,
                borderWidth: 2,
                spanGaps: true,
                yAxisID: 'y'
            }, {
                label: 'SPD km/h',
                data: points.map(point => isNumber(point[3]) ? point[3] : null),
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                fill: false,
                tension: 0.25,
                pointRadius: 0,
                borderWidth: 2,
                spanGaps: true,
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: false,
                    external: function(context) {
                        renderCustomTooltip(context, points);
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        maxTicksLimit: 4,
                        maxRotation: 0
                    },
                    grid: {
                        color: 'rgba(148, 163, 184, 0.08)'
                    }
                },
                y: {
                    ticks: {
                        maxTicksLimit: 4
                    },
                    grid: {
                        color: 'rgba(148, 163, 184, 0.08)'
                    }
                },
                y1: {
                    position: 'right',
                    ticks: {
                        maxTicksLimit: 4
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                }
            }
        }
    });
    recentCharts.push(chartInstance);
}

function renderCustomTooltip(context, points) {
    let tooltipEl = document.getElementById('chartTooltip');
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'chartTooltip';
        tooltipEl.className = 'chart-tooltip';
        document.body.appendChild(tooltipEl);
    }
    const tooltipModel = context.tooltip;
    if (tooltipModel.opacity === 0) {
        tooltipEl.classList.remove('visible');
        return;
    }
    if (!tooltipModel.dataPoints || !tooltipModel.dataPoints.length) {
        tooltipEl.classList.remove('visible');
        return;
    }
    const dataIndex = tooltipModel.dataPoints[0].dataIndex;
    const point = points[dataIndex];
    if (!point) {
        tooltipEl.classList.remove('visible');
        return;
    }
    const time = formatClock(point[0]);
    const alt = isNumber(point[1]) ? Math.round(point[1]).toLocaleString() + ' m' : 'N/A';
    const spd = isNumber(point[3]) ? Math.round(point[3]).toLocaleString() + ' km/h' : 'N/A';
    const dist = isNumber(point[4]) ? point[4].toFixed(1) + ' km' : 'N/A';
    tooltipEl.innerHTML = `
        <div class="chart-tooltip-time">${time}</div>
        <div class="chart-tooltip-row">
            <span class="chart-tooltip-dot" style="background:#38bdf8"></span>
            <span class="chart-tooltip-label">ALT</span>
            <span class="chart-tooltip-value">${alt}</span>
        </div>
        <div class="chart-tooltip-row">
            <span class="chart-tooltip-dot" style="background:#10b981"></span>
            <span class="chart-tooltip-label">SPD</span>
            <span class="chart-tooltip-value">${spd}</span>
        </div>
        <div class="chart-tooltip-row">
            <span class="chart-tooltip-dot" style="background:#f59e0b"></span>
            <span class="chart-tooltip-label">DIST</span>
            <span class="chart-tooltip-value">${dist}</span>
        </div>
    `;
    const rect = context.chart.canvas.getBoundingClientRect();
    const caretX = tooltipModel.caretX;
    const caretY = tooltipModel.caretY;
    const tooltipWidth = tooltipEl.offsetWidth || 160;
    let left = rect.left + window.scrollX + caretX;
    const minLeft = rect.left + window.scrollX + tooltipWidth / 2 + 8;
    const maxLeft = rect.right + window.scrollX - tooltipWidth / 2 - 8;
    if (left < minLeft) left = minLeft;
    if (left > maxLeft) left = maxLeft;
    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top = (rect.top + window.scrollY + caretY) + 'px';
    tooltipEl.classList.add('visible');
}

const REGISTRATION_COUNTRY = {
    '4K': 'AZ',
    '4L': 'GE',
    '4X': 'IL',
    '5B': 'CY',
    '5N': 'NG',
    '5Y': 'KE',
    '9M': 'MY',
    '9V': 'SG',
    'A4': 'OM',
    'A6': 'AE',
    'A7': 'QA',
    'A9': 'BH',
    'AP': 'PK',
    'CC': 'CL',
    'CU': 'CU',
    'EC': 'ES',
    'EI': 'IE',
    'EK': 'AM',
    'EP': 'IR',
    'ES': 'EE',
    'ET': 'ET',
    'EX': 'KG',
    'EY': 'TJ',
    'EZ': 'TM',
    'HA': 'HU',
    'HB': 'CH',
    'HK': 'CO',
    'HL': 'KR',
    'HZ': 'SA',
    'JA': 'JP',
    'JY': 'JO',
    'LN': 'NO',
    'LQ': 'AR',
    'LV': 'AR',
    'LY': 'LT',
    'LZ': 'BG',
    'OD': 'LB',
    'OE': 'AT',
    'OH': 'FI',
    'OK': 'CZ',
    'OO': 'BE',
    'OY': 'DK',
    'PH': 'NL',
    'PP': 'BR',
    'PR': 'BR',
    'PT': 'BR',
    'RA': 'RU',
    'RF': 'RU',
    'SE': 'SE',
    'SP': 'PL',
    'SU': 'EG',
    'SX': 'GR',
    'TC': 'TR',
    'UK': 'UZ',
    'UN': 'KZ',
    'UR': 'UA',
    'VH': 'AU',
    'VT': 'IN',
    'XA': 'MX',
    'XB': 'MX',
    'XC': 'MX',
    'YI': 'IQ',
    'YR': 'RO',
    'YV': 'VE',
    'ZK': 'NZ',
    'ZS': 'ZA',
    'B': 'CN',
    'C': 'CA',
    'D': 'DE',
    'F': 'FR',
    'G': 'GB',
    'I': 'IT',
    'N': 'US'
};

function registrationFlagHtml(registration) {
    if (!registration) {
        return '';
    }
    const clean = String(registration).toUpperCase().replace(/-/g, '');
    const code = REGISTRATION_COUNTRY[clean.slice(0, 2)] || REGISTRATION_COUNTRY[clean.slice(0, 1)];
    if (!code) {
        return '';
    }
    return `<img class="flag" src="/simorgh/static/vendor/flags/${code.toLowerCase()}.svg" alt="${code}" title="${code}" draggable="false" onerror="this.remove()">`;
}

function pTracksUrl(value) {
    if (!isValidIcaoHex(value)) {
        return null;
    }
    return tar1090BaseUrl + '?icao=' + value.toLowerCase() + '&pTracks';
}

function formatAgo(seconds) {
    if (!isNumber(seconds)) {
        return 'N/A';
    }
    if (seconds < 60) {
        return 'just now';
    }
    const m = Math.floor(seconds / 60);
    if (m < 60) {
        return `${m}m ago`;
    }
    const h = Math.floor(m / 60);
    const rm = m % 60;
    if (rm > 0) {
        return `${h}h ${rm}m ago`;
    }
    return `${h}h ago`;
}

function formatClock(epochSeconds) {
    return new Date(epochSeconds * 1000).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

function formatSpan(seconds) {
    if (!isNumber(seconds)) {
        return 'N/A';
    }
    const m = Math.round(seconds / 60);
    if (m < 60) {
        return `${m}m`;
    }
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

function trackArrowHtml(deg) {
    if (!isNumber(deg)) {
        return '';
    }
    return `<span class="heading-arrow" style="transform: rotate(${Math.round(deg) - 90}deg)">➤</span>`;
}

function infoTip(tooltipText) {
    return `<button class="info-tip" type="button" aria-label="Info">${INFO_ICON}<span class="tip" role="tooltip">${escapeHtml(tooltipText)}</span></button>`;
}

function isValidIcaoHex(value) {
    return typeof value === 'string' && /^[0-9a-f]{6}$/i.test(value);
}

function tar1090IcaoUrl(value) {
    if (!isValidIcaoHex(value)) {
        return null;
    }
    return tar1090BaseUrl + '?icao=' + value.toLowerCase();
}

function aircraftCard(ac) {
    const title = ac.flight || ac.hex || 'UNKNOWN';
    const hex = ac.hex;
    const icaoUrl = tar1090IcaoUrl(hex);
    const flag = registrationFlagHtml(ac.registration);
    const positionBadge = ac.has_position
        ? '<span class="badge info">POS</span>'
        : '<span class="badge muted">NO POS</span>';
    const squawkBadge = ac.squawk
        ? `<span class="badge ${ac.emergency ? 'danger pulse' : 'neutral'}">${escapeHtml(ac.squawk)}</span>`
        : '';
    const cardClass = ac.emergency ? 'aircraft-card emergency' : (ac.on_ground ? 'aircraft-card on-ground' : 'aircraft-card');
    const history = aircraftHistory.get(hex) || { alt: [], spd: [], vert: [], rssi: [], dist: [] };
    const metaParts = [];
    if (ac.registration) {
        metaParts.push(escapeHtml(ac.registration));
    }
    if (ac.aircraft_type) {
        metaParts.push(escapeHtml(ac.aircraft_type));
    }
    const metaLine = metaParts.length
        ? `<span class="aircraft-meta">${metaParts.join(' · ')}</span>`
        : '';
    const flightNode = icaoUrl
        ? `<a class="flight ident-link" href="${icaoUrl}" target="_blank" rel="noopener">${flag}${escapeHtml(title)}${EXTERNAL_LINK_ICON}</a>`
        : `<span class="flight">${flag}${escapeHtml(title)}</span>`;
    const hexNode = icaoUrl
        ? `<a class="hex ident-link" href="${icaoUrl}" target="_blank" rel="noopener">${escapeHtml(hex)}</a>`
        : `<span class="hex">${escapeHtml(hex || '')}</span>`;
    return `
        <article class="${cardClass}">
            <div class="aircraft-top">
                <div class="ident">
                    ${flightNode}
                    ${hexNode}
                    ${metaLine}
                </div>
                <div class="badge-row">
                    ${positionBadge}
                    ${squawkBadge}
                </div>
            </div>
            <div class="aircraft-grid">
                <div class="data has-bars">
                    <span class="data-head">
                        <span>ALT</span>
                        ${infoTip('Barometric altitude above sea level.')}
                    </span>
                    <span class="value ${ac.on_ground ? 'ground-value' : ''}">${altitudeValue(ac)}</span>
                    ${sparklineBarsHtml(history.alt, '#38bdf8')}
                </div>
                <div class="data has-bars">
                    <span class="data-head">
                        <span>SPD</span>
                        ${infoTip('Ground speed in kilometers per hour.')}
                    </span>
                    <span class="value">${speedValue(ac)}</span>
                    ${sparklineBarsHtml(history.spd, '#10b981')}
                </div>
                <div class="data has-bars">
                    <span class="data-head">
                        <span>VERT</span>
                        ${infoTip('Vertical rate in meters per second. Positive means climbing, negative means descending.')}
                    </span>
                    <span class="value ${verticalClass(ac.vertical_mps)}">${verticalValue(ac.vertical_mps)}</span>
                    ${sparklineBarsHtml(history.vert, '#f59e0b')}
                </div>
                <div class="data has-bars">
                    <span class="data-head">
                        <span>RSSI</span>
                        ${infoTip('Received Signal Strength Indicator. Higher (closer to 0) means stronger signal.')}
                    </span>
                    <span class="value ${rssiClass(ac.rssi_db)}">${rssiValue(ac.rssi_db)}</span>
                    ${sparklineBarsHtml(history.rssi, '#a78bfa')}
                </div>
                <div class="data-stack">
                    <div class="data compact">
                        <span class="data-head">
                            <span>HDG</span>
                            ${infoTip('True track over ground in degrees (0-359).')}
                        </span>
                        <span class="value">${headingValue(ac.track_deg)}</span>
                    </div>
                    <div class="data compact">
                        <span class="data-head">
                            <span>SEEN</span>
                            ${infoTip('Seconds since the last message was received from this aircraft.')}
                        </span>
                        <span class="value ${seenClass(ac.seen_s)}">${seenValue(ac.seen_s)}</span>
                    </div>
                    <div class="data compact">
                        <span class="data-head">
                            <span>DIST</span>
                            ${infoTip('Distance from your receiver site in kilometers. Arrow shows the approaching or receding trend.')}
                        </span>
                        <span class="value">${distanceDisplay(ac.distance_km, history.dist)}</span>
                    </div>
                </div>
            </div>
        </article>
    `;
}

function distanceTrendHtml(points) {
    const windowPoints = points.slice(-8);
    const valid = windowPoints.filter(point => isNumber(point));
    if (valid.length < 2) {
        return '';
    }
    const delta = valid[valid.length - 1] - valid[0];
    if (Math.abs(delta) < 0.5) {
        return '<span class="heading-arrow trend-stable">➤</span>';
    }
    const rotate = delta < 0 ? 90 : -90;
    return `<span class="heading-arrow" style="transform: rotate(${rotate}deg)">➤</span>`;
}

function distanceDisplay(value, points) {
    if (!isNumber(value)) {
        return 'N/A';
    }
    return `<span class="heading">${distanceTrendHtml(points)}<span>${distanceValue(value)}</span></span>`;
}

function distanceValue(value) {
    if (!isNumber(value)) {
        return 'N/A';
    }
    if (value < 10) {
        return `${value.toFixed(1)} km`;
    }
    return `${Math.round(value).toLocaleString()} km`;
}

function rssiClass(value) {
    if (!isNumber(value)) {
        return '';
    }
    if (value >= -10) {
        return 'text-success';
    }
    if (value >= -20) {
        return 'text-warning';
    }
    return 'text-danger';
}

function seenClass(value) {
    if (!isNumber(value)) {
        return '';
    }
    if (value <= 15) {
        return 'text-success';
    }
    if (value <= 30) {
        return 'text-warning';
    }
    return 'text-danger';
}

function verticalClass(value) {
    if (!isNumber(value)) {
        return '';
    }
    if (value > 0.5) {
        return 'text-success';
    }
    if (value < -0.5) {
        return 'text-danger';
    }
    return '';
}

function bindServiceControls() {
    document.addEventListener('click', event => {
        const button = event.target.closest('[data-service-action]');
        if (!button || button.disabled) {
            return;
        }
        controlService(button.getAttribute('data-service-name'), button.getAttribute('data-service-action'));
    });
}

async function controlService(name, action) {
    if (!name || !action) {
        return;
    }
    const buttons = document.querySelectorAll('[data-service-action]');
    buttons.forEach(button => {
        button.disabled = true;
    });
    try {
        const response = await fetch(`/simorgh/api/service/${encodeURIComponent(name)}/${action}`, {
            method: 'POST'
        });
        const result = await response.json().catch(() => ({}));
        if (response.ok) {
            await refresh();
        } else {
            alert(result.detail || 'Service action failed');
        }
    } catch (error) {
        console.error(error);
        alert('Service action failed');
    } finally {
        buttons.forEach(button => {
            button.disabled = false;
        });
    }
}

function altitudeValue(ac) {
    if (ac.on_ground) {
        return 'GND';
    }
    if (!isNumber(ac.alt_m)) {
        return 'N/A';
    }
    return Math.round(ac.alt_m).toLocaleString() + ' m';
}

function speedValue(ac) {
    if (!isNumber(ac.speed_kmh)) {
        return 'N/A';
    }
    return Math.round(ac.speed_kmh).toLocaleString() + ' km/h';
}

function headingValue(value) {
    if (!isNumber(value)) {
        return 'N/A';
    }
    const deg = Math.round(value);
    return `
        <span class="heading">
            <span class="heading-arrow" style="transform: rotate(${deg - 90}deg)">➤</span>
            ${deg}°
        </span>
    `;
}

function verticalValue(value) {
    if (!isNumber(value)) {
        return 'N/A';
    }
    const abs = Math.abs(value).toFixed(1);
    if (value > 0.5) {
        return `↑ ${abs} m/s`;
    }
    if (value < -0.5) {
        return `↓ ${abs} m/s`;
    }
    return `→ ${abs} m/s`;
}

function rssiValue(value) {
    if (!isNumber(value)) {
        return 'N/A';
    }
    return `${value.toFixed(1)} dB`;
}

function seenValue(value) {
    if (!isNumber(value)) {
        return 'N/A';
    }
    return `${value.toFixed(1)} s`;
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text;
    }
}

function isNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function formatValue(value, unit) {
    if (!isNumber(value)) {
        return 'N/A';
    }
    return value + (unit ? ' ' + unit : '');
}

function formatInteger(value) {
    if (!isNumber(value)) {
        return 'N/A';
    }
    return String(Math.round(value));
}

function formatDuration(seconds) {
    if (!isNumber(seconds)) {
        return 'N/A';
    }
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) {
        return `${h}h ${m}m`;
    }
    const s = Math.floor(seconds % 60);
    return `${m}m ${s}s`;
}

function setSnrColor(id, value) {
    const el = document.getElementById(id);
    if (!el) {
        return;
    }
    el.classList.remove('text-success', 'text-warning', 'text-danger');
    if (!isNumber(value)) {
        return;
    }
    if (value >= 10) {
        el.classList.add('text-success');
    } else if (value >= 0) {
        el.classList.add('text-warning');
    } else {
        el.classList.add('text-danger');
    }
}

function escapeHtml(value) {
    const text = value === null || value === undefined ? '' : String(value);
    return text.replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function bindInfoTips() {
    document.addEventListener('click', event => {
        const tip = event.target.closest('.info-tip');
        if (!tip) {
            closeInfoTips();
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const isOpen = tip.classList.contains('show');
        closeInfoTips();
        if (!isOpen) {
            tip.classList.add('show');
            activeInfoTip = tip;
        }
    });
    document.addEventListener('mouseover', event => {
        const tip = event.target.closest('.info-tip');
        if (tip && (!activeInfoTip || activeInfoTip === tip)) {
            tip.classList.add('show');
        }
    });
    document.addEventListener('mouseout', event => {
        const tip = event.target.closest('.info-tip');
        if (tip && activeInfoTip !== tip) {
            tip.classList.remove('show');
        }
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            closeInfoTips();
        }
    });
}

function closeInfoTips() {
    activeInfoTip = null;
    document.querySelectorAll('.info-tip.show').forEach(item => {
        item.classList.remove('show');
    });
}

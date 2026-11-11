/**
 * 회색갈기 대공세 — 04 · 전술 지도 / 사용자 인터페이스 / 이벤트
 * 원본 시뮬레이션 규칙을 유지하며 소스만 기능별로 정리했습니다.
 */

'use strict';
function currentBest() { try {
    return localStorage.getItem('greymanes_stage_' + S.stage + '_' + S.difficulty) || '—';
}
catch {
    return '—';
} }
function pointLabel(n) {
    let guard = S.units.find(u => u.kind === 'guard' && u.hp > 0 && u.r === n.r && u.c === n.c);
    return n.owner === 'ally' ? '아군 점령' : n.id === 'HQ' ? '적 본진' : '적 점령';
}
function movePos(u) { let p = POS(u.r, u.c); return p; }
function setSelected(id) { S.selectedId = id; draw(); }
function selectArmy(id) { S.selectedUnit = id; draw(); }
function buildRoutes() {
    // 대각선 연결선을 모두 그리면 지도가 복잡하므로 차단된 수직 통로만 명시한다.
    // SCENARIOS[].bridge와 roadAllows()로부터 직접 계산해 실제 길찾기 규칙과 일치시킨다.
    const lines = [];
    const x = c => 100 + 200 * c, y = r => 123 + 156.5 * r;
    const blocked = [];
    for (let c = 0; c <= 3; c++)
        for (let r = 0; r < 2; r++) {
            if (!roadAllows({ r, c }, { r: r + 1, c }))
                blocked.push({ r, c });
        }
    for (let r = 0; r < 3; r++)
        for (let c = 0; c < 4; c++) {
            if (c === 3 && r !== 1)
                continue;
            lines.push(`<line x1="${x(c)}" y1="${y(r)}" x2="${x(c + 1)}" y2="${y(r)}" stroke="#678595" stroke-width="1.7" stroke-dasharray="2 13" opacity=".20"/>`);
        }
    $('roads').innerHTML = lines.join('');
    const blockers = $('blockedPaths');
    blockers.replaceChildren();
    // SVG viewBox(1000×560)를 POS(r,c) 위치 비율과 동일하게 환산한다.
    // 각 차단선은 같은 열의 두 거점 중심 사이 실제 수직 통로에만 배치한다.
    const blockSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    blockSvg.setAttribute('viewBox', '0 0 1000 560');
    blockSvg.setAttribute('preserveAspectRatio', 'none');
    blockSvg.setAttribute('role', 'img');
    blockSvg.setAttribute('aria-label', blocked.length + '곳의 상하 통로 차단 위치');
    for (const { r, c } of blocked) {
        const cx = POS(r, c).x * 10, cy = (POS(r, c).y + POS(r + 1, c).y) * 2.8;
        // 거점 카드의 상하 끝 바로 사이(중간 통로 45px)에 짧은 끊긴 선을 그린다.
        const name = `제${c}전선 ${LANE[r]}↔${LANE[r + 1]} 상하 통행 차단`;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        line.innerHTML = `<title>${name} (대각선 우회 가능)</title>
   <line class="blocked-rail" x1="${cx}" y1="${cy - 26}" x2="${cx}" y2="${cy + 26}"/>
   <line class="blocked-cap" x1="${cx - 17}" y1="${cy - 23}" x2="${cx + 17}" y2="${cy - 23}"/>
   <line class="blocked-cap" x1="${cx - 17}" y1="${cy + 23}" x2="${cx + 17}" y2="${cy + 23}"/>
   <circle class="blocked-halo" cx="${cx}" cy="${cy}" r="16"/>
   <text class="blocked-symbol" x="${cx}" y="${cy + 1}">×</text>`;
        blockSvg.append(line);
    }
    blockers.append(blockSvg);
    const notice = $('roadNotice');
    notice.textContent = blocked.length
        ? `제${blocked[0].c}전선 상하 통로 ${blocked.length}곳 차단 · 대각선 우회 가능`
        : '이 전장은 통행 불가 구간 없음 · 상하·대각 이동 가능';
    notice.classList.toggle('open', blocked.length === 0);
}
function drawRouteOverlay() {
    const overlay = $('plannedRoutes'), summary = $('routeSummary');
    if (!overlay || !summary)
        return;
    const u = S.units.find(x => x.id === S.selectedUnit);
    if (!u || !u.path.length) {
        overlay.innerHTML = '';
        summary.hidden = true;
        summary.textContent = '';
        return;
    }
    const x = c => 100 + 200 * c, y = r => 123 + 156.5 * r;
    const accent = u.cmd === 'rush' ? '#ffd17a' : u.cmd === 'advance' ? '#72ffdb' : '#72e4ff';
    const from = rect(u.r, u.c), positions = [from], pending = [];
    let current = from, reachable = true, reservedPoints = [];
    for (let i = 0; i < u.path.length; i++) {
        const goal = u.path[i];
        if (reachable) {
            const result = routeTowardGoal(current, goal, 'ally', u.cmd);
            if (result.path !== null) {
                positions.push(...result.path);
                current = positions[positions.length - 1];
            }
            if (result.path !== null && !result.pending) {
                current = goal;
                continue;
            }
            reachable = false;
            pending.push({ p: goal, index: i + 1 });
            if (result.remaining.length) {
                reservedPoints = [current, ...result.remaining];
                current = goal;
            }
            continue;
        }
        pending.push({ p: goal, index: i + 1 });
        const future = routeFind(current, goal, 'ally', u.cmd, true);
        if (future) {
            if (!reservedPoints.length)
                reservedPoints = [current];
            reservedPoints.push(...future);
            current = goal;
        }
    }
    let markup = '';
    if (positions.length > 1) {
        const coords = positions.map(p => `${x(p.c)},${y(p.r)}`).join(' ');
        // 뚜렷한 외곽선 + 경로 라인, 점선 애니메이션 대신 안정적인 고정 점선 사용.
        markup += `<polyline points="${coords}" fill="none" stroke="#071a26" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" opacity=".88"/>`;
        markup += `<polyline class="active-route" points="${coords}" fill="none" stroke="${accent}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="14 7"/>`;
        const head = positions[positions.length - 1], pre = positions[positions.length - 2];
        const angle = Math.atan2(y(head.r) - y(pre.r), x(head.c) - x(pre.c)) * 180 / Math.PI;
        // 마지막 이동 방향을 직관적으로 보여주는 화살표(목표 거점 중앙에 그리지 않음).
        const tx = x(head.c) - (x(head.c) - x(pre.c)) * 0.24, ty = y(head.r) - (y(head.r) - y(pre.r)) * 0.24;
        markup += `<path d="M -9 -6 L 0 0 L -9 6" transform="translate(${tx} ${ty}) rotate(${angle})" fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    if (reservedPoints.length > 1) {
        const reservedCoords = reservedPoints.map(p => `${x(p.c)},${y(p.r)}`).join(' ');
        markup += `<polyline points="${reservedCoords}" fill="none" stroke="#15222b" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" opacity=".90"/>`;
        markup += `<polyline class="pending-route" points="${reservedCoords}" fill="none" stroke="#ffc879" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="4 12"/>`;
    }
    // 경유지에 번호 배지를 별도로 표시하여 선이 겹치더라도 등록 순서를 알 수 있도록 한다.
    for (let i = 0; i < u.path.length; i++) {
        const p = u.path[i], reserved = pending.some(a => a.index === i + 1);
        // 거점 이름을 덮지 않게 상단 왼쪽으로 배치한다.
        const xx = x(p.c) - 58, yy = y(p.r) - 51;
        markup += `<g transform="translate(${xx},${yy})"><rect x="-16" y="-13" width="32" height="26" rx="7" fill="${reserved ? '#6b4c27' : '#123a48'}" stroke="${reserved ? '#ffd17a' : accent}" stroke-width="2.5"/><text x="0" y="5" fill="#ffffff" font-size="16" font-weight="800" text-anchor="middle">${i + 1}</text></g>`;
        if (reserved)
            markup += `<circle class="reserved-destination" cx="${x(p.c)}" cy="${y(p.r)}" r="15" fill="none" stroke="#ffcb77" stroke-width="4" stroke-dasharray="5 5"/>`;
    }
    overlay.innerHTML = markup;
    const modes = { advance: '진격', rush: '우선이동', hold: '명령 대기', retreat: '복귀' };
    const states = u.path.map((p, i) => `${i + 1}.${nameAt(p.r, p.c)}`).join(' → ');
    summary.textContent = `${u.name} · ${modes[u.cmd] || '명령 대기'} | ${states}` + (pending.length ? ' · 청록색=현재 이동 구간, 노란색=전선 개방 대기' : '');
    summary.hidden = false;
}
function draw(rest = false) {
    const camp = SCENARIOS[S.stage];
    $('turnValue').textContent = S.turn;
    $('baseValue').textContent = S.baseHp + ' / ' + S.baseMax;
    $('baseBar').style.width = (100 * S.baseHp / S.baseMax) + '%';
    $('holdValue').textContent = countOwned(1) + countOwned(2) + countOwned(3) + ' / 9';
    $('waveValue').textContent = S.wave;
    $('troopsValue').textContent = S.units.filter(u => u.side === 'ally' && u.kind !== 'guard' && u.hp > 0).length + ' : ' + S.units.filter(u => u.side === 'enemy' && u.kind !== 'guard' && u.hp > 0).length;
    $('recordValue').textContent = currentBest() === '—' ? '—' : currentBest() + '턴';
    $('csvStatus').textContent = `현재 ${S.turn}턴`;
    $('scenarioName').textContent = camp.title;
    $('scenarioDesc').textContent = camp.description + ' · 적 증원 ' + enemyWavePeriod(S.stage, S.difficulty) + '턴 주기';
    $('cliffValue').textContent = S.hero.cool ? '재출격 ' + S.hero.cool + '턴' : 'HP ' + S.hero.hp + '/' + S.hero.max;
    $('cliffWhere').textContent = nameAt(S.hero.r, S.hero.c);
    if (rest)
        buildRoutes();
    drawRouteOverlay();
    const places = $('places');
    places.replaceChildren();
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c <= 4; c++) {
            if (c === 4 && r !== 1) {
                const camp = document.createElement('div'), p = POS(r, c);
                camp.className = 'fort-node enemy-camp';
                camp.style.left = p.x + '%';
                camp.style.top = p.y + '%';
                camp.innerHTML = '<span class="meta">적 증원</span><strong>' + LANE[r] + ' 집결지</strong><div class="hp-line">병력 출격</div>';
                places.append(camp);
                continue;
            }
            const n = nAt(r, c), home = c === 0, homeId = 'HOME_' + r;
            const p = POS(r, c), b = document.createElement('button');
            b.type = 'button';
            b.dataset.nodeid = n ? n.id : homeId;
            b.className = 'fort-node ' + (!n ? 'home' : n.owner === 'ally' ? 'allied' : n.id === 'HQ' ? 'headquarters' : 'hostile');
            const isChosen = (n && S.selectedId === n.id) || (home && S.selectedId === homeId);
            if (isChosen)
                b.classList.add('selected');
            b.setAttribute('aria-pressed', String(Boolean(isChosen)));
            if (n && !unlocked(c))
                b.classList.add('locked');
            b.style.left = p.x + '%';
            b.style.top = p.y + '%';
            if (n) {
                let extra = n.elite > 0 ? '정예 ' + n.elite + ' · ' : '';
                if (n.facility > 0)
                    extra += '시설 ' + n.facility;
                let guard = S.units.find(u => u.kind === 'guard' && u.hp > 0 && u.r === n.r && u.c === n.c);
                if (n.owner === 'ally')
                    extra += (guard ? '경비 ' + guard.hp : '경비 없음');
                else {
                    let def = S.units.find(u => u.kind === 'guard' && u.side === 'enemy' && u.hp > 0 && u.r === n.r && u.c === n.c);
                    if (def)
                        extra += ' 수비병 ' + def.hp;
                }
                b.innerHTML = `<span class="meta">${n.id === 'HQ' ? '최종 목표' : '제' + c + '전선'} · ${TYPE_LABEL[n.type]} · ${pointLabel(n)}</span><strong>${n.name}</strong><div class="hp-line">방어력 ${n.hp}/${n.max}</div><div class="meter"><i style="width:${100 * n.hp / n.max}%"></i></div><div class="extra">${extra || '기본 방어'}</div>`;
                b.onclick = () => setSelected(n.id);
                b.setAttribute('aria-label', n.name + ' 선택');
                b.title = n.name + ' · ' + TYPE_LABEL[n.type] + ' · ' + (n.owner === 'ally' ? '아군' : '적군') + ' · 방어력 ' + n.hp + '/' + n.max;
            }
            else {
                b.innerHTML = `<span class="meta">아군 출격지</span><strong>${LANE[r]} 출격지</strong><div class="hp-line">후퇴 · 재출격</div><div class="extra">이동 목적지 지정 가능</div>`;
                b.onclick = () => setSelected(homeId);
                b.setAttribute('aria-label', LANE[r] + ' 출격지 선택');
                b.title = LANE[r] + ' 출격지 · 이동 및 자동 회복 가능';
            }
            places.append(b);
        }
    }
    const layer = $('tokens'), alive = S.units.filter(u => u.hp > 0 && u.cool === 0);
    // Soldiers sharing a tile are shown as a stack; combat and CSV still use original units.
    const soldierGroups = new Map();
    for (const u of alive.filter(u => u.kind === 'soldier')) {
        const key = [u.side, u.r, u.c, u.raider ? 'raider' : 'normal'].join('-');
        if (!soldierGroups.has(key))
            soldierGroups.set(key, []);
        soldierGroups.get(key).push(u);
    }
    const displayedSoldiers = [];
    for (const [key, group] of soldierGroups) {
        if (group.length === 1) {
            displayedSoldiers.push(group[0]);
            continue;
        }
        const first = group[0];
        displayedSoldiers.push({ ...first, id: 'STACK-' + key, name: (first.raider ? '침투병' : '일반병') + ' ' + group.length + '개 부대', hp: group.reduce((sum, u) => sum + u.hp, 0), groupCount: group.length });
    }
    const tokens = [...alive.filter(u => u.kind !== 'soldier'), ...displayedSoldiers, ...(S.hero.cool === 0 && S.hero.hp > 0 ? [{ id: 'CLIFF', side: 'hero', kind: 'hero', r: S.hero.r, c: S.hero.c, hp: S.hero.hp, name: '클리프' }] : [])];
    const liveIds = new Set();
    for (const u of tokens) {
        liveIds.add(u.id);
        let el = document.getElementById('piece-' + u.id);
        if (!el) {
            el = document.createElement('button');
            el.type = 'button';
            el.id = 'piece-' + u.id;
            layer.append(el);
        }
        let p = movePos(u), group = tokens.filter(v => v.r === u.r && v.c === u.c), index = group.findIndex(v => v.id === u.id);
        const dx = cap((index % 4) * 25 - 35, -55, 55), dy = 68 + Math.floor(index / 4) * 24;
        el.style.left = `calc(${p.x}% + ${dx}px)`;
        el.style.top = `calc(${p.y}% + ${dy}px)`;
        el.className = 'piece ' + (u.side === 'hero' ? 'hero' : u.side === 'enemy' && u.kind === 'guard' ? 'enemy enemyguard' : u.side === 'enemy' ? 'enemy' : u.kind === 'guard' ? 'guard' : u.kind === 'leader' ? 'leader' : 'soldier') + (u.id === S.selectedUnit ? ' active' : '') + (u.raider ? ' raider' : '');
        el.innerHTML = `<b>${u.side === 'hero' ? '✦' : u.side === 'enemy' ? '⚑' : u.kind === 'leader' ? '♜' : u.kind === 'guard' ? '▣' : '♟'}</b><span>${u.side === 'hero' ? '클리프' : u.kind === 'leader' ? u.id : u.kind === 'guard' ? '수비' : u.groupCount > 1 ? (u.raider ? '침투' : '일반') + '×' + u.groupCount : u.raider ? '침투' : u.id}</span><small>${u.hp}</small>`;
        el.title = (u.name || '클리프') + ' · ' + nameAt(u.r, u.c) + (u.groupCount ? ' · 합산 HP ' : ' · HP ') + u.hp;
        el.onclick = () => { if (u.kind === 'leader')
            selectArmy(u.id); };
        el.style.pointerEvents = u.kind === 'leader' ? 'auto' : 'none';
        el.tabIndex = u.kind === 'leader' ? 0 : -1;
        el.setAttribute('aria-label', el.title);
    }
    for (const el of [...layer.children]) {
        if (!liveIds.has(el.id.replace('piece-', '')))
            el.remove();
    }
    const unitCards = $('units');
    unitCards.replaceChildren();
    for (const u of S.units.filter(u => u.kind === 'leader')) {
        let b = document.createElement('button');
        b.type = 'button';
        b.className = 'army-card' + (u.id === S.selectedUnit ? ' chosen' : '');
        const recoveryHint = (u.path.length === 0 && u.hp < u.max && u.cool === 0 && (u.c === 0 || currentNode('ally', u.r, u.c)))
            ? (u.restTurns >= BAL.rest_delay_turns ? '자동 회복 +' + (BAL.rest_heal_base + (u.c === 0 || currentNode('ally', u.r, u.c)?.type === 'general' ? BAL.rest_heal_bonus : 0)) + '/턴'
                : u.restTurns > 0 ? '안전 대기 ' + u.restTurns + '/' + BAL.rest_delay_turns + '턴' : '안전 대기 시 자동 회복')
            : ({ advance: '진격', rush: '우선이동', hold: '주둔', retreat: '복귀' }[u.cmd] || '주둔');
        b.innerHTML = `<b>♜ ${u.name}</b><span>${u.cool ? '재출격 ' + u.cool + '턴' : 'HP ' + u.hp + '/' + u.max}</span><span>${nameAt(u.r, u.c)}</span><span class="muted">${recoveryHint}${u.path.length ? ' · ' + u.path.length + ' 경유지' : ''}</span>`;
        b.dataset.unitid = u.id;
        b.setAttribute('aria-pressed', String(u.id === S.selectedUnit));
        b.onclick = () => selectArmy(u.id);
        unitCards.append(b);
    }
    let n = nId(S.selectedId), selUnit = S.units.find(u => u.id === S.selectedUnit);
    $('selectedText').innerHTML = n.type === 'home'
        ? `<strong>${n.name}</strong> · 아군 출격지<div>본진 HP ${S.baseHp}/${S.baseMax} · 이동/휴식 가능</div>`
        : `<strong>${n.name}</strong> · ${TYPE_LABEL[n.type]} · ${n.owner === 'ally' ? '아군' : '적군'}<div>방어 ${n.hp}/${n.max}${n.elite ? ' · 정예 ' + n.elite : ''}${n.facility ? ' · 시설 ' + n.facility : ''} · ${unlocked(n.c) ? '진입 가능' : '전선 잠금'}</div>`;
    $('routeText').textContent = selUnit.path.length ? (selUnit.cmd === 'hold' ? '지정된 경로 (명령 대기): ' : '지정된 경로 (실행 중): ') + selUnit.path.map(p => nameAt(p.r, p.c)).join(' → ') : '경로 없음 · 거점 선택 → [경로 선택]';
    const hasPath = selUnit.path.length > 0, canCommand = selUnit.cool === 0 && !isOver();
    let nextPhase = 'route', nextMessage = '목적지 선택 → [경로 선택]';
    if (isOver()) {
        nextPhase = 'go';
        nextMessage = '작전 종료 · 전장 재시작 또는 다음 전장';
    }
    else if (selUnit.cool > 0) {
        nextMessage = selUnit.name + ' 재출격 대기 ' + selUnit.cool + '턴 · 다른 부대 선택';
    }
    else if (hasPath && selUnit.cmd === 'hold') {
        nextPhase = 'order';
        nextMessage = '경로 등록 완료 · [진격] / [우선이동] 선택';
    }
    else if (hasPath && selUnit.cmd === 'advance') {
        nextPhase = selUnit.frontierWaiting ? 'route' : 'go';
        nextMessage = selUnit.frontierWaiting ? '전선 개방 대기 · 앞선 거점을 점령하면 진격 재개' : '진격 명령 설정 · [1턴 진행]으로 실행';
    }
    else if (hasPath && selUnit.cmd === 'rush') {
        nextPhase = selUnit.frontierWaiting ? 'route' : 'go';
        nextMessage = selUnit.frontierWaiting ? '전선 개방 대기 · 앞선 거점을 점령하면 이동 재개' : '우선이동 명령 설정 · [1턴 진행]으로 실행';
    }
    $('orderText').textContent = nextMessage;
    $('orderText').dataset.phase = nextPhase;
    const waypointReady = canCommand && selUnit.path.length < 8 && (!selUnit.path.length ? !eq(selUnit, n) : !eq(selUnit.path[selUnit.path.length - 1], n));
    $('waypoint').disabled = !waypointReady;
    $('clearRoute').disabled = !hasPath || !canCommand;
    $('waypoint').classList.toggle('is-ready', waypointReady);
    $('advance').disabled = !hasPath || !canCommand;
    $('rush').disabled = !hasPath || !canCommand;
    for (const [id, mode] of [['advance', 'advance'], ['rush', 'rush']]) {
        const btn = $(id), active = selUnit.cmd === mode && selUnit.path.length > 0;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', String(active));
    }
    $('routeHelp').textContent = selUnit.name + ' · 목표: ' + n.name;
    const logEl = $('log');
    logEl.replaceChildren();
    for (const entry of S.log) {
        const e = document.createElement('div');
        e.className = 'event ' + entry.type;
        const time = document.createElement('strong');
        time.textContent = 'T' + entry.t;
        e.append(time, document.createTextNode(' ' + entry.text));
        logEl.append(e);
    }
    const n1 = countOwned(1), n2 = countOwned(2), n3 = countOwned(3);
    $('unlockText').textContent = `제1전선 ${n1}/3 · 제2전선 ${n2}/3 · 제3전선 ${n3}/3 · 적 본진 ${unlocked(4) ? '진입 가능' : '잠금'}`;
    const intruders = S.units.filter(u => u.side === 'enemy' && u.raider && u.hp > 0 && u.cool === 0);
    $('raidNotice').hidden = !intruders.length;
    if (intruders.length) {
        let threat = intruders.reduce((best, u) => !best || u.c < best.c ? u : best, null);
        $('raidNotice').textContent = '측면 침투 · ' + LANE[threat.raidLane] + ' 출격지 위협 · 현재 위치 ' + nameAt(threat.r, threat.c) + ' · 경로 변경 또는 클리프 방어 필요';
    }
    $('effectText').textContent = `아군 요새 공격 +${fortBonus('ally')} / 적 요새 공격 +${fortBonus('enemy')} · 아군 일반 거점 ${S.nodes.filter(n => n.owner === 'ally' && n.type === 'general').length} · 공성병기 ${S.nodes.filter(n => n.owner === 'ally' && n.type === 'siege').length}`;
    let result = $('result');
    result.className = 'endcard' + (S.result === 'loss' ? ' fail' : '');
    if (S.result) {
        let campaignDone = S.stage === SCENARIOS.length - 1;
        result.innerHTML = `<div class="end-title">${S.result === 'win' ? '작전 성공' : '작전 실패'}</div><div>${S.result === 'win' ? '적 본진 점령 완료' : '아군 본진 함락'} · ${S.turn}턴 · 클리프 공격 ${S.heroCount}회 · 부대 이탈 ${S.deadCount}회</div><div class="end-actions"><button id="restartResult">다시 도전</button>${S.result === 'win' && !campaignDone ? '<button id="nextScenario">다음 전장 →</button>' : ''}</div>`;
        $('restartResult').onclick = () => setUp(S.stage, S.difficulty, false);
        let next = $('nextScenario');
        if (next)
            next.onclick = () => setUp(S.stage + 1, S.difficulty, true);
    }
    else
        result.innerHTML = '';
    for (const id of ['heroMove', 'heroAct', 'tick', 'skip'])
        $(id).disabled = isOver();
    $('auto').disabled = isOver();
}
$('advance').onclick = () => command('advance');
$('rush').onclick = () => command('rush');
$('waypoint').onclick = addWaypoint;
$('clearRoute').onclick = clearWaypoint;
$('heroMove').onclick = heroMove;
$('heroAct').onclick = heroAct;
$('tick').onclick = tick;
$('skip').onclick = () => { stopAuto(); for (let i = 0; i < 4 && !isOver(); i++)
    tick(); };
$('auto').onclick = () => { if (timer) {
    stopAuto();
    return;
} if (isOver())
    return; timer = setInterval(() => { tick(); if (isOver())
    stopAuto(); }, 1000); $('auto').textContent = '자동 중지'; };
document.addEventListener('visibilitychange', () => { if (document.hidden)
    stopAuto(); });
$('exportKeyTurns').onclick = exportKeyTurns;
$('exportBalanceHistory').onclick = exportBalanceHistory;
$('exportBalanceConfig').onclick = exportBalanceConfig;
$('balanceImport').onchange = e => importBalanceConfig(e.target.files[0]);
$('restart').onclick = () => { if (S.turn > 0 && !isOver() && !window.confirm('전장을 재시작할까요? 미완료 기록은 성과 CSV에 포함되지 않습니다.'))
    return; setUp(S.stage, S.difficulty, false); };
$('applySetting').onclick = () => { if (S.turn > 0 && !isOver() && !window.confirm('전장을 변경할까요? 현재 진행 상태가 초기화됩니다.'))
    return; setUp(Number($('stageSelect').value), $('difficultySelect').value, false); };
setUp(0, 'standard');

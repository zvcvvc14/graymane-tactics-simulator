/**
 * 회색갈기 대공세 — 02 · 전투 로직 / 이동 / 턴 처리
 * 원본 시뮬레이션 규칙을 유지하며 소스만 기능별로 정리했습니다.
 */

'use strict';
function nAt(r, c) { return S.nodes.find(n => n.r === r && n.c === c); }
// 왼쪽 3개 아군 출격지는 일반 점령 거점은 아니지만, 이동·주둔을 위한 선택 가능한 경유지다.
// 적군에게 점령되는 일반 거점과 구분해 전선 개방 및 9개 거점 점령 수에는 포함하지 않는다.
function nId(id) {
    const found = S.nodes.find(n => n.id === id);
    if (found)
        return found;
    const match = /^HOME_([0-2])$/.exec(String(id));
    if (!match)
        return null;
    const r = Number(match[1]);
    return { id, r, c: 0, type: 'home', name: LANE[r] + ' 출격지', owner: 'ally', hp: S.baseHp, max: S.baseMax, elite: 0, facility: 0 };
}
function countOwned(c, side = 'ally') { return S.nodes.filter(n => n.c === c && n.owner === side).length; }
function unlocked(c) { return c <= 1 || (c === 2 && countOwned(1) > 0) || (c === 3 && countOwned(2) > 0) || (c === 4 && countOwned(3) === 3); }
function fortBonus(side) { return S.nodes.filter(n => n.owner === side && n.type === 'fort').length * BAL.fort_bonus_per_fort; }
function roadAllows(a, b) {
    const dr = Math.abs(a.r - b.r), dc = Math.abs(a.c - b.c);
    if (dr > 1 || dc > 1 || (!dr && !dc))
        return false;
    if (dr && dc)
        return diagonalPassage(a, b);
    if (dr)
        return SCENARIOS[S.stage].bridge.includes(a.c);
    return true;
}
function isOver() { return S.result !== ''; }
function nameAt(r, c) { return c === 0 ? LANE[r] + ' 출격지' : c === 4 ? (r === 1 ? '적 본진' : LANE[r] + ' 증원로') : (nAt(r, c)?.name || '무명 거점'); }
function allAt(side, r, c) { return S.units.filter(u => u.side === side && u.hp > 0 && u.cool === 0 && u.r === r && u.c === c); }
function log(text, type = '') {
    S.log.unshift({ t: S.turn, text, type });
    S.log = S.log.slice(0, 90);
    if (S.eventLog)
        S.eventLog.push({ turn: S.turn, event_index: S.eventLog.length + 1, severity: type || 'info', detail: text });
}
function recordFrame() {
    if (!S || !S.turnFrames)
        return;
    // 같은 턴에 클리어가 발생하면 이전 스냅샷을 최신 상태로 갱신합니다.
    if (S.turnFrames.length && S.turnFrames[S.turnFrames.length - 1].turn === S.turn) {
        S.turnFrames.pop();
        S.nodeFrames.splice(-S.nodes.length);
        while (S.unitFrames.length && S.unitFrames[S.unitFrames.length - 1].turn === S.turn)
            S.unitFrames.pop();
    }
    const shared = { session_id: S.sessionId, source: S.recordSource, engine_version: ENGINE_VERSION, balance_config_id: S.config_id, stage: S.stage + 1, stage_name: SCENARIOS[S.stage].title, difficulty: S.difficulty, turn: S.turn };
    const owned = S.nodes.filter(n => n.c <= 3 && n.owner === 'ally');
    const prev = S.turnFrames[S.turnFrames.length - 1] || null;
    const hpUnits = S.units.filter(u => u.side === 'ally' && u.kind === 'leader');
    const leaderHp = hpUnits.map(u => u.hp);
    S.turnFrames.push({ ...shared, result: S.result || 'ongoing', base_hp_change_turn: prev ? S.baseHp - prev.base_hp : 0, owned_change_turn: prev ? owned.length - prev.owned_total : 0, ally_knockouts_new_turn: prev ? S.deadCount - prev.ally_knockouts : 0, ally_leader_hp_total: leaderHp.reduce((a, b) => a + b, 0), ally_leader_hp_min: Math.min(...leaderHp), base_hp: S.baseHp, base_hp_max: S.baseMax, owned_total: owned.length, owned_general: owned.filter(n => n.type === 'general').length, owned_fort: owned.filter(n => n.type === 'fort').length, owned_siege: owned.filter(n => n.type === 'siege').length, enemy_wave: S.wave, hero_r: S.hero.r, hero_c: S.hero.c, hero_hp: S.hero.hp, hero_hp_max: S.hero.max, hero_cool: S.hero.cool, hero_actions: S.heroCount, ally_leaders_active: S.units.filter(u => u.side === 'ally' && u.kind === 'leader' && u.hp > 0 && u.cool === 0).length, ally_soldiers: S.units.filter(u => u.side === 'ally' && u.kind === 'soldier' && u.hp > 0).length, enemy_soldiers: S.units.filter(u => u.side === 'enemy' && u.kind === 'soldier' && u.hp > 0).length, ally_knockouts: S.deadCount, enemy_unit_kills: S.enemyKills, resting_leaders: S.units.filter(u => u.side === 'ally' && u.kind === 'leader' && u.restTurns > 0 && u.cool === 0).length, rest_hp_recovered_turn: S.healingThisTurn || 0, rest_hp_recovered_total: S.restHealingTotal || 0 });
    for (const n of S.nodes) {
        const guard = S.units.filter(u => u.kind === 'guard' && u.hp > 0 && u.r === n.r && u.c === n.c && u.side === n.owner);
        S.nodeFrames.push({ ...shared, node_id: n.id, node_name: n.name, node_type: n.type, row: n.r, col: n.c, owner: n.owner, hp: n.hp, hp_max: n.max, elite_hp: n.elite, facility_hp: n.facility, garrison_count: guard.length, garrison_hp: guard.reduce((s, u) => s + u.hp, 0), ally_present: allAt('ally', n.r, n.c).length, enemy_present: allAt('enemy', n.r, n.c).length });
    }
    for (const u of S.units) {
        S.unitFrames.push({ ...shared, unit_id: u.id, unit_name: u.name, side: u.side, kind: u.kind, row: u.r, col: u.c, hp: u.hp, hp_max: u.max, respawn_cooldown: u.cool || 0, command: u.cmd || '', remaining_waypoints: (u.path || []).map(p => `${p.r}:${p.c}`).join('>') });
    }
    S.unitFrames.push({ ...shared, unit_id: 'CLIFF', unit_name: '클리프', side: 'ally', kind: 'hero', row: S.hero.r, col: S.hero.c, hp: S.hero.hp, hp_max: S.hero.max, respawn_cooldown: S.hero.cool, command: S.hero.target ? 'move' : 'idle', remaining_waypoints: S.hero.target ? `${S.hero.target.r}:${S.hero.target.c}` : '' });
}
function stopAuto() { if (timer)
    clearInterval(timer); timer = null; if ($('auto'))
    $('auto').textContent = '자동 진행'; }
function setUp(stage = 0, difficulty = 'standard', preserveCampaign = false) {
    if (S && S.turn > 0)
        archiveSession();
    stopAuto();
    ids = 0;
    let cfg = SCENARIOS[stage], hard = difficulty === 'challenge' ? [1.12, 1.065, 1.08][stage] : 1, scale = cfg.scale * hard * 1.35 * [1.20, 1.25, 1.37][stage];
    const prev = preserveCampaign && S ? S.campaign : { turns: 0, hero: 0, losses: 0, cleared: [], best: [] };
    const sessionId = 'GM-' + new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + '-' + Math.random().toString(36).slice(2, 8);
    S = { sessionId, config_id: configHash(), tuningSnapshot: { ally_attack: BAL.ally_attack, hero_attack: BAL.hero_attack, raider_attack: BAL.raider_attack, stage_enemy_scale: cfg.scale, enemy_wave_interval: enemyWavePeriod(stage, difficulty), rest_delay_turns: BAL.rest_delay_turns, rest_heal_base: BAL.rest_heal_base, rest_heal_bonus: BAL.rest_heal_bonus, late_wave_hp_multiplier: (stage === 2 && difficulty === 'challenge' ? BAL.stage3_challenge_wave_hp_multiplier : 1), node_defense_multiplier_mean: Math.round((Object.values(NODE_MUL[stage]).reduce((a, b) => a + b, 0) / Object.values(NODE_MUL[stage]).length) * 100) / 100 }, recordSource: 'ui_controls', eventLog: [], turnFrames: [], nodeFrames: [], unitFrames: [], stage, difficulty, campaign: prev, turn: 0, wave: 1, baseMax: cfg.base, baseHp: cfg.base, win: false, result: '', events: [], selectedUnit: 'A1', selectedId: 'N1', heroCount: 0, heroDamageDealt: 0, allyArtilleryDamageDealt: 0, enemyArtilleryDamageDealt: 0, deadCount: 0, enemyKills: 0, raiderCount: 0, idling: 0, healingThisTurn: 0, restHealingTotal: 0,
        nodes: DEFS.map(n => { const strength = (REGION_STRENGTH[stage][n.id] || 1) * NODE_MUL[stage][n.id]; const hqFactor = n.id === 'HQ' ? [1, 1.8, 4.0][stage] * (stage === 2 && difficulty === 'challenge' ? 1.20 : 1) : 1; const openingFortFactor = (stage === 0 && n.id === 'N2') ? 1.10 : 1; const h = Math.round(n.hp * scale * strength * hqFactor * openingFortFactor), e = Math.round((n.elite || 0) * scale * strength), f = Math.round((n.facility || 0) * scale * strength); return { ...n, owner: 'enemy', max: h, hp: h, eliteMax: e, elite: e, facilityMax: f, facility: f }; }),
        units: [], hero: { r: 1, c: 0, hp: 100, max: 100, cool: 0, target: null }, log: [] };
    for (let r = 0; r < 3; r++)
        S.units.push({ id: 'A' + (r + 1), side: 'ally', kind: 'leader', name: '회색갈기 ' + (r + 1) + '부대', r, c: 0, home: r, hp: 100, max: 100, atk: BAL.ally_attack, cool: 0, cmd: 'hold', path: [], restTurns: 0, totalRestTurns: 0, restHealedTotal: 0, movedThisTurn: false, foughtThisTurn: false });
    for (const n of S.nodes) {
        addUnit('enemy', 'guard', n.r, n.c, { hp: Math.round((n.type === 'hq' ? 29 : n.type === 'fort' ? 18 : 13) * scale * (REGION_STRENGTH[stage][n.id] || 1) * NODE_MUL[stage][n.id]), atk: n.type === 'fort' ? 6 : 5 });
    }
    addUnit('enemy', 'soldier', 0, 3, { hp: 30, atk: 9 });
    addUnit('enemy', 'soldier', 2, 3, { hp: 30, atk: 9 });
    addUnit('enemy', 'soldier', 1, 2, { hp: 26, atk: 8 });
    log(SCENARIOS[stage].title + ' 작전 시작', 'good');
    log('통로 상태: 상하 이동 ' + (cfg.bridge.length === 4 ? '전면 개방' : ('제' + (cfg.bridge.includes(1) ? 2 : 1) + '전선 일부 차단')) + '. 대각선 우회 가능', 'warn');
    log('아군 이동: 8방향 · 적 이동: 지정 진군로', 'warn');
    $('stageSelect').value = String(stage);
    $('difficultySelect').value = difficulty;
    recordFrame();
    draw(true);
}
function addUnit(side, kind, r, c, opts = {}) {
    const id = side === 'ally' ? 'F' + (++ids) : 'E' + (++ids);
    const hp = opts.hp || (side === 'ally' ? 26 : 25);
    const u = { id, side, kind, name: side === 'ally' ? (kind === 'guard' ? '회색갈기 주둔 경비대' : '회색갈기 일반병') : (kind === 'guard' ? '발더 주둔군' : '발더 일반병'), r, c, hp, max: hp, atk: opts.atk || 7, cool: 0, cmd: side === 'ally' ? 'auto' : 'invasion', path: [] };
    S.units.push(u);
    return u;
}
function prune() { S.units = S.units.filter(u => u.kind === 'leader' || (u.hp > 0 && u.cool === 0)); }
function currentNode(side, r, c) { let n = nAt(r, c); return n && n.owner === side ? n : null; }
function routeFind(from, target, side, mode = 'advance', previewLocked = false) {
    if (eq(from, target))
        return [];
    let Q = [from], seen = new Set([from.r + ',' + from.c]), prior = new Map();
    while (Q.length) {
        let p = Q.shift(), dirs = [[0, 1], [-1, 0], [1, 0], [0, -1], [-1, 1], [1, 1], [-1, -1], [1, -1]];
        dirs.sort((a, b) => dist(rect(p.r + a[0], p.c + a[1]), target) - dist(rect(p.r + b[0], p.c + b[1]), target));
        for (const [dr, dc] of dirs) {
            const r = p.r + dr, c = p.c + dc, key = r + ',' + c;
            if (r < 0 || r > 2 || c < 0 || c > 4 || seen.has(key) || !roadAllows(p, rect(r, c)))
                continue;
            // 적 AI는 이전 버전의 안정화된 대각 진군로만 사용해 증원 속도의 급격한 변화를 방지한다.
            if (side === 'enemy' && dr && dc && !enemyDiagonalPassage(p, rect(r, c)))
                continue;
            // 아군은 지도에 존재하지 않는 후방 증원 칸(4열 북부/남부)에 진입하지 않는다.
            if (c === 4 && r !== 1 && side === 'ally')
                continue;
            // 우선이동도 적 점령 거점을 경유할 수 있지만 전선 개방 조건은 동일하게 적용한다.
            if (side === 'ally' && !unlocked(c) && !previewLocked && nAt(r, c)?.owner !== 'ally')
                continue;
            if (c === 4 && r !== 1 && side === 'enemy' && target.c !== 4)
                continue;
            seen.add(key);
            prior.set(key, p.r + ',' + p.c);
            if (r === target.r && c === target.c) {
                const path = [];
                let t = key;
                while (t !== from.r + ',' + from.c) {
                    const [a, b] = t.split(',').map(Number);
                    path.unshift(rect(a, b));
                    t = prior.get(t);
                }
                return path;
            }
            Q.push(rect(r, c));
        }
    }
    return null;
}
// 목표가 잠겨 있어도 현재 열린 전선에서 이동 가능한 경로를 먼저 실행한다.
// 잠긴 칸은 넘지 않고, 전선이 열리면 같은 최종 목표로 경로를 다시 탐색한다.
function routeTowardGoal(from, target, side = 'ally', mode = 'advance') {
    const direct = routeFind(from, target, side, mode);
    if (direct !== null)
        return { path: direct, pending: false, remaining: [] };
    if (side !== 'ally')
        return { path: null, pending: false, remaining: [] };
    const future = routeFind(from, target, side, mode, true);
    if (future === null)
        return { path: null, pending: false, remaining: [] };
    const path = [];
    for (const p of future) {
        if (!unlocked(p.c) && nAt(p.r, p.c)?.owner !== 'ally')
            break;
        path.push(p);
    }
    return { path, pending: path.length < future.length, remaining: future.slice(path.length) };
}
function directPaths(unit, type) {
    if (type === 'hold') {
        unit.cmd = 'hold';
        unit.path = [];
        unit.frontierWaiting = null;
        log(unit.name + ' 현재 위치 주둔', 'good');
        draw();
        return;
    }
    if (type === 'retreat') {
        unit.cmd = 'retreat';
        unit.path = [rect(unit.home, 0)];
        log(unit.name + ' 본진 복귀 명령', 'good');
        draw();
        return;
    }
    // 경로 선택 버튼으로 미리 등록한 경로를 진격/우선이동에 적용한다.
    // 기존 명령의 모드만 바꿔도 경로가 사라지지 않는다.
    if (!unit.path.length) {
        log('경로 미등록 · 거점 선택 후 [경로 선택]', 'bad');
        draw();
        return;
    }
    if (unit.path.some(p => p.c === 4 && !unlocked(4))) {
        // 마지막 전선 3개를 확보하기 전에도 '예약'은 가능하며, 실제 이동은 전선이 열릴 때 진행한다.
        log('적 본진 지정 · 현재 진입 가능한 전선까지 이동하고, 제3전선 전체 확보 후 본진에 진입합니다.', 'warn');
    }
    unit.cmd = type;
    log(unit.name + ' ' + (type === 'rush' ? '우선이동' : '진격') + ' 명령 설정: ' + unit.path.map(p => nameAt(p.r, p.c)).join(' → '), 'good');
    draw();
}
function command(type) { if (isOver())
    return; let u = S.units.find(u => u.id === S.selectedUnit); if (!u || u.cool > 0) {
    log('이 부대는 재출격 대기 중입니다.', 'bad');
    draw();
    return;
} directPaths(u, type); }
function addWaypoint() {
    if (isOver())
        return;
    const n = nId(S.selectedId), u = S.units.find(x => x.id === S.selectedUnit);
    if (!n) {
        log('목적지 미선택', 'bad');
        draw();
        return;
    }
    const p = rect(n.r, n.c);
    if (!u || u.cool > 0) {
        log('재출격 대기 중인 부대는 경로를 수정할 수 없습니다.', 'bad');
        draw();
        return;
    }
    if (u.path.length >= 8) {
        log('경유지 등록 한도: 8개', 'warn');
        draw();
        return;
    }
    if (u.path.length && eq(u.path[u.path.length - 1], p)) {
        log('마지막 경유지와 동일한 거점', 'warn');
        draw();
        return;
    }
    if (!u.path.length && eq(u, p)) {
        log(u.name + '은(는) 이미 ' + n.name + '에 있습니다. 다른 목적지를 선택하세요.', 'warn');
        draw();
        return;
    }
    // 명령 전에 등록한 경로도 부대별로 저장한다. 다른 부대를 선택해도 경로가 섞이지 않는다.
    u.path.push(p);
    u.frontierWaiting = null;
    const suffix = ['advance', 'rush'].includes(u.cmd) ? ' (실행 중인 명령 뒤에 연결됨)' : ' (명령 대기)';
    log(u.name + ' 경로 선택: ' + n.name + suffix, 'good');
    draw();
}
function clearWaypoint() {
    if (isOver())
        return;
    const u = S.units.find(x => x.id === S.selectedUnit);
    if (!u)
        return;
    u.path = [];
    u.cmd = 'hold';
    u.frontierWaiting = null;
    log(u.name + ' 경로 초기화 · 현 위치 대기', 'good');
    draw();
}
function knockOut(u) { u.restTurns = 0; u.hp = 0; u.cool = 3; u.cmd = 'hold'; u.path = []; S.deadCount++; log(u.name + ' 전투 이탈. 3턴 후 본진에서 재출격합니다.', 'bad'); }
function moveLeader(u) {
    if (u.cool > 0) {
        u.cool--;
        if (u.cool === 0) {
            u.hp = u.max;
            u.r = u.home;
            u.c = 0;
            u.cmd = 'hold';
            u.path = [];
            u.restTurns = 0;
            log(u.name + '이(가) 본진에서 재출격했습니다.', 'good');
        }
        return;
    }
    if (u.cmd === 'hold' || !u.path.length)
        return;
    while (u.path.length && eq(u, u.path[0]))
        u.path.shift();
    if (!u.path.length) {
        if (u.cmd !== 'rush' || !nAt(u.r, u.c) || nAt(u.r, u.c).owner === 'ally')
            u.cmd = 'hold';
        log(u.name + ' 경로 종료' + (u.cmd === 'rush' ? ' (우선이동, 공격 안 함)' : ' (주둔)') + '.', 'good');
        return;
    }
    const local = nAt(u.r, u.c), foes = allAt('enemy', u.r, u.c);
    // 진격은 맞닥뜨린 적과 교전해 제압한 뒤 이동을 재개한다.
    if (u.cmd === 'advance' && (foes.length || (local && local.owner === 'enemy')))
        return;
    let goal = u.path[0], route = routeTowardGoal(u, goal, 'ally', u.cmd).path;
    if (route === null) {
        log(u.name + ' 이동 가능한 경로 없음', 'warn');
        return;
    }
    if (!route.length) {
        // 이미 이동 가능한 최전방에 도착: 경유지는 유지하고 개방까지 대기한다.
        if (!u.frontierWaiting || !eq(u.frontierWaiting, goal)) {
            log(u.name + ' 전선 개방 대기 · 현재 위치 ' + nameAt(u.r, u.c), 'warn');
            u.frontierWaiting = rect(goal.r, goal.c);
        }
        return;
    }
    u.frontierWaiting = null;
    // 기획서에서 우선이동의 두 칸 속도 상승은 명시하지 않았으므로 이동 속도는 진격과 동일한 1칸이다.
    let tile = route[0];
    u.r = tile.r;
    u.c = tile.c;
    u.movedThisTurn = true;
    u.restTurns = 0;
    log(u.name + ' 이동 → ' + nameAt(u.r, u.c) + (u.cmd === 'rush' ? ' (우선이동, 교전 회피)' : ''));
    while (u.path.length && eq(u, u.path[0]))
        u.path.shift();
    if (!u.path.length) {
        if (u.cmd !== 'rush' || !nAt(u.r, u.c) || nAt(u.r, u.c).owner === 'ally')
            u.cmd = 'hold';
        log(u.name + '이(가) 최종 목표에 도착해 머뭅니다.' + (u.cmd === 'rush' ? ' 교전 없이 대기합니다.' : ''), 'good');
    }
}
// 일반병도 같은 8방향 길 찾기를 사용한다. 전황에 따라 다른 전선으로 기동할 수 있음.
function routeToPriority(u, candidates, side) {
    let routes = [];
    for (const obj of candidates) {
        if (eq(u, obj))
            continue;
        let path = routeFind(u, obj, side);
        if (path && path.length)
            routes.push({ obj, path, score: path.length + (obj.r === u.r ? 0 : .7) });
    }
    routes.sort((a, b) => a.score - b.score || Math.abs(a.obj.r - u.r) - Math.abs(b.obj.r - u.r));
    return routes[0] || null;
}
function enemyMove(u) {
    if (u.hp <= 0)
        return;
    const local = nAt(u.r, u.c);
    if (allAt('ally', u.r, u.c).length || (local && local.owner === 'ally'))
        return;
    if (u.c === 0)
        return;
    // 측면 침투병은 전선 점령지보다 본진 출격지를 목표로 삼는다. 실제 인접 칸을 이동하며 교전·저지 가능.
    if (u.raider) {
        const home = rect(u.raidLane, 0);
        const path = routeFind(u, home, 'enemy');
        if (path && path.length) {
            u.r = path[0].r;
            u.c = path[0].c;
        }
        return;
    }
    if (u.c === 1 && S.turn < SCENARIOS[S.stage].delay)
        return;
    // 인접한 아군 점령 거점을 우선 압박하고, 비어 있으면 아군 출격지로 진군. 대각 기동 허용.
    // 따라서 북→중앙, 중앙→남부 등 적군의 측면 이동·우회 침공이 발생한다.
    const held = S.nodes.filter(n => n.owner === 'ally' && n.c <= u.c && n.c >= 1);
    const reachable = routeToPriority(u, held, 'enemy');
    let path = reachable?.path;
    if (!path) {
        const spawns = [0, 1, 2].map(r => rect(r, 0));
        const target = routeToPriority(u, spawns, 'enemy');
        path = target?.path;
    }
    if (path && path.length) {
        const next = path[0];
        u.r = next.r;
        u.c = next.c;
    }
}
function autoSoldierMove(u) {
    if (u.hp <= 0)
        return;
    const local = nAt(u.r, u.c);
    if (allAt('enemy', u.r, u.c).length || (local && local.owner === 'enemy'))
        return;
    // 일반 거점에서 생산된 병력도 주변의 적 거점으로 상하·대각 기동.
    const targets = S.nodes.filter(n => n.owner === 'enemy' && n.c >= u.c && unlocked(n.c));
    const choice = routeToPriority(u, targets, 'ally');
    if (choice && choice.path.length) {
        const next = choice.path[0];
        u.r = next.r;
        u.c = next.c;
    }
}
function heroMovement() {
    let h = S.hero;
    if (h.cool > 0) {
        h.cool--;
        if (h.cool === 0) {
            h.hp = h.max;
            h.r = 1;
            h.c = 0;
            h.target = null;
            log('클리프가 본진에서 재출격했습니다.', 'good');
        }
        return;
    }
    if (!h.target || eq(h, h.target)) {
        h.target = null;
        return;
    }
    let path = routeTowardGoal(h, h.target, 'ally', 'advance').path;
    if (path && path.length) {
        let p = path[0];
        h.r = p.r;
        h.c = p.c;
        log('클리프 이동 → ' + nameAt(h.r, h.c));
    }
    if (eq(h, h.target))
        h.target = null;
}
function focusDamage(units, dmg, attackerSide) {
    // 전투 타깃은 일반병부터 소진, 지휘 부대가 최후에 남아 재출격을 유도한다.
    const targets = [...units].sort((a, b) => (a.kind === 'leader' ? 1 : 0) - (b.kind === 'leader' ? 1 : 0) || a.hp - b.hp);
    let remain = dmg, applied = 0;
    for (const u of targets) {
        let taken = Math.min(u.hp, remain);
        u.hp -= taken;
        remain -= taken;
        applied += taken;
        if (u.hp <= 0) {
            if (u.kind === 'leader')
                knockOut(u);
            else if (u.side === 'enemy')
                S.enemyKills++;
        }
        if (remain <= 0)
            break;
    }
    return applied;
}
function nodeDamage(n, side, amount) {
    if (n.owner === side || amount <= 0)
        return 0;
    if (side === 'ally' && n.id === 'HQ' && !unlocked(4))
        return 0;
    let actual = 0;
    // 정예 지휘관 → 병기 시설 → 거점 방어력 순서로 공략
    if (side === 'ally') {
        if (n.elite > 0) {
            let take = Math.min(n.elite, amount);
            n.elite -= take;
            amount -= take;
            actual += take;
            if (n.elite === 0)
                log(n.name + '의 적 정예병/지휘관을 제압했습니다.', 'good');
        }
        if (n.facility > 0 && amount > 0) {
            let take = Math.min(n.facility, Math.max(1, Math.round(amount * .65)));
            n.facility -= take;
            amount -= take;
            actual += take;
            if (n.facility === 0)
                log(n.name + ' 공략 시설 파괴 완료', 'good');
        }
    }
    else if (n.owner === 'ally') {
        // 적은 경비대와 거점 HP를 돌파해 재점령
        let guards = S.units.filter(u => u.kind === 'guard' && u.r === n.r && u.c === n.c && u.hp > 0);
        if (guards.length) {
            let guard = guards[0];
            let take = Math.min(guard.hp, amount);
            guard.hp -= take;
            amount -= take;
            actual += take;
            if (guard.hp <= 0)
                log(n.name + '의 아군 경비대가 격파됐습니다.', 'bad');
        }
    }
    if (amount > 0) {
        const take = Math.min(n.hp, amount);
        n.hp -= take;
        actual += take;
    }
    if (n.hp === 0 && n.elite === 0 && n.facility === 0 && side === 'ally')
        claim(n, 'ally');
    else if (n.hp === 0 && side === 'enemy')
        claim(n, 'enemy');
    return actual;
}
function claim(n, side) {
    if (n.owner === side)
        return;
    n.owner = side;
    n.hp = Math.ceil(n.max * (side === 'ally' ? .66 : .57));
    n.elite = 0;
    n.facility = 0;
    S.units = S.units.filter(u => !(u.kind === 'guard' && u.r === n.r && u.c === n.c));
    let guardHp = Math.round((side === 'ally' ? 25 : 16) * (side === 'ally' ? 1 : SCENARIOS[S.stage].scale));
    S.units.push({ id: (side === 'ally' ? 'G' : 'X') + (++ids), side, kind: 'guard', name: side === 'ally' ? '회색갈기 주둔 경비대' : '발더 주둔군', r: n.r, c: n.c, hp: guardHp, max: guardHp, atk: side === 'ally' ? 8 : 6, cool: 0, cmd: 'hold', path: [] });
    log((side === 'ally' ? '점령 성공: ' : '적이 재탈환: ') + n.name + (side === 'ally' ? ' · 주둔 경비대 배치' : ''), side === 'ally' ? 'good' : 'bad');
    if (n.type === 'fort')
        log('요새 소유 변경! ' + (side === 'ally' ? '회색갈기' : '발더') + ' 세력의 공격 보너스에 반영됩니다.', 'warn');
    if (n.id === 'HQ' && side === 'ally')
        finish('win');
}
function fightTile(r, c) {
    let friends = allAt('ally', r, c), hostiles = allAt('enemy', r, c), heroHere = S.hero.cool === 0 && S.hero.r === r && S.hero.c === c && S.hero.hp > 0;
    // 우선이동 부대는 공격하지 않고, 그 위치에서 적의 공격을 받기만 한다.
    let fighters = friends.filter(u => u.kind !== 'leader' || u.cmd !== 'rush');
    if (hostiles.length && (friends.length || heroHere)) {
        for (const u of friends)
            if (u.kind === 'leader')
                u.foughtThisTurn = true;
        const ap = fighters.reduce((sum, u) => sum + u.atk + fortBonus('ally'), 0);
        const ep = hostiles.reduce((sum, u) => sum + u.atk + fortBonus('enemy'), 0);
        if (ap > 0)
            focusDamage(hostiles, ap, 'ally');
        if (friends.length)
            focusDamage(friends, ep, 'enemy');
        else if (heroHere)
            S.hero.hp = Math.max(0, S.hero.hp - ep);
        log(nameAt(r, c) + ' 교전: 아군 반격 ' + ap + ' / 적 공격 ' + ep + (friends.some(u => u.kind === 'leader' && u.cmd === 'rush') ? ' · 우선이동 부대 공격 제외' : ''), 'warn');
        if (heroHere && S.hero.hp <= 0) {
            S.hero.cool = 3;
            S.hero.target = null;
            log('클리프가 전장 이탈. 3턴 후 재출격합니다.', 'bad');
        }
    }
    friends = allAt('ally', r, c);
    hostiles = allAt('enemy', r, c);
    fighters = friends.filter(u => u.kind !== 'leader' || u.cmd !== 'rush');
    const n = nAt(r, c);
    if (!n)
        return;
    if (n.owner === 'enemy' && hostiles.length === 0 && fighters.length) {
        for (const u of fighters)
            if (u.kind === 'leader')
                u.foughtThisTurn = true;
        if (n.id === 'HQ' && !unlocked(4))
            return;
        const dmg = fighters.reduce((sum, u) => sum + u.atk + fortBonus('ally'), 0);
        if (dmg)
            nodeDamage(n, 'ally', dmg);
    }
    else if (n.owner === 'ally' && hostiles.length && friends.length === 0 && !(heroHere && S.hero.hp > 0)) {
        const dmg = hostiles.reduce((sum, u) => sum + u.atk + fortBonus('enemy'), 0);
        nodeDamage(n, 'enemy', dmg);
    }
}
function assaultHQ() {
    const n = nId('HQ');
    if (n.owner === 'ally')
        return;
    if (!unlocked(4))
        return;
    // HQ tile is handled by fightTile; no remote combat
}
function artilleryFire() {
    for (const n of S.nodes.filter(n => n.type === 'siege')) {
        if (S.turn % 2 !== 0 && n.owner !== 'ally')
            continue;
        const side = n.owner, dir = side === 'ally' ? 1 : -1;
        // 점령 세력은 사거리 내(시험값: 맨해튼 거리 2 이내)의 다른 거점 공략에 활용한다.
        const eligible = S.nodes.filter(t => t.owner !== side && t.id !== n.id && dist(t, n) <= 2 &&
            (t.c - n.c) * dir >= 0 && (side !== 'ally' || (t.id !== 'HQ' || unlocked(4))));
        const target = eligible.sort((a, b) => Math.abs(a.r - n.r) - Math.abs(b.r - n.r) || b.c * dir - a.c * dir)[0];
        if (!target)
            continue;
        const damage = side === 'ally' ? (target.id === 'HQ' ? BAL.ally_artillery_hq_damage : BAL.ally_artillery_damage) : BAL.enemy_artillery_damage;
        const guards = allAt(target.owner, target.r, target.c).filter(u => u.kind === 'guard');
        let actual = 0;
        if (guards.length) {
            actual = focusDamage(guards, damage, side);
        }
        else if (target.elite > 0) {
            actual = Math.min(target.elite, damage);
            target.elite -= actual;
        }
        else {
            actual = Math.min(Math.max(0, target.hp - 1), damage);
            target.hp -= actual;
        }
        if (side === 'ally')
            S.allyArtilleryDamageDealt += actual;
        else
            S.enemyArtilleryDamageDealt += actual;
        log((side === 'ally' ? '아군' : '적') + ' 공성병기 포격: ' + target.name + ' · 실제 피해 ' + actual, side === 'ally' ? 'good' : 'warn');
    }
}
function enemyWavePeriod(stage, difficulty) { return difficulty === 'challenge' ? SCENARIOS[stage].enemyChallengePeriod : SCENARIOS[stage].enemyPeriod; }
function produce() {
    const cfg = SCENARIOS[S.stage];
    for (const n of S.nodes.filter(n => n.type === 'general')) {
        const interval = n.owner === 'ally' ? BAL.ally_production_interval : BAL.enemy_production_interval; // 일반 거점 증가를 고려해 적 생산 주기를 완화 (시험값)
        if (S.turn % interval !== 0)
            continue;
        const side = n.owner, capUnits = side === 'ally' ? BAL.ally_soldier_cap : cfg.spawnLimit;
        let alive = S.units.filter(u => u.side === side && u.kind === 'soldier' && u.hp > 0).length;
        if (alive >= capUnits)
            continue;
        addUnit(side, 'soldier', n.r, n.c, { hp: side === 'ally' ? 26 : Math.round(24 * cfg.scale), atk: side === 'ally' ? 8 : 7 });
        log(n.name + '에서 ' + (side === 'ally' ? '회색갈기' : '발더') + ' 일반 병력이 생산됐습니다.');
    }
    if (S.turn > 0 && S.turn % (enemyWavePeriod(S.stage, S.difficulty)) === 0) {
        S.wave++;
        const rows = S.wave % 2 ? [0, 1] : [2, 1];
        let spawned = 0;
        for (const r of rows) {
            let alive = S.units.filter(u => u.side === 'enemy' && u.kind === 'soldier' && u.hp > 0).length;
            if (alive >= cfg.spawnLimit)
                continue;
            const lateWaveToughness = (S.stage === 2 && S.difficulty === 'challenge') ? BAL.stage3_challenge_wave_hp_multiplier : 1;
            addUnit('enemy', 'soldier', r, 4, { hp: Math.round((27 + S.wave * 2) * cfg.scale * lateWaveToughness), atk: 8 + Math.floor(S.wave / 3) });
            spawned++;
        }
        log('적 증원 ' + S.wave + '단계: ' + (spawned ? spawned + '개 부대 출격' : '병력 상한 도달 · 추가 출격 없음'), spawned ? 'warn' : '');
        // 2회마다 한 번의 측면 침투: 기존 병력 중 한 명이 본진 돌파 임무로 전환된다.
        // 추가 병력을 강제로 생성하지 않아 일반 증원 상한을 지킨다.
        if (S.stage > 0 && S.wave === 2) {
            const flank = S.wave % 2 ? 0 : 2;
            const squad = S.units.find(u => u.side === 'enemy' && u.kind === 'soldier' && u.hp > 0 && u.r === flank && u.c === 4 && !u.raider);
            if (squad) {
                squad.raider = true;
                squad.raidLane = flank;
                squad.name = '발더 침투병';
                squad.atk = BAL.raider_attack;
                S.raiderCount++;
                log('측면 침투 경보: ' + LANE[flank] + '에서 적 침투병이 아군 출격지를 노립니다.', 'bad');
            }
        }
    }
}
function supplyAndHealing() {
    // 신규 시험 규칙: 지휘 부대는 안전한 아군 출격지/점령 거점에 정지한 상태로
    // 2턴 이상 머물 때부터 회복한다. 진격/우선이동 중 또는 교전·적 기동병 접근 시 회복 불가.
    for (const u of S.units.filter(u => u.side === 'ally' && u.hp > 0 && u.cool === 0)) {
        if (u.kind === 'leader') {
            const n = currentNode('ally', u.r, u.c), isFriendly = (u.c === 0 || !!n);
            // 적 주둔군은 고정 방어 병력이라 인접 거리 경계에서 제외, 적 기동병만 위협 판정.
            const threatened = S.units.some(e => e.side === 'enemy' && e.kind !== 'guard' && e.cool === 0 && e.hp > 0 &&
                Math.abs(e.r - u.r) <= 1 && Math.abs(e.c - u.c) <= 1);
            const safe = isFriendly && (u.cmd === 'hold' || u.path.length === 0) && !u.movedThisTurn &&
                !u.foughtThisTurn && !threatened && allAt('enemy', u.r, u.c).length === 0;
            if (!safe) {
                u.restTurns = 0;
                continue;
            }
            u.restTurns = (u.restTurns || 0) + 1;
            u.totalRestTurns = (u.totalRestTurns || 0) + 1;
            if (u.restTurns >= BAL.rest_delay_turns && u.hp < u.max) {
                const amount = BAL.rest_heal_base + ((u.c === 0 || (n && n.type === 'general')) ? BAL.rest_heal_bonus : 0);
                const gained = Math.min(u.max - u.hp, amount);
                if (gained > 0) {
                    u.hp += gained;
                    u.restHealedTotal = (u.restHealedTotal || 0) + gained;
                    S.healingThisTurn += gained;
                    S.restHealingTotal += gained;
                    log(u.name + ' 안전 지역 휴식: HP +' + gained + ' (' + u.hp + '/' + u.max + ')', 'good');
                }
            }
        }
        else if (u.kind === 'guard' && allAt('enemy', u.r, u.c).length === 0) {
            u.hp = Math.min(u.max, u.hp + 2);
        }
    }
    // 주둔 부대의 거점 유지 효과: 병력을 직접 지휘하는 것과 주둔을 구분
    for (const n of S.nodes.filter(n => n.owner === 'ally')) {
        if (allAt('enemy', n.r, n.c).length)
            continue;
        if (allAt('ally', n.r, n.c).some(u => u.kind === 'leader' && u.cmd === 'hold'))
            n.hp = Math.min(n.max, n.hp + 3);
    }
}
function enemyBaseDamage() {
    for (let r = 0; r < 3; r++) {
        let attackers = allAt('enemy', r, 0);
        if (!attackers.length || allAt('ally', r, 0).length || (S.hero.cool === 0 && S.hero.r === r && S.hero.c === 0))
            continue;
        let dmg = Math.min(30, attackers.reduce((v, u) => v + u.atk + 2, 0));
        S.baseHp = Math.max(0, S.baseHp - dmg);
        log('적군이 ' + LANE[r] + ' 출격지에 도달해 아군 본진에 ' + dmg + ' 피해를 입혔습니다!', 'bad');
    }
    if (S.baseHp <= 0)
        finish('loss');
}
function finish(kind) {
    if (isOver())
        return;
    S.result = kind;
    stopAuto();
    let total = S.campaign.turns + S.turn;
    if (kind === 'win') {
        S.campaign.turns = total;
        S.campaign.hero += S.heroCount;
        S.campaign.losses += S.deadCount;
        S.campaign.cleared.push(S.stage);
        log('작전 성공 · ' + SCENARIOS[S.stage].title + ' 완료 (' + S.turn + '턴).', 'good');
        try {
            let key = 'greymanes_stage_' + S.stage + '_' + S.difficulty;
            let best = Number(localStorage.getItem(key) || 0);
            if (!best || S.turn < best)
                localStorage.setItem(key, String(S.turn));
        }
        catch { }
    }
    else
        log('회색갈기 본진 함락 · 작전 실패', 'bad');
    recordFrame();
}
function tick() {
    if (isOver())
        return;
    S.turn++;
    S.healingThisTurn = 0;
    for (const u of S.units.filter(u => u.kind === 'leader' && u.side === 'ally')) {
        u.movedThisTurn = false;
        u.foughtThisTurn = false;
    }
    heroMovement();
    for (const u of S.units.filter(u => u.kind === 'leader' && u.side === 'ally'))
        moveLeader(u);
    for (const u of [...S.units].filter(u => u.kind === 'soldier' && u.side === 'ally'))
        autoSoldierMove(u);
    for (const u of [...S.units].filter(u => u.kind === 'soldier' && u.side === 'enemy'))
        enemyMove(u);
    for (let c = 0; c <= 4 && !isOver(); c++)
        for (let r = 0; r < 3 && !isOver(); r++)
            fightTile(r, c);
    if (!isOver()) {
        artilleryFire();
        supplyAndHealing();
        produce();
        enemyBaseDamage();
        prune();
    }
    S.events.push({ turn: S.turn, baseHp: S.baseHp, owned: S.nodes.filter(n => n.c <= 3 && n.owner === 'ally').length, allyMobile: S.units.filter(u => u.side === 'ally' && u.kind !== 'guard' && u.hp > 0).length, enemyMobile: S.units.filter(u => u.side === 'enemy' && u.kind !== 'guard' && u.hp > 0).length, heroActions: S.heroCount, knockouts: S.deadCount, enemyKills: S.enemyKills, wave: S.wave });
    recordFrame();
    draw();
}
function heroMove() { if (isOver())
    return; let n = nId(S.selectedId); if (!n) {
    log('이동 목적지 미선택', 'bad');
    draw();
    return;
} if (S.hero.cool > 0) {
    log('클리프 재출격 대기 중입니다.', 'bad');
    draw();
    return;
} S.hero.target = rect(n.r, n.c); log('클리프 이동 목표: ' + n.name + (!unlocked(n.c) ? ' · 열린 전선까지만 먼저 이동' : ''), 'good'); draw(); }
function heroAct() {
    if (isOver())
        return;
    let h = S.hero, n = nId(S.selectedId);
    if (!n || n.type === 'home') {
        log('아군 출격지는 공격 대상이 아닙니다. 적 거점을 선택해 주세요.', 'warn');
        draw();
        return;
    }
    if (h.cool > 0) {
        log('클리프는 재출격 대기 중입니다.', 'bad');
        draw();
        return;
    }
    if (h.r !== n.r || h.c !== n.c) {
        log('클리프 위치 불일치 · 목표 거점 도착 후 공격 가능', 'bad');
        draw();
        return;
    }
    if (S.heroUseTurn === S.turn) {
        log('클리프 공격 사용 완료 · 다음 턴 대기', 'warn');
        draw();
        return;
    }
    let hostile = allAt('enemy', h.r, h.c), dmg = BAL.hero_attack;
    let actual = 0;
    if (hostile.length) {
        actual = focusDamage(hostile, dmg, 'ally');
        log('클리프 공격: 적 병력에 ' + actual + ' 피해', 'good');
    }
    else if (n.owner === 'enemy') {
        actual = nodeDamage(n, 'ally', dmg);
        log('클리프 공격: ' + n.name + '에 ' + actual + ' 피해', 'good');
    }
    else {
        log('공격 대상 없음', 'warn');
        draw();
        return;
    }
    S.heroCount++;
    S.heroDamageDealt += actual;
    S.heroUseTurn = S.turn;
    // 직접 전투는 한 턴의 주요 행동으로 처리. 적도 다음 턴에 반격한다.
    if (!isOver())
        tick();
    else {
        recordFrame();
        draw();
    }
}

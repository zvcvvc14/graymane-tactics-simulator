/**
 * 회색갈기 대공세 — 03 · 전황 기록 / CSV 가져오기·내보내기
 * 원본 시뮬레이션 규칙을 유지하며 소스만 기능별로 정리했습니다.
 */

'use strict';
const csvFields = {
    turn: ['session_id', 'source', 'engine_version', 'balance_config_id', 'stage', 'stage_name', 'difficulty', 'turn', 'result', 'base_hp', 'base_hp_max', 'base_hp_change_turn', 'owned_total', 'owned_change_turn', 'ally_leader_hp_total', 'ally_leader_hp_min', 'owned_general', 'owned_fort', 'owned_siege', 'enemy_wave', 'hero_r', 'hero_c', 'hero_hp', 'hero_hp_max', 'hero_cool', 'hero_actions', 'ally_leaders_active', 'ally_soldiers', 'enemy_soldiers', 'ally_knockouts', 'ally_knockouts_new_turn', 'enemy_unit_kills', 'resting_leaders', 'rest_hp_recovered_turn', 'rest_hp_recovered_total'],
    unit: ['session_id', 'source', 'engine_version', 'balance_config_id', 'stage', 'stage_name', 'difficulty', 'turn', 'unit_id', 'unit_name', 'side', 'kind', 'row', 'col', 'hp', 'hp_max', 'respawn_cooldown', 'command', 'remaining_waypoints'],
    node: ['session_id', 'source', 'engine_version', 'balance_config_id', 'stage', 'stage_name', 'difficulty', 'turn', 'node_id', 'node_name', 'node_type', 'row', 'col', 'owner', 'hp', 'hp_max', 'elite_hp', 'facility_hp', 'garrison_count', 'garrison_hp', 'ally_present', 'enemy_present'],
    event: ['session_id', 'source', 'engine_version', 'balance_config_id', 'stage', 'stage_name', 'difficulty', 'turn', 'event_index', 'severity', 'detail']
};
function csvValue(v) {
    const s = v === null || v === undefined ? '' : String(v);
    const safe = /^\s*[=+@]/.test(s) ? "'" + s : s;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
}
function downloadCsv(kind) {
    const rows = { turn: S.turnFrames, unit: S.unitFrames, node: S.nodeFrames, event: S.eventLog }[kind];
    if (!rows || !rows.length) {
        log('해당 형식의 저장된 기록이 없습니다.', 'warn');
        draw();
        return;
    }
    const fields = csvFields[kind];
    const base = { session_id: S.sessionId, source: S.recordSource, engine_version: ENGINE_VERSION, balance_config_id: S.config_id, stage: S.stage + 1, stage_name: SCENARIOS[S.stage].title, difficulty: S.difficulty };
    const lines = [fields.map(csvValue).join(',')];
    for (const row of rows)
        lines.push(fields.map(k => csvValue(row[k] === undefined ? base[k] : row[k])).join(','));
    const file = { turn: '턴별전황', unit: '병력이동_HP', node: '거점상태', event: '명령_전투이벤트' }[kind];
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url;
    a.download = '회색갈기_' + S.sessionId + '_전장' + (S.stage + 1) + '_' + S.difficulty + '_' + file + '.csv';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2500);
    log(file + ' CSV ' + rows.length + '행 다운로드 요청', 'good');
    draw();
}
// 실측 데이터만 사용하여 요약/거점/지휘 부대 CSV를 생성한다. 피해량은 턴별 HP 하락분의 합으로서 근사치임.
function baseMeta() { return { session_id: S.sessionId, source: S.recordSource, engine_version: ENGINE_VERSION, balance_config_id: S.config_id, stage: S.stage + 1, stage_name: SCENARIOS[S.stage].title, difficulty: S.difficulty }; }
function analysisSnapshots() {
    const unitBy = new Map(), nodeBy = new Map();
    for (const row of S.unitFrames) {
        if (!unitBy.has(row.unit_id))
            unitBy.set(row.unit_id, []);
        unitBy.get(row.unit_id).push(row);
    }
    for (const row of S.nodeFrames) {
        if (!nodeBy.has(row.node_id))
            nodeBy.set(row.node_id, []);
        nodeBy.get(row.node_id).push(row);
    }
    return { unitBy, nodeBy };
}
function leaderStats(unitId, rows) {
    const out = { unit_id: unitId, unit_name: rows[0]?.unit_name || '', turns_on_field: 0, movement_turns: 0, damage_received_hp_drop: 0, min_hp: 100, knockouts: 0, respawn_wait_turns: 0, final_hp: 0, final_row: 0, final_col: 0 };
    let prev = null;
    for (const r of rows) {
        if (r.turn > 0 && r.respawn_cooldown === 0 && r.hp > 0)
            out.turns_on_field++;
        if (r.respawn_cooldown > 0)
            out.respawn_wait_turns++;
        if (r.hp < out.min_hp)
            out.min_hp = r.hp;
        if (prev) {
            if (r.row !== prev.row || r.col !== prev.col)
                out.movement_turns++;
            if (prev.hp > r.hp)
                out.damage_received_hp_drop += prev.hp - r.hp;
            if (prev.respawn_cooldown === 0 && r.respawn_cooldown > 0)
                out.knockouts++;
        }
        prev = r;
    }
    if (prev) {
        out.final_hp = prev.hp;
        out.final_row = prev.row;
        out.final_col = prev.col;
    }
    return out;
}
function balanceNodeRows() {
    const { nodeBy } = analysisSnapshots(), base = baseMeta();
    return S.nodes.map(n => {
        const rows = nodeBy.get(n.id) || [], last = rows[rows.length - 1] || n;
        let firstAllyTurn = '', allyControlTurns = 0, allyCaptures = 0, enemyRecaptures = 0, lastOwner = 'enemy', minDefense = n.max;
        for (const r of rows) {
            if (r.turn > 0 && r.owner === 'ally')
                allyControlTurns++;
            if (firstAllyTurn === '' && r.owner === 'ally')
                firstAllyTurn = r.turn;
            if (lastOwner !== r.owner) {
                if (r.owner === 'ally')
                    allyCaptures++;
                else
                    enemyRecaptures++;
            }
            lastOwner = r.owner;
            minDefense = Math.min(minDefense, r.hp);
        }
        return { ...base, node_id: n.id, node_name: n.name, type: n.type, front: n.c, initial_defense_hp: rows[0]?.hp_max || n.max, first_ally_capture_turn: firstAllyTurn, ally_capture_count: allyCaptures, enemy_recapture_count: enemyRecaptures, ally_owned_turns: allyControlTurns, defense_hp_min: minDefense, final_owner: last.owner || n.owner, final_defense_hp: last.hp };
    });
}
function balanceUnitRows() { const { unitBy } = analysisSnapshots(), base = baseMeta(); return ['A1', 'A2', 'A3', 'CLIFF'].map(id => ({ ...base, ...leaderStats(id, unitBy.get(id) || []) })); }
function balanceSummaryRows() {
    const frames = S.turnFrames, base = baseMeta(), last = frames[frames.length - 1] || {}, nodes = balanceNodeRows(), units = balanceUnitRows();
    const firstCapture = nodes.map(n => n.first_ally_capture_turn).filter(x => x !== '');
    const shots = S.eventLog.filter(e => String(e.detail || '').includes('아군 공성병기 포격:')).length;
    const enemyShots = S.eventLog.filter(e => String(e.detail || '').includes('적 공성병기 포격:')).length;
    const baseMin = frames.reduce((min, f) => Math.min(min, f.base_hp), S.baseMax);
    const unitHpLoss = units.reduce((sum, u) => sum + u.damage_received_hp_drop, 0);
    const avgAllies = frames.length > 1 ? Math.round(frames.slice(1).reduce((s, f) => s + f.ally_soldiers, 0) / (frames.length - 1) * 100) / 100 : 0;
    const avgEnemies = frames.length > 1 ? Math.round(frames.slice(1).reduce((s, f) => s + f.enemy_soldiers, 0) / (frames.length - 1) * 100) / 100 : 0;
    return [{ ...base, ...S.tuningSnapshot, turns: S.turn, result: S.result || 'in_progress', rest_hp_recovered_total: S.restHealingTotal || 0, rest_turns_total: S.units.filter(u => u.kind === 'leader' && u.side === 'ally').reduce((sum, u) => sum + (u.totalRestTurns || 0), 0), base_hp_initial: S.baseMax, base_hp_final: S.baseHp, base_hp_lost: S.baseMax - S.baseHp, base_hp_min: baseMin, first_capture_turn: firstCapture.length ? Math.min(...firstCapture) : '', captured_at_end: last.owned_total || 0, ally_capture_events: nodes.filter(n => n.node_id !== 'HQ').reduce((s, n) => s + n.ally_capture_count, 0), enemy_recapture_events: nodes.filter(n => n.node_id !== 'HQ').reduce((s, n) => s + n.enemy_recapture_count, 0), ally_general_at_end: last.owned_general || 0, ally_fort_at_end: last.owned_fort || 0, ally_siege_at_end: last.owned_siege || 0, ally_artillery_shots: shots, enemy_artillery_shots: enemyShots, ally_artillery_damage_dealt: S.allyArtilleryDamageDealt, enemy_artillery_damage_dealt: S.enemyArtilleryDamageDealt, hero_actions: S.heroCount, hero_damage_dealt: S.heroDamageDealt, ally_leader_knockouts: S.deadCount, leader_and_hero_hp_drop_sum: unitHpLoss, enemy_unit_kills: S.enemyKills, enemy_infiltration_count: S.raiderCount, enemy_wave_last: S.wave, average_ally_soldiers: avgAllies, average_enemy_soldiers: avgEnemies, observed_frames: frames.length, notes: '지휘 부대 HP 감소량은 턴 스냅샷 기준 근사치; 자체 시뮬레이터 데이터(이용자 관측치 아님)' }];
}
function csvDownload(name, fields, records) {
    const lines = [fields.map(csvValue).join(',')];
    for (const row of records)
        lines.push(fields.map(k => csvValue(row[k])).join(','));
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    // The Blob implementation below is deliberately replaced by normal literal BOM/newline for browsers.
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.download = '회색갈기_' + S.sessionId + '_' + S.config_id + '_' + name + '.csv';
    a.href = url;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2500);
    const status = $('balanceImportStatus');
    status.textContent = name + ' CSV ' + records.length + '행 다운로드 요청 · ' + S.config_id;
    status.className = 'balance-status ok';
}
const analysisFields = {
    summary: ['session_id', 'source', 'engine_version', 'balance_config_id', 'stage', 'stage_name', 'difficulty', 'ally_attack', 'hero_attack', 'stage_enemy_scale', 'enemy_wave_interval', 'rest_delay_turns', 'rest_heal_base', 'rest_heal_bonus', 'node_defense_multiplier_mean', 'turns', 'result', 'base_hp_initial', 'base_hp_final', 'base_hp_lost', 'base_hp_min', 'first_capture_turn', 'captured_at_end', 'ally_capture_events', 'enemy_recapture_events', 'ally_general_at_end', 'ally_fort_at_end', 'ally_siege_at_end', 'ally_artillery_shots', 'enemy_artillery_shots', 'ally_artillery_damage_dealt', 'enemy_artillery_damage_dealt', 'hero_actions', 'hero_damage_dealt', 'ally_leader_knockouts', 'rest_hp_recovered_total', 'rest_turns_total', 'leader_and_hero_hp_drop_sum', 'enemy_unit_kills', 'enemy_wave_last', 'average_ally_soldiers', 'average_enemy_soldiers', 'observed_frames', 'notes'],
    node: ['session_id', 'source', 'engine_version', 'balance_config_id', 'stage', 'stage_name', 'difficulty', 'node_id', 'node_name', 'type', 'front', 'initial_defense_hp', 'first_ally_capture_turn', 'ally_capture_count', 'enemy_recapture_count', 'ally_owned_turns', 'defense_hp_min', 'final_owner', 'final_defense_hp'],
    unit: ['session_id', 'source', 'engine_version', 'balance_config_id', 'stage', 'stage_name', 'difficulty', 'unit_id', 'unit_name', 'turns_on_field', 'movement_turns', 'damage_received_hp_drop', 'min_hp', 'knockouts', 'respawn_wait_turns', 'final_hp', 'final_row', 'final_col']
};
function exportBalance(kind) { const rows = kind === 'summary' ? balanceSummaryRows() : kind === 'node' ? balanceNodeRows() : balanceUnitRows(); csvDownload('밸런스_' + ({ summary: '한판요약', node: '거점별', unit: '지휘부대별' }[kind]), analysisFields[kind], rows); }
function archiveSession() {
    if (!S || S.turn === 0 || HISTORY.some(r => r.session_id === S.sessionId))
        return;
    HISTORY.push({ ...balanceSummaryRows()[0], result: S.result || 'aborted', notes: '재시작 전 세션 기록', archive_reason: S.result || 'restart_before_finish' });
}
// 밸런스 의사결정에 필요한 실측 정보만 추린다. 보조 좌표·미세 상태값은 다운로드하지 않는다.
const MAJOR_RESULT_FIELDS = [
    'session_id', 'source', 'engine_version', 'balance_config_id', 'stage', 'stage_name', 'difficulty', 'result', 'turns',
    'first_capture_turn', 'base_hp_final', 'base_hp_lost', 'captured_at_end', 'enemy_recapture_events',
    'ally_leader_knockouts', 'hero_actions', 'hero_damage_dealt', 'rest_hp_recovered_total', 'ally_artillery_shots', 'ally_artillery_damage_dealt', 'enemy_artillery_damage_dealt', 'enemy_unit_kills',
    'ally_attack', 'hero_attack', 'raider_attack', 'stage_enemy_scale', 'enemy_wave_interval', 'late_wave_hp_multiplier'
];
const MAJOR_TURN_FIELDS = [
    'session_id', 'source', 'engine_version', 'balance_config_id', 'stage', 'difficulty', 'turn', 'major_events',
    'captured_nodes', 'enemy_recaptured_nodes', 'base_damage_turn', 'base_hp_remaining',
    'owned_total', 'new_leader_knockouts', 'enemy_wave', 'result'
];
function importantTurns() {
    const items = [], frames = S.turnFrames, byTurn = new Map();
    for (const n of S.nodeFrames) {
        if (!byTurn.has(n.turn))
            byTurn.set(n.turn, new Map());
        byTurn.get(n.turn).set(n.node_id, n);
    }
    for (let i = 1; i < frames.length; i++) {
        const current = frames[i], previous = frames[i - 1], currNodes = byTurn.get(current.turn) || new Map(), prevNodes = byTurn.get(previous.turn) || new Map();
        const captured = [], recaptured = [];
        let hqCaptured = false;
        for (const [id, node] of currNodes) {
            const before = prevNodes.get(id);
            if (!before || before.owner === node.owner)
                continue;
            if (before.owner !== 'ally' && node.owner === 'ally') {
                if (id === 'HQ')
                    hqCaptured = true;
                else
                    captured.push(node.node_name);
            }
            else if (before.owner === 'ally' && node.owner === 'enemy')
                recaptured.push(node.node_name);
        }
        const damage = Math.max(0, previous.base_hp - current.base_hp), newLoss = Math.max(0, current.ally_knockouts - previous.ally_knockouts), types = [];
        if (captured.length)
            types.push('아군 점령');
        if (hqCaptured)
            types.push('적 본진 점령');
        if (recaptured.length)
            types.push('적 재탈환');
        if (damage > 0)
            types.push('본진 피해');
        if (newLoss > 0)
            types.push('지휘부대 이탈');
        if (current.enemy_wave > previous.enemy_wave)
            types.push('적 증원');
        if (S.eventLog.some(e => e.turn === current.turn && e.detail.startsWith('측면 침투 경보:')))
            types.push('측면 침투');
        if (current.result && current.result !== 'ongoing')
            types.push(current.result === 'win' ? '승리' : '패배');
        if (!types.length)
            continue;
        items.push({ session_id: current.session_id, source: current.source, engine_version: current.engine_version, balance_config_id: current.balance_config_id,
            stage: current.stage, difficulty: current.difficulty, turn: current.turn, major_events: types.join(' | '),
            captured_nodes: captured.join(' | '), enemy_recaptured_nodes: recaptured.join(' | '), base_damage_turn: damage,
            base_hp_remaining: current.base_hp, owned_total: current.owned_total, new_leader_knockouts: newLoss,
            leader_knockouts_total: current.ally_knockouts, enemy_wave: current.enemy_wave,
            hero_actions_total: current.hero_actions, rest_hp_recovered_total: current.rest_hp_recovered_total,
            result: current.result });
    }
    return items;
}
function exportKeyTurns() {
    if (!S || S.turn === 0) {
        $('balanceImportStatus').textContent = '1턴 이상 진행해야 주요 전황이 기록됩니다.';
        return;
    }
    const rows = importantTurns();
    if (!rows.length) {
        $('balanceImportStatus').textContent = '아직 거점 점령·본진 피해·부대 이탈·증원 등 주요 사건이 없습니다.';
        return;
    }
    csvDownload('핵심_전황변화', MAJOR_TURN_FIELDS, rows);
}
// 현재 전장에 영향을 주는 주요 설정만 추출한다. 다른 상세 설정은 엔진 내부에 보존.
const MAJOR_GLOBAL_KEYS = new Set([
    'ally_attack', 'hero_attack', 'fort_bonus_per_fort', 'ally_production_interval',
    'enemy_production_interval', 'ally_artillery_damage', 'ally_artillery_hq_damage', 'enemy_artillery_damage', 'raider_attack', 'stage3_challenge_wave_hp_multiplier', 'ally_soldier_cap',
    'rest_delay_turns', 'rest_heal_base', 'rest_heal_bonus'
]);
const MAJOR_STAGE_KEYS = new Set(['scale', 'enemyPeriod', 'enemyChallengePeriod', 'spawnLimit', 'base']);
const MAJOR_NODE_KEYS = { 1: [], 2: ['N2'], 3: ['HQ'] };
function majorBalanceFields(stage) {
    return BAL_FIELDS.filter(f => (f.scope === 'global' && MAJOR_GLOBAL_KEYS.has(f.key) &&
        (f.key !== 'stage3_challenge_wave_hp_multiplier' || (stage === 3 && S.difficulty === 'challenge')) &&
        (f.key !== 'raider_attack' || stage > 1)) ||
        (f.scope === 'stage' && f.stage === stage && MAJOR_STAGE_KEYS.has(f.key)) ||
        (f.scope === 'node' && f.stage === stage && (MAJOR_NODE_KEYS[stage] || []).includes(f.key)));
}
function exportBalanceHistory() {
    const rows = HISTORY.filter(r => r.result === 'win' || r.result === 'loss');
    if (S && S.turn > 0 && (S.result === 'win' || S.result === 'loss') && !HISTORY.some(r => r.session_id === S.sessionId))
        rows.push({ ...balanceSummaryRows()[0], archive_reason: S.result });
    if (!rows.length) {
        $('balanceImportStatus').textContent = '승리 또는 패배로 끝낸 전투가 없습니다. 중도 재시작한 전투는 성과 집계에서 제외됩니다.';
        return;
    }
    // 제1전장에는 침투병이 없으므로 미적용 공격력을 빈칸으로 남깁니다.
    const exported = rows.map(r => ({ ...r, raider_attack: Number(r.stage) === 1 ? '' : r.raider_attack }));
    csvDownload('핵심_실험성과', MAJOR_RESULT_FIELDS, exported);
}
function exportBalanceConfig() {
    const rows = majorBalanceFields(S.stage + 1).map(f => ({ scope: f.scope, stage: f.stage, parameter: f.key, value: getBalanceValue(f), min: f.min, max: f.max, description: f.desc }));
    // not editable by design: requested HP 100 invariant.
    rows.unshift({ scope: 'fixed', stage: 'all', parameter: 'leader_and_cliff_hp', value: 100, min: 100, max: 100, description: '회색갈기 지휘 부대 및 클리프 HP 100 (변경 불가)' });
    csvDownload('핵심_밸런스설정', ['scope', 'stage', 'parameter', 'value', 'min', 'max', 'description'], rows);
}
// RFC 4180 reader: commas and quoted cells work; never eval CSV contents.
function parseCSV(text) {
    const content = text.replace(/^\uFEFF/, '');
    let rows = [], cur = [], field = '', quoted = false;
    for (let i = 0; i < content.length; i++) {
        const ch = content[i];
        if (quoted) {
            if (ch === '"' && content[i + 1] === '"') {
                field += '"';
                i++;
            }
            else if (ch === '"')
                quoted = false;
            else
                field += ch;
        }
        else if (ch === '"')
            quoted = true;
        else if (ch === ',') {
            cur.push(field);
            field = '';
        }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && content[i + 1] === '\n')
                i++;
            cur.push(field);
            if (cur.some(v => v.trim() !== ''))
                rows.push(cur);
            cur = [];
            field = '';
        }
        else
            field += ch;
    }
    if (quoted)
        throw Error('닫히지 않은 따옴표가 있습니다.');
    if (cur.length || field !== '') {
        cur.push(field);
        if (cur.some(v => v.trim() !== ''))
            rows.push(cur);
    }
    return rows;
}
async function importBalanceConfig(file) {
    const status = $('balanceImportStatus');
    try {
        if (!file)
            return;
        if (file.size > 200000)
            throw Error('설정 CSV는 200KB 이하만 지원합니다.');
        const rows = parseCSV(await file.text());
        if (rows.length < 2)
            throw Error('설정 행이 없습니다.');
        const cols = rows[0].map(c => c.trim());
        if (new Set(cols).size !== cols.length)
            throw Error('중복된 CSV 열 이름이 있습니다.');
        const idx = Object.fromEntries(cols.map((c, i) => [c, i]));
        for (const key of ['scope', 'stage', 'parameter', 'value'])
            if (idx[key] === undefined)
                throw Error('필수 열 없음: ' + key);
        const found = new Map(), updates = [];
        for (const data of rows.slice(1)) {
            const scope = String(data[idx.scope] || '').trim(), stage = String(data[idx.stage] || '').trim(), parameter = String(data[idx.parameter] || '').trim(), raw = String(data[idx.value] || '').trim();
            if (scope === 'fixed') {
                if (parameter !== 'leader_and_cliff_hp' || Number(raw) !== 100)
                    throw Error('HP는 100으로 고정되어 있습니다.');
                continue;
            }
            const f = BAL_FIELDS.find(f => f.scope === scope && String(f.stage) === stage && f.key === parameter);
            if (!f)
                throw Error('등록되지 않은 설정: ' + scope + '/' + stage + '/' + parameter);
            if (found.has(scope + stage + parameter))
                throw Error('설정 행 중복: ' + parameter);
            const num = Number(raw);
            if (raw === '' || !Number.isFinite(num) || num < f.min || num > f.max || (f.integer && !Number.isInteger(num)))
                throw Error('값이 허용 범위를 벗어났습니다: ' + parameter + ' = ' + raw + ' (허용 ' + f.min + '~' + f.max + ')');
            found.set(scope + stage + parameter, true);
            updates.push({ f, num });
        }
        const isFullConfig = updates.length === BAL_FIELDS.length;
        if (!isFullConfig) {
            const expected = majorBalanceFields(S.stage + 1);
            const expKeys = new Set(expected.map(f => f.scope + '/' + f.stage + '/' + f.key));
            const wrongStage = updates.some(({ f }) => !expKeys.has(f.scope + '/' + f.stage + '/' + f.key));
            if (wrongStage)
                throw Error('현재 전장의 핵심 설정 파일이 아닙니다. 해당 전장을 먼저 선택한 뒤 불러오세요.');
            if (updates.length !== expected.length)
                throw Error('핵심 설정 행이 누락됐습니다. ' + updates.length + '/' + expected.length + '개. 원본 행을 삭제하지 마세요.');
        }
        const changed = updates.filter(({ f, num }) => getBalanceValue(f) !== num);
        if (S.turn > 0 && !window.confirm('현재 전투가 재시작됩니다. 기존 CSV 기록을 먼저 내보냈나요?'))
            return;
        stopAuto();
        for (const { f, num } of updates) {
            if (f.scope === 'global')
                BAL[f.key] = num;
            else if (f.scope === 'node')
                NODE_MUL[f.stage - 1][f.key] = num;
            else
                SCENARIOS[f.stage - 1][f.key] = num;
        }
        setUp(S.stage, S.difficulty, false);
        status.textContent = `핵심 설정 ${updates.length}개 적용 · 변경 ${changed.length}개 · ${configHash()} · 현재 전장 재시작`;
        status.className = 'balance-status ok';
    }
    catch (err) {
        status.textContent = '설정 적용 실패: ' + err.message;
        status.className = 'balance-status err';
    }
    finally {
        $('balanceImport').value = '';
    }
}
function exportCsv() { downloadCsv('turn'); }

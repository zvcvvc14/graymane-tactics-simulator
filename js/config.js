/**
 * 회색갈기 대공세 — 01 · 데이터 정의 / 밸런스 / 공통 유틸리티
 * 원본 시뮬레이션 규칙을 유지하며 소스만 기능별로 정리했습니다.
 */

'use strict';
// 독립 실행형 게임 기획 규칙 프로토타입. 수치는 실험용이며 실제 붉은사막 자료가 아님.
const DEFS = [
    { id: 'N1', r: 0, c: 1, type: 'general', name: '북부 보급로', hp: 32 },
    { id: 'C1', r: 1, c: 1, type: 'fort', name: '전초 요새', hp: 42 },
    { id: 'S1', r: 2, c: 1, type: 'general', name: '남부 통로', hp: 32 },
    { id: 'N2', r: 0, c: 2, type: 'fort', name: '북부 성채', hp: 46, elite: 22 },
    { id: 'C2', r: 1, c: 2, type: 'general', name: '중앙 집결지', hp: 37 },
    { id: 'S2', r: 2, c: 2, type: 'general', name: '남부 병참로', hp: 34 },
    { id: 'N3', r: 0, c: 3, type: 'general', name: '북부 성문', hp: 43 },
    { id: 'C3', r: 1, c: 3, type: 'siege', name: '중앙 포격 진지', hp: 44, facility: 23 },
    { id: 'S3', r: 2, c: 3, type: 'general', name: '남부 공성로', hp: 44, elite: 20 },
    { id: 'HQ', r: 1, c: 4, type: 'hq', name: '적 본진', hp: 85, elite: 28 }
];
const SCENARIOS = [
    // 테스트 값: 초반은 조작 적응, 중후반은 전선 공방이 중요하도록 단계별 증원/길목을 설정.
    { title: '제1전장 · 국경 돌파', scale: 1.16, enemyPeriod: 5, spawnLimit: 9, base: 160, delay: 9, bridge: [0, 1, 2, 3], description: '8방향 기동 가능 · 일반 거점과 중앙 요새를 활용하는 전장' },
    { title: '제2전장 · 요새 공방', scale: 1.22, enemyPeriod: 6, spawnLimit: 9, base: 150, delay: 8, bridge: [0, 2, 3], description: '제1전선 횡단로 단절 · 대각 우회로를 이용해 북부 성채를 압박하는 전장' },
    { title: '제3전장 · 최후 대공세', scale: 1.23, enemyPeriod: 6, spawnLimit: 10, base: 150, delay: 8, bridge: [0, 1, 3], description: '제2전선 횡단로 단절 · 제3전선의 중앙 병기 확보 후 적 본진 공략을 지원하는 전장' }
];
const REGION_STRENGTH = [
    { C1: 1.00, N2: 1.03, C2: 1.02, S2: .96, C3: 1.06, S3: 1.02, HQ: 1.02 },
    { N1: .96, S1: .98, C1: 1.10, N2: 1.11, C2: 1.04, S2: .94, N3: .97, C3: 1.13, S3: 1.01, HQ: 1.03 },
    { N1: .94, C1: 1.02, S1: .95, N2: 1.11, C2: 1.14, S2: 1.00, N3: 1.00, C3: 1.08, S3: 1.18, HQ: 1.08 }
];
const TYPE_LABEL = { general: '일반', fort: '요새', siege: '병기', hq: '적 본진', home: '아군 출격지' };
const LANE = ['북부', '중앙', '남부'];
const POS = (r, c) => ({ x: 10 + c * 20, y: 22 + r * 28 });
// 회색갈기와 클리프는 인접한 칸으로 8방향 이동한다. 적 AI는 기존 진군로를 우선 사용한다.
// 직전 전선 1거점 확보와 최종 본진의 제3전선 전면 확보 조건은 우회할 수 없다.
// 지도에 연결선 전체를 그리지 않고 선택된 부대의 실제 경로만 표시한다.
const diagonalPassage = (a, b) => Math.abs(a.r - b.r) === 1 && Math.abs(a.c - b.c) === 1;
const ENEMY_DIAGONAL = [
    [[0, 0, 1, 1], [2, 0, 1, 1], [0, 1, 1, 2], [1, 1, 2, 2], [0, 2, 1, 3], [1, 2, 2, 3]],
    [[0, 0, 1, 1], [2, 0, 1, 1], [0, 1, 1, 2], [1, 1, 0, 2], [2, 1, 1, 2], [1, 2, 2, 3]],
    [[0, 0, 1, 1], [2, 0, 1, 1], [1, 1, 0, 2], [1, 1, 2, 2], [0, 2, 1, 3], [2, 2, 1, 3]]
];
const enemyDiagonalPassage = (a, b) => ENEMY_DIAGONAL[S.stage].some(([r, c, rr, cc]) => (a.r === r && a.c === c && b.r === rr && b.c === cc) || (b.r === r && b.c === c && a.r === rr && a.c === cc));
const eq = (a, b) => a && b && a.r === b.r && a.c === b.c;
const dist = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
const cap = (v, l, h) => Math.max(l, Math.min(h, v));
const $ = (id) => document.getElementById(id);
const rect = (r, c) => ({ r, c });
let S = null, timer = null, ids = 0, HISTORY = [];
const ENGINE_VERSION = 'v24.21-final'; // 기획 검증 시뮬레이터 규칙·밸런스 버전. CSV와 동일.
// 시뮬레이터 고유 시험 밸런스. 기획서의 거점/명령/전선 규칙과 분리한다.
const NODE_MUL = Array.from({ length: 3 }, () => Object.fromEntries(DEFS.map(n => [n.id, 1])));
// v17: 기존 3전선/9거점으로 복원. 과도한 전체 증원 대신 두 핵심 거점 방어만 소폭 보정.
NODE_MUL[1].N2 = 1.05; // 제2전장 북부 요새, 기존 대비 방어력/주둔병 +5%
NODE_MUL[2].HQ = 1.18; // 제3전장 적 본진, 기존 대비 방어력/주둔병 +18%
const BAL = { ally_attack: 20, hero_attack: 30, fort_bonus_per_fort: 3, ally_production_interval: 5, enemy_production_interval: 9, ally_artillery_damage: 24, ally_artillery_hq_damage: 58, enemy_artillery_damage: 6, raider_attack: 8, stage3_challenge_wave_hp_multiplier: 1.15, ally_soldier_cap: 13, rest_delay_turns: 2, rest_heal_base: 5, rest_heal_bonus: 3 };
const BAL_FIELDS = [
    { scope: 'global', stage: 'all', key: 'ally_attack', desc: '회색갈기 지휘 부대 공격력', min: 4, max: 40, integer: true },
    { scope: 'global', stage: 'all', key: 'hero_attack', desc: '클리프 직접 전투 공격력', min: 10, max: 70, integer: true },
    { scope: 'global', stage: 'all', key: 'fort_bonus_per_fort', desc: '요새 1곳 당 해당 세력 공격 보너스', min: 0, max: 8, integer: true },
    { scope: 'global', stage: 'all', key: 'ally_production_interval', desc: '아군 일반 거점 일반병 생산 간격(턴)', min: 2, max: 14, integer: true },
    { scope: 'global', stage: 'all', key: 'enemy_production_interval', desc: '적 일반 거점 일반병 생산 간격(턴)', min: 3, max: 18, integer: true },
    { scope: 'global', stage: 'all', key: 'ally_artillery_damage', desc: '아군 병기 일반 거점 포격력', min: 0, max: 80, integer: true },
    { scope: 'global', stage: 'all', key: 'ally_artillery_hq_damage', desc: '아군 병기 적 본진 포격력', min: 0, max: 110, integer: true },
    { scope: 'global', stage: 'all', key: 'enemy_artillery_damage', desc: '적 병기 포격력', min: 0, max: 35, integer: true },
    { scope: 'global', stage: 'all', key: 'raider_attack', desc: '측면 침투병 실제 공격력 (제2·3전장)', min: 6, max: 20, integer: true },
    { scope: 'global', stage: 'all', key: 'stage3_challenge_wave_hp_multiplier', desc: '제3전장 도전 난이도 후반 적 증원 HP 배율', min: 1, max: 1.5 },
    { scope: 'global', stage: 'all', key: 'ally_soldier_cap', desc: '아군 기동 일반병 최대 수', min: 4, max: 25, integer: true },
    { scope: 'global', stage: 'all', key: 'rest_delay_turns', desc: '안전 지역에서 대기 후 회복 시작까지 필요한 턴 수', min: 1, max: 5, integer: true },
    { scope: 'global', stage: 'all', key: 'rest_heal_base', desc: '회색갈기 지휘 부대 휴식 시 턴당 기본 회복량', min: 0, max: 12, integer: true },
    { scope: 'global', stage: 'all', key: 'rest_heal_bonus', desc: '출격지/아군 일반 거점 휴식 추가 회복량', min: 0, max: 8, integer: true },
    ...[1, 2, 3].flatMap(stage => [
        { scope: 'stage', stage, key: 'scale', desc: '전장 적 거점/수비 병력 규모 배율', min: .70, max: 2.5 },
        { scope: 'stage', stage, key: 'enemyPeriod', desc: '표준 난이도 적 증원 간격(턴)', min: 3, max: 14, integer: true },
        { scope: 'stage', stage, key: 'enemyChallengePeriod', desc: '도전 난이도 적 증원 간격(턴)', min: 3, max: 14, integer: true },
        { scope: 'stage', stage, key: 'spawnLimit', desc: '적 기동 일반병 최대 수', min: 4, max: 24, integer: true },
        { scope: 'stage', stage, key: 'base', desc: '회색갈기 본진 HP', min: 60, max: 350, integer: true }
    ]),
    ...[1, 2, 3].flatMap(stage => DEFS.map(n => ({ scope: 'node', stage, key: n.id, desc: n.name + ' · 해당 전장 방어력/수비병 배율', min: .5, max: 2.0 })))
];
// HP100 고정: 회색갈기 지휘 3부대 및 클리프는 설정 CSV로 변경되지 않는다.
SCENARIOS[0].enemyChallengePeriod = SCENARIOS[0].enemyPeriod;
SCENARIOS[1].enemyChallengePeriod = 5;
SCENARIOS[2].enemyChallengePeriod = 5;
function getBalanceValue(f) { return f.scope === 'global' ? BAL[f.key] : f.scope === 'node' ? NODE_MUL[f.stage - 1][f.key] : SCENARIOS[f.stage - 1][f.key]; }
function balanceFingerprint() { return BAL_FIELDS.map(f => `${f.scope === 'global' ? 'G' : f.stage}${f.key}:${getBalanceValue(f)}`).join('|'); }
function configHash() { let h = 2166136261; for (const c of balanceFingerprint())
    h = Math.imul(h ^ c.charCodeAt(0), 16777619); return 'CFG-' + (h >>> 0).toString(16).padStart(8, '0'); }

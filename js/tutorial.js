/**
 * 회색갈기 대공세 — 05 · 사용법 / 인터랙티브 실습 / 테스트 인터페이스
 * 원본 시뮬레이션 규칙을 유지하며 소스만 기능별로 정리했습니다.
 */

'use strict';
// v24.11: 기능별 튜토리얼. 각 기능은 별도 선택·복습 가능, 전투 규칙은 변경하지 않습니다.
let tutorialOpen = true, lessonSelected = '', practiceStep = -1, practiceLesson = '', practiceUnit = '', practiceTarget = '';
let practiceExpectedSession = '', practiceFeedback = '', practiceAwait = false, practiceHeroCount = 0;
let tutorialReturnFocus = null, practiceCurrentSteps = [];
const lessonMeta = {
    basic: { tag: '01 · 부대 지휘', title: '부대 지휘', summary: '거점 지정 → 경로 등록 → 진격 → 턴 진행', items: [
            ['부대 선택', '지휘 패널에서 부대 선택'],
            ['경로 지정', '지도에서 목적지 선택 후 [경로 선택]'],
            ['진격', '[진격] 선택 후 [1턴 진행]']
        ] },
    cliff: { tag: '02 · 클리프', title: '클리프', summary: '거점 이동 후 직접 공격. 부대와 별도로 조작.', items: [
            ['목적지', '지도에서 공격할 거점 선택'],
            ['이동', '클리프 [이동] → [1턴 진행]. 거리에 따라 여러 턴 소요'],
            ['공격', '목적지 도착 후 클리프 [공격]']
        ] },
    rush: { tag: '03 · 우선이동', title: '우선이동', summary: '공격하지 않고 이동. 이동 중 피격 가능.', items: [
            ['경로 등록', '부대·목적지 선택 후 [경로 선택]'],
            ['명령', '[우선이동] 선택'],
            ['실행', '[1턴 진행]']
        ] },
    rules: { tag: '04 · 전장 규칙', title: '전장 규칙', summary: '거점 효과, 승리 조건, 자동 회복, 기록', items: [
            ['거점', '일반: 병력 생산 · 요새: 소유 세력 공격력 증가 · 병기: 포격 지원'],
            ['전선 개방', '직전 전선 거점 1곳 이상 점령 시 다음 전선 진입 가능'],
            ['승리·패배', '제3전선 3거점 점령 후 적 본진 점령 시 승리 · 아군 본진 HP 0 시 패배'],
            ['자동 회복', '안전한 아군 출격지·일반 거점에서 2턴 대기 후 +8 HP/턴, 그 외 아군 거점 +5 HP/턴. 이동·교전·적 접근 시 중단'],
            ['측면 침투·통행 제한', '제2·3전장: 적 침투병이 출격지 공격. 붉은 경보 확인. 차단된 상하 통로는 이용 불가, 대각 우회 가능'],
            ['CSV', '핵심 성과: 승패·손실 · 주요 전황: 사건 발생 턴 · 핵심 설정: 밸런스 수치. 자세한 항목은 [CSV 항목 설명] 참고']
        ] }
};
function renderLessonSelection() {
    $('lessonMenu').hidden = !!lessonSelected;
    $('lessonInfo').hidden = !lessonSelected;
    if (!lessonSelected)
        return;
    const meta = lessonMeta[lessonSelected];
    $('lessonInfoTag').textContent = meta.tag;
    $('lessonInfoTitle').textContent = meta.title;
    $('lessonInfoText').textContent = meta.summary;
    $('lessonInfoBody').innerHTML = '';
    for (const [title, detail] of meta.items) {
        const item = document.createElement('div');
        item.className = 'lesson-detail-item';
        const strong = document.createElement('strong');
        strong.textContent = title;
        const span = document.createElement('span');
        span.textContent = detail;
        item.append(strong, span);
        $('lessonInfoBody').append(item);
    }
    $('lessonInfoBody').className = 'lesson-detail-list';
    $('lessonLaunch').hidden = lessonSelected === 'rules';
    $('lessonLaunch').textContent = '실습 시작';
}
function practiceTargetElement() {
    if (practiceStep < 0 || practiceStep >= practiceCurrentSteps.length)
        return null;
    const selector = practiceCurrentSteps[practiceStep].target();
    return selector ? document.querySelector(selector) : null;
}
function locatePracticeTarget(scroll = true) {
    document.querySelectorAll('.practice-spotlight').forEach(el => el.classList.remove('practice-spotlight'));
    const target = practiceTargetElement();
    if (!target)
        return;
    target.classList.add('practice-spotlight');
    if (!scroll)
        return;
    target.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
    requestAnimationFrame(() => {
        if (practiceStep < 0 || target !== practiceTargetElement())
            return;
        const rect = target.getBoundingClientRect(), coach = $('practiceCoach').getBoundingClientRect();
        if (rect.top < 20)
            window.scrollBy({ top: rect.top - 70, behavior: 'instant' });
        else if (rect.bottom > coach.top - 16 && rect.left < coach.right && rect.right > coach.left) {
            window.scrollBy({ top: rect.bottom - coach.top + 42, behavior: 'instant' });
        }
    });
}
function renderPractice(scroll = true) {
    const box = $('practiceCoach');
    box.hidden = practiceStep < 0;
    if (practiceStep < 0) {
        document.querySelectorAll('.practice-spotlight').forEach(el => el.classList.remove('practice-spotlight'));
        return;
    }
    const step = practiceCurrentSteps[practiceStep], done = step.key === 'done';
    $('practiceCount').textContent = done ? '실습 완료' : `${practiceStep + 1} / ${practiceCurrentSteps.length - 1}`;
    box.querySelector('.practice-subtitle').textContent = lessonMeta[practiceLesson].tag;
    $('practiceTitle').textContent = step.title;
    $('practiceDetail').textContent = step.detail();
    $('practiceHint').textContent = practiceFeedback || (step.hint || '');
    $('practiceTrack').innerHTML = Array.from({ length: practiceCurrentSteps.length - 1 }, (_, i) => `<i class="${i < practiceStep ? 'done' : i === practiceStep ? 'current' : ''}"></i>`).join('');
    $('practiceFind').hidden = done;
    $('practiceNext').hidden = !done;
    $('practiceNext').textContent = practiceLesson === 'basic' ? '다음 · 클리프' : practiceLesson === 'cliff' ? '다음 · 우선이동' : '다음 · 전장 규칙';
    $('practiceExit').textContent = done ? '전투 계속' : '실습 종료';
    locatePracticeTarget(scroll);
}
function stopPractice() { practiceStep = -1; practiceFeedback = ''; practiceAwait = false; practiceLesson = ''; renderPractice(false); }
const unitRouteSteps = mode => [
    { key: 'army', title: '부대 선택', detail: () => `지휘 패널 · 회색갈기 ${practiceUnit.slice(1)}부대 선택`, hint: '부대별로 별도 명령을 지정합니다.', target: () => `.army-card[data-unitid="${practiceUnit}"]` },
    { key: 'node', title: '목적지 선택', detail: () => `전술 지도 · ${nId(practiceTarget)?.name || '첫 거점'} 선택`, hint: '선택한 거점이 이동 목표가 됩니다.', target: () => `.fort-node[data-nodeid="${practiceTarget}"]` },
    { key: 'waypoint', title: '경로 등록', detail: () => `[경로 선택]`, hint: '목적지 선택 후 경로 등록이 필요합니다.', target: () => '#waypoint' },
    { key: mode, title: mode === 'advance' ? '진격' : '우선이동', detail: () => mode === 'advance' ? '[진격] 선택' : '[우선이동] 선택', hint: mode === 'advance' ? '진격: 이동 중 교전' : '우선이동: 교전 없이 이동. 피격 가능', target: () => mode === 'advance' ? '#advance' : '#rush' },
    { key: 'tick', title: '턴 진행', detail: () => `[1턴 진행]`, hint: '등록된 명령을 1턴 실행합니다.', target: () => '#tick' },
    { key: 'done', title: mode === 'advance' ? '진격 실습 완료' : '우선이동 실습 완료', detail: () => mode === 'advance' ? '부대 이동 명령 적용 완료' : '우선이동 명령 적용 완료', hint: '다른 항목 선택 또는 전투 계속 진행', target: () => null }
];
const cliffSteps = () => [
    { key: 'node', title: '목적지 선택', detail: () => `전술 지도 · ${nId(practiceTarget)?.name || '첫 거점'} 선택`, hint: '클리프는 별도 이동·공격 명령을 사용합니다.', target: () => `.fort-node[data-nodeid="${practiceTarget}"]` },
    { key: 'heroMove', title: '클리프 이동', detail: () => `클리프 · [이동] 선택`, hint: '이동 실행에는 턴 진행이 필요합니다.', target: () => '#heroMove' },
    { key: 'tick', title: '이동 실행', detail: () => `[1턴 진행]`, hint: '목적지까지 여러 턴이 걸릴 수 있습니다.', target: () => '#tick' },
    { key: 'heroAct', title: '직접 공격', detail: () => `클리프 · [공격] 선택`, hint: '공격 실행 시 턴이 함께 진행됩니다.', target: () => '#heroAct' },
    { key: 'done', title: '클리프 실습 완료', detail: () => `이동·공격 명령 적용 완료`, hint: '클리프는 한 턴에 한 번 직접 공격 가능', target: () => null }
];
function pickPracticeLeader() { return S.units.find(x => x.side === 'ally' && x.kind === 'leader' && x.cool === 0 && x.path.length === 0 && x.cmd === 'hold'); }
function pickUnitTarget(u) {
    const ids = ['N1', 'C1', 'S1'];
    return [ids[u.home], ...ids.filter(id => id !== ids[u.home])].map(nId)
        .find(n => n && !eq(u, n) && (unlocked(n.c) || n.owner === 'ally') && routeFind(u, n, 'ally') !== null);
}
function pickCliffTarget() {
    const h = S.hero;
    const candidates = S.nodes.filter(n => n.c === 1 && n.owner === 'enemy' && unlocked(n.c) && !eq(n, h))
        .sort((a, b) => Math.abs(a.r - h.r) + Math.abs(a.c - h.c) - Math.abs(b.r - h.r) - Math.abs(b.c - h.c));
    return candidates.find(n => routeFind(h, n, 'ally')?.length > 0) || null;
}
function beginLesson(lesson) {
    if (lesson === 'rules') {
        lessonSelected = 'rules';
        tutorialOpen = true;
        tutorialRender();
        renderLessonSelection();
        return;
    }
    if (isOver()) {
        if (!window.confirm('전투 종료 상태입니다. 실습을 위해 전장을 재시작할까요?'))
            return;
        setUp(S.stage, S.difficulty, false);
    }
    if (lesson === 'cliff') {
        if (S.hero.cool > 0) {
            window.alert('클리프 재출격 대기 중 · 대기 후 실습 또는 전장 재시작');
            return;
        }
        let target = pickCliffTarget();
        if (!target) {
            if (!window.confirm('클리프 실습 대상이 없습니다. 전장을 재시작할까요?'))
                return;
            setUp(S.stage, S.difficulty, false);
            target = pickCliffTarget();
        }
        if (!target) {
            window.alert('실습 가능 거점 없음');
            return;
        }
        practiceTarget = target.id;
        practiceUnit = '';
        practiceCurrentSteps = cliffSteps();
        practiceHeroCount = S.heroCount;
    }
    else {
        let u = pickPracticeLeader();
        if (!u) {
            if (!window.confirm('명령 대기 부대 없음 · 전장 재시작 후 실습할까요?'))
                return;
            setUp(S.stage, S.difficulty, false);
            u = pickPracticeLeader();
        }
        if (!u) {
            window.alert('실습 가능 부대 없음');
            return;
        }
        practiceUnit = u.id;
        const target = pickUnitTarget(u);
        if (!target) {
            window.alert('실습 가능 거점 없음');
            return;
        }
        practiceTarget = target.id;
        practiceCurrentSteps = unitRouteSteps(lesson === 'rush' ? 'rush' : 'advance');
    }
    practiceLesson = lesson;
    practiceExpectedSession = S.sessionId;
    practiceStep = 0;
    practiceFeedback = '';
    practiceAwait = false;
    stopAuto();
    tutorialClose();
    renderPractice(true);
}
function onPracticeClick(e) {
    if (practiceStep < 0 || practiceStep >= practiceCurrentSteps.length - 1 || e.target.closest?.('#practiceCoach'))
        return;
    if (S.sessionId !== practiceExpectedSession) {
        stopPractice();
        return;
    }
    const step = practiceCurrentSteps[practiceStep], key = step.key, button = e.target.closest?.('button');
    if (!button)
        return;
    const valid = () => {
        if (key === 'army')
            return button.matches('.army-card') && button.dataset.unitid === practiceUnit;
        if (key === 'node')
            return button.matches('.fort-node') && button.dataset.nodeid === practiceTarget;
        return button.id === key;
    };
    if (practiceAwait) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
    }
    if (!valid()) {
        // 실습에서는 명령 실수를 막되 실습 종료 시 모든 조작이 복구됩니다.
        if (button.closest('#tutorialCard') || button.closest('#practiceCoach'))
            return;
        e.preventDefault();
        e.stopImmediatePropagation();
        practiceFeedback = '표시된 항목을 선택하세요.';
        renderPractice(false);
        return;
    }
    const old = practiceStep, oldTurn = S.turn, prevHeroCount = S.heroCount;
    practiceAwait = true;
    setTimeout(() => {
        practiceAwait = false;
        if (practiceStep !== old || S.sessionId !== practiceExpectedSession)
            return;
        const u = S.units.find(x => x.id === practiceUnit), n = nId(practiceTarget);
        const checks = {
            army: () => S.selectedUnit === practiceUnit,
            node: () => S.selectedId === practiceTarget,
            waypoint: () => u?.path.some(p => eq(p, n)),
            advance: () => u?.cmd === 'advance',
            rush: () => u?.cmd === 'rush',
            heroMove: () => S.hero.target && eq(S.hero.target, n),
            heroAct: () => S.heroCount > prevHeroCount,
            tick: () => S.turn > oldTurn
        };
        if (checks[key]?.()) {
            if (practiceLesson === 'cliff' && key === 'tick' && !eq(S.hero, n)) {
                practiceFeedback = '클리프 이동 중 · [1턴 진행] 반복';
                renderPractice(true);
                return;
            }
            practiceStep++;
            practiceFeedback = '';
            renderPractice(true);
        }
        else {
            practiceFeedback = '명령 미적용 · 표시된 항목 재선택';
            renderPractice(false);
        }
    }, 0);
}
document.addEventListener('click', onPracticeClick, true);
$('practiceFind').onclick = () => locatePracticeTarget(true);
$('practiceNext').onclick = () => {
    const next = practiceLesson === 'basic' ? 'cliff' : practiceLesson === 'cliff' ? 'rush' : 'rules';
    stopPractice();
    if (next === 'rules') {
        lessonSelected = 'rules';
        tutorialShow();
        return;
    }
    lessonSelected = next;
    tutorialShow();
};
$('practiceExit').onclick = stopPractice;
function tutorialRender() {
    $('tutorialCard').hidden = !tutorialOpen;
    $('tutorialBackdrop').hidden = !tutorialOpen;
    $('openTutorial').setAttribute('aria-expanded', String(tutorialOpen));
    if (tutorialOpen) {
        renderLessonSelection();
        $('tutorialClose').focus({ preventScroll: true });
    }
    else
        (tutorialReturnFocus?.isConnected ? tutorialReturnFocus : $('openTutorial')).focus({ preventScroll: true });
}
function tutorialClose() { tutorialOpen = false; tutorialRender(); }
function tutorialShow() { stopPractice(); stopAuto(); tutorialReturnFocus = document.activeElement; tutorialOpen = true; tutorialRender(); }
$('openTutorial').onclick = () => { lessonSelected = ''; tutorialShow(); };
$('tutorialClose').onclick = tutorialClose;
$('tutorialSkip').onclick = tutorialClose;
$('tutorialBackdrop').onclick = tutorialClose;
$('lessonBack').onclick = () => { lessonSelected = ''; renderLessonSelection(); };
$('lessonLaunch').onclick = () => beginLesson(lessonSelected);
document.querySelectorAll('.lesson-card').forEach(el => el.onclick = () => { lessonSelected = el.dataset.lesson; renderLessonSelection(); });
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (tutorialOpen) {
            e.preventDefault();
            tutorialClose();
        }
        else if (practiceStep >= 0) {
            e.preventDefault();
            stopPractice();
        }
    }
    if (!tutorialOpen || e.key !== 'Tab')
        return;
    const buttons = [$('tutorialClose'), ...Array.from(document.querySelectorAll('#tutorialCard button')).filter(b => b.offsetParent !== null && b !== $('tutorialClose'))];
    const idx = buttons.indexOf(document.activeElement);
    if (e.shiftKey && idx <= 0) {
        e.preventDefault();
        buttons[buttons.length - 1].focus();
    }
    else if (!e.shiftKey && idx === buttons.length - 1) {
        e.preventDefault();
        buttons[0].focus();
    }
});
window.__tutorialReady = true;
tutorialRender();
window.__practiceState = () => ({ step: practiceStep, lesson: practiceLesson, action: practiceStep < 0 ? 'off' : practiceCurrentSteps[practiceStep]?.key, unit: practiceUnit, target: practiceTarget, feedback: practiceFeedback });
window.__grayDebug = () => JSON.parse(JSON.stringify(S));
// 공개 테스트 인터페이스를 통한 전투 진행은 실제 사람의 수동 플레이로 표기하지 않는다.
function markAutomatedSource() { S.recordSource = 'automated_policy'; for (const x of [...S.turnFrames, ...S.nodeFrames, ...S.unitFrames])
    x.source = 'automated_policy'; }
window.__grayTest = { exportKeyTurns, importantTurns, majorBalanceFields, exportBalanceHistory, exportBalance, balanceSummaryRows, balanceNodeRows, balanceUnitRows, exportBalanceConfig, importBalanceConfig, configHash,
    tick: (...args) => { markAutomatedSource(); return tick(...args); }, command: (...args) => { markAutomatedSource(); return command(...args); },
    setSelected: (...args) => { markAutomatedSource(); return setSelected(...args); }, selectArmy: (...args) => { markAutomatedSource(); return selectArmy(...args); },
    heroMove: (...args) => { markAutomatedSource(); return heroMove(...args); }, heroAct: (...args) => { markAutomatedSource(); return heroAct(...args); },
    setUp: (...args) => { setUp(...args); markAutomatedSource(); }, addWaypoint: (...args) => { markAutomatedSource(); return addWaypoint(...args); },
    clearWaypoint: (...args) => { markAutomatedSource(); return clearWaypoint(...args); }, routeFind, roadAllows, enemyMove, autoSoldierMove, downloadCsv,
    markAutomated: markAutomatedSource };

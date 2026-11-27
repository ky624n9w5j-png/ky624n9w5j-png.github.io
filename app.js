(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = 'mina-investment-desk-v1';
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
  const money = (n) => '¥' + num(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pctText = (n) => (num(n) > 0 ? '+' : '') + num(n).toFixed(2) + '%';
  const pnlClass = (n) => (num(n) > 0 ? 'up' : num(n) < 0 ? 'down' : 'flat');
  const todayStr = () => new Date().toISOString().slice(0, 10);

  const QUOTES = [
    '计划你的交易，交易你的计划。',
    '先放下成本价，问自己：它现在还该不该持有。',
    '触发之后禁止改规则，规则只能在触发前写完。',
    '到价不等于要卖，但回落必须警惕兑现。',
    '持仓超过十五只，跟踪就会失效。',
    '没有失效条件的买入逻辑，都是自我说服。'
  ];

  // 两类账户的纪律模板：切换投资类型时套用，之后仍可逐只修改。
  const HORIZON_RULES = {
    '长期': { stopLossPct: 15, takeProfitPct: 30, trailingStartPct: 10, trailingDrawdownPct: 15, timeStopDays: 180 },
    '短期': { stopLossPct: 5, takeProfitPct: 12, trailingStartPct: 5, trailingDrawdownPct: 8, timeStopDays: 10 }
  };

  const SCHEMAS = {
    holding: {
      title: '持仓', groups: [
        { name: '基本信息', fields: [
          { k: 'name', l: '名称', t: 'text', req: true },
          { k: 'code', l: '代码', t: 'text' },
          { k: 'horizon', l: '投资类型', t: 'select', o: ['长期', '短期'], def: '长期' },
          { k: 'type', l: '标的类型', t: 'select', o: ['股票', '基金', 'ETF'] },
          { k: 'sector', l: '行业 / 板块', t: 'text', def: '未分类' },
          { k: 'style', l: '风格', t: 'select', o: ['成长', '价值', '周期', '防守', '均衡'] },
          { k: 'layer', l: '持仓分层', t: 'select', o: ['核心仓', '稳定器', '观察仓', '问题仓'], def: '观察仓' }
        ]},
        { name: '仓位与成本', fields: [
          { k: 'shares', l: '份额 / 股数', t: 'number' },
          { k: 'cost', l: '成本价', t: 'number' },
          { k: 'price', l: '现价（手动更新）', t: 'number' },
          { k: 'peak', l: '持有期最高价', t: 'number' },
          { k: 'buyDate', l: '买入日期', t: 'date' }
        ]},
        { name: '卖出纪律', fields: [
          { k: 'targetPrice', l: '目标价', t: 'number' },
          { k: 'stopLossPct', l: '成本止损 %', t: 'number', def: HORIZON_RULES['长期'].stopLossPct },
          { k: 'takeProfitPct', l: '成本止盈 %', t: 'number', def: HORIZON_RULES['长期'].takeProfitPct },
          { k: 'trailingStartPct', l: '追踪启动浮盈 %', t: 'number', def: HORIZON_RULES['长期'].trailingStartPct },
          { k: 'trailingDrawdownPct', l: '追踪回撤 %', t: 'number', def: HORIZON_RULES['长期'].trailingDrawdownPct },
          { k: 'timeStopDays', l: '时间止损天数', t: 'number', def: HORIZON_RULES['长期'].timeStopDays },
          { k: 'thesisBroken', l: '逻辑是否已破坏', t: 'select', o: ['否', '是'], def: '否' }
        ]},
        { name: '持有逻辑', fields: [
          { k: 'thesis', l: '买入逻辑 / 当前看法', t: 'textarea', full: true },
          { k: 'invalidation', l: '失效条件（写客观标准，不写「感觉走弱」）', t: 'textarea', full: true }
        ]}
      ]
    },
    idea: {
      title: '候选标的', groups: [
        { name: '标的信息', fields: [
          { k: 'name', l: '名称', t: 'text', req: true },
          { k: 'code', l: '代码', t: 'text' },
          { k: 'horizon', l: '投资类型', t: 'select', o: ['长期', '短期'], def: '长期' },
          { k: 'type', l: '标的类型', t: 'select', o: ['股票', '基金', 'ETF'] },
          { k: 'status', l: '状态', t: 'select', o: ['观察中', '待买入', '已排除'], def: '观察中' },
          { k: 'priority', l: '优先级', t: 'select', o: ['高', '中', '低'], def: '中' },
          { k: 'targetBuy', l: '目标买入价', t: 'number' }
        ]},
        { name: '研究要点', fields: [
          { k: 'catalyst', l: '当前催化（没有就写「无强催化」）', t: 'text', full: true },
          { k: 'thesis', l: '核心逻辑 / 预期差', t: 'textarea', full: true },
          { k: 'invalidation', l: '证伪条件', t: 'textarea', full: true },
          { k: 'nextAction', l: '下一步动作', t: 'text', full: true }
        ]}
      ]
    },
    news: {
      title: '资讯研究', groups: [
        { name: '事实层', fields: [
          { k: 'date', l: '日期', t: 'date', def: todayStr() },
          { k: 'title', l: '事件标题', t: 'text', req: true, full: true },
          { k: 'source', l: '来源', t: 'text' },
          { k: 'category', l: '类别', t: 'select', o: ['宏观', '政策', '行业', '公司', '公告', '海外'] },
          { k: 'impact', l: '影响方向', t: 'select', o: ['中性', '利多', '利空'] },
          { k: 'related', l: '关联标的 / 持仓代码', t: 'text', full: true }
        ]},
        { name: '解读层 → 操作层', fields: [
          { k: 'takeaway', l: '为什么重要 / 对持仓的含义', t: 'textarea', full: true },
          { k: 'action', l: '因此怎么做（无动作也要写明）', t: 'textarea', full: true }
        ]}
      ]
    },
    decision: {
      title: '交易决策', groups: [
        { name: '执行记录', fields: [
          { k: 'date', l: '日期', t: 'date', def: todayStr() },
          { k: 'code', l: '代码', t: 'text' },
          { k: 'name', l: '名称', t: 'text', req: true },
          { k: 'action', l: '动作', t: 'select', o: ['买入', '加仓', '减仓', '卖出'] },
          { k: 'price', l: '成交价', t: 'number' },
          { k: 'shares', l: '数量', t: 'number' }
        ]},
        { name: '计划与复盘', fields: [
          { k: 'reason', l: '原始理由（触发后不得重写）', t: 'textarea', full: true },
          { k: 'plan', l: '失效条件与退出计划', t: 'textarea', full: true },
          { k: 'reviewDate', l: '复盘日期', t: 'date' },
          { k: 'outcome', l: '验证结果', t: 'select', o: ['待验证', '符合预期', '不符预期'], def: '待验证' },
          { k: 'realizedPnl', l: '已实现盈亏（元，亏损填负数）', t: 'number' },
          { k: 'lesson', l: '复盘结论', t: 'textarea', full: true }
        ]}
      ]
    },
    review: {
      title: '每日复盘', groups: [
        { name: '市场与执行', fields: [
          { k: 'date', l: '日期', t: 'date', def: todayStr() },
          { k: 'mood', l: '市场情绪', t: 'select', o: ['亢奋', '偏暖', '中性', '偏冷', '恐慌'], def: '中性' },
          { k: 'indexView', l: '指数与成交一句话概括', t: 'text', full: true },
          { k: 'whatIDid', l: '我今天做了什么 / 有没有偏离计划', t: 'textarea', full: true },
          { k: 'lesson', l: '今天最大的教训', t: 'textarea', full: true },
          { k: 'tomorrow', l: '明日观察重点', t: 'textarea', full: true }
        ]}
      ]
    },
    learning: {
      title: '学习主题', groups: [
        { name: '主题', fields: [
          { k: 'topic', l: '主题名称', t: 'text', req: true, full: true },
          { k: 'category', l: '分类', t: 'select', o: ['基础', '基金', '财报', '估值', '风控', '技术分析', '交易心理', '宏观'] },
          { k: 'resource', l: '学习资料', t: 'text', full: true },
          { k: 'progress', l: '进度 %', t: 'number', def: 0 },
          { k: 'status', l: '状态', t: 'select', o: ['未开始', '学习中', '已完成'], def: '未开始' },
          { k: 'note', l: '关键笔记 / 尚存疑问', t: 'textarea', full: true }
        ]}
      ]
    },
    account: {
      title: '账户设置', groups: [
        { name: '资金与风险预算', fields: [
          { k: 'total', l: '投入总资金', t: 'number' },
          { k: 'cash', l: '当前可用现金', t: 'number' },
          { k: 'targetMax', l: '目标仓位上限 %', t: 'number', def: 70 },
          { k: 'singleRisk', l: '单笔最大风险 %（占总资金）', t: 'number', def: 2 }
        ]}
      ]
    },
    cashflow: {
      title: '资金流水', groups: [
        { name: '流水记录', fields: [
          { k: 'date', l: '日期', t: 'date', def: todayStr() },
          { k: 'type', l: '类型', t: 'select', o: ['入金', '出金', '分红'], def: '入金' },
          { k: 'amount', l: '金额', t: 'number' },
          { k: 'note', l: '备注', t: 'text', full: true }
        ]}
      ]
    },
    snapshot: {
      title: '净值快照', groups: [
        { name: '权益记录', fields: [
          { k: 'date', l: '日期', t: 'date', def: todayStr() },
          { k: 'equity', l: '账户总权益（现金 + 持仓市值）', t: 'number' },
          { k: 'note', l: '备注', t: 'text', full: true }
        ]}
      ]
    },
    event: {
      title: '事件', groups: [
        { name: '事件信息', fields: [
          { k: 'date', l: '日期', t: 'date', def: todayStr() },
          { k: 'title', l: '事件标题', t: 'text', req: true, full: true },
          { k: 'type', l: '类型', t: 'select', o: ['财报', '宏观', '分红', '解禁', '计划', '其他'], def: '财报' },
          { k: 'related', l: '关联标的 / 代码', t: 'text' },
          { k: 'importance', l: '重要性', t: 'select', o: ['高', '中', '低'], def: '中' },
          { k: 'note', l: '预案 / 备注', t: 'textarea', full: true }
        ]}
      ]
    },
    checklist: {
      title: '盘前检查', groups: [
        { name: '标的与计划', fields: [
          { k: 'date', l: '日期', t: 'date', def: todayStr() },
          { k: 'name', l: '标的名称', t: 'text', req: true },
          { k: 'code', l: '代码', t: 'text' },
          { k: 'horizon', l: '投资类型', t: 'select', o: ['长期', '短期'], def: '长期' },
          { k: 'planPrice', l: '计划买入价', t: 'number' },
          { k: 'planShares', l: '计划数量', t: 'number' }
        ]},
        { name: '六项确认（是/否）', fields: [
          { k: 'c_thesis', l: '1. 能用三句话写清买入逻辑？', t: 'select', o: ['否', '是'], def: '否' },
          { k: 'c_invalid', l: '2. 写明了客观失效条件？', t: 'select', o: ['否', '是'], def: '否' },
          { k: 'c_position', l: '3. 仓位在单票上限之内？', t: 'select', o: ['否', '是'], def: '否' },
          { k: 'c_risk', l: '4. 止损金额 ≤ 单笔风险预算？', t: 'select', o: ['否', '是'], def: '否' },
          { k: 'c_emotion', l: '5. 不是因为 FOMO / 追涨 / 报复性交易？', t: 'select', o: ['否', '是'], def: '否' },
          { k: 'c_exit', l: '6. 已想清楚什么情况下卖出？', t: 'select', o: ['否', '是'], def: '否' }
        ]},
        { name: '结论', fields: [
          { k: 'verdict', l: '结论', t: 'select', o: ['待确认', '通过', '否决'], def: '待确认' },
          { k: 'thesis', l: '买入逻辑（三句话）', t: 'textarea', full: true },
          { k: 'invalidation', l: '客观失效条件', t: 'textarea', full: true },
          { k: 'maxLoss', l: '可承受最大亏损金额', t: 'number' }
        ]}
      ]
    }
  };

  const COLLECTIONS = { holding: 'holdings', idea: 'ideas', news: 'news', decision: 'decisions', review: 'reviews', learning: 'learning', account: 'accounts', cashflow: 'cashflows', snapshot: 'snapshots', event: 'events', checklist: 'checklists' };

  const EDIT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
  const DEL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>';
  const CHECK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>';
  const PALETTE = ['#5b8cff', '#7aa2ff', '#37b98d', '#e0b24a', '#ee726e', '#6f9cff', '#9ab4ff'];

  function demoState() {
    const t = todayStr();
    return {
      demo: true,
      todos: [
        { id: uid(), text: '建立自己的持仓清单与卖出规则', priority: 'high', done: false },
        { id: uid(), text: '每天收盘后写三分钟复盘', priority: 'mid', done: false },
        { id: uid(), text: '梳理现有基金的分类与费率', priority: 'low', done: true }
      ],
      keytasks: [
        { id: uid(), name: '搭建个人投资工作台', progress: 80 },
        { id: uid(), name: '系统学习理财基础与估值', progress: 20 }
      ],
      notes: [{ id: uid(), text: '先记录，再判断。所有买卖决定都要留下当时的理由。', time: new Date().toISOString() }],
      holdings: [
        { id: uid(), name: '示例·短期交易', code: 'DEMO001', horizon: '短期', type: '股票', sector: '科技', style: '成长', layer: '观察仓', shares: 1000, cost: 25, price: 22.6, peak: 25, buyDate: t, targetPrice: 30, stopLossPct: 5, takeProfitPct: 12, trailingStartPct: 5, trailingDrawdownPct: 8, timeStopDays: 10, thesisBroken: '否', thesis: '演示数据：短线仓位，看价格与验证速度。请替换为真实持仓。', invalidation: '演示数据：跌破关键位或走势不符预期。' },
        { id: uid(), name: '示例·长期配置', code: 'DEMO002', horizon: '长期', type: '基金', sector: '宽基', style: '均衡', layer: '稳定器', shares: 5000, cost: 1.85, price: 2.02, peak: 2.05, buyDate: t, targetPrice: 2.4, stopLossPct: 15, takeProfitPct: 30, trailingStartPct: 10, trailingDrawdownPct: 15, timeStopDays: 180, thesisBroken: '否', thesis: '演示数据：长期仓位，看逻辑与资本回报。', invalidation: '演示数据：指数逻辑改变。' }
      ],
      ideas: [{ id: uid(), name: '示例·待研究标的', code: 'DEMO003', horizon: '长期', type: '股票', status: '观察中', priority: '中', targetBuy: 0, catalyst: '演示数据：无强催化', thesis: '演示数据：先观察，不急于研究。', invalidation: '演示数据：逻辑证伪。', nextAction: '替换为真实标的' }],
      news: [{ id: uid(), date: t, title: '示例资讯：某行业政策发布', source: '演示数据', category: '政策', impact: '中性', related: 'DEMO001', takeaway: '演示数据：事实 → 解读 → 映射 → 操作。', action: '演示数据：暂无动作。' }],
      decisions: [],
      reviews: [],
      learning: [
        { id: uid(), topic: '基金分类与费率结构', category: '基金', resource: '', progress: 40, status: '学习中', note: '演示数据：注意管理费与托管费的区别。' },
        { id: uid(), topic: '估值基础：PE / PB 怎么用', category: '估值', resource: '', progress: 0, status: '未开始', note: '' }
      ],
      accounts: [Object.assign(defaultAccount(), { total: 200000, cash: 60000, updatedAt: t })],
      cashflows: [{ id: uid(), date: t, type: '入金', amount: 200000, note: '演示数据：初始资金' }],
      snapshots: [
        { id: uid(), date: t, equity: 200000, note: '演示数据：起始净值' },
        { id: uid(), date: t, equity: 202480, note: '演示数据：示例权益' }
      ],
      events: [
        { id: uid(), date: t, title: '演示事件：查看持仓财报披露日', type: '财报', related: 'DEMO001', importance: '中', note: '演示数据：替换为真实日期', done: false }
      ],
      checklists: [],
      syncLedger: []
    };
  }

  const ALL_KEYS = ['todos', 'keytasks', 'notes', 'holdings', 'ideas', 'news', 'decisions', 'reviews', 'learning', 'accounts', 'cashflows', 'snapshots', 'events', 'checklists', 'syncLedger'];

  function defaultAccount() {
    return { id: 'account-main', total: 0, cash: 0, targetMax: 70, singleRisk: 2, updatedAt: '' };
  }

  function emptyFinance() {
    return { holdings: [], ideas: [], news: [], decisions: [], reviews: [], learning: [], accounts: [defaultAccount()], cashflows: [], snapshots: [], events: [], checklists: [], syncLedger: [] };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        const out = { demo: !!p.demo };
        ALL_KEYS.forEach((k) => { out[k] = Array.isArray(p[k]) ? p[k] : []; });
        if (!out.accounts.length) out.accounts = [defaultAccount()];
        else out.accounts[0] = Object.assign(defaultAccount(), out.accounts[0]);
        out.holdings.forEach((h) => { if (!h.horizon) h.horizon = '长期'; });
        out.ideas.forEach((i) => { if (!i.horizon) i.horizon = '长期'; });
        return out;
      }
    } catch (e) { /* ignore */ }
    return demoState();
  }

  let state = load();
  let currentFilter = 'all';
  let holdingFilter = '全部';
  let ideaFilter = '全部';
  let researchTab = 'news';
  let eventFilter = '全部';

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
  }

  /* ---------- Header ---------- */
  function tickClock() {
    const now = new Date();
    $('clock').textContent = now.toLocaleTimeString('zh-CN', { hour12: false });
    const wd = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    $('dateText').textContent = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日 · ${wd[now.getDay()]}`;
    const h = now.getHours();
    const g = h < 6 ? '夜深了' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : h < 22 ? '晚上好' : '夜深了';
    $('greeting').textContent = `${g}，Mina`;
    const t = h * 60 + now.getMinutes();
    let s = '休市';
    if (now.getDay() >= 1 && now.getDay() <= 5) {
      if (t < 570) s = 'A股开盘前';
      else if (t < 690) s = 'A股盘中 · 早盘';
      else if (t < 780) s = '午间休市';
      else if (t < 900) s = 'A股盘中 · 午盘';
      else s = 'A股已收盘';
    }
    $('marketStatus').textContent = s;
  }

  /* ---------- Computations ---------- */
  function positionOf(h) {
    const value = num(h.shares) * num(h.price);
    const cost = num(h.shares) * num(h.cost);
    const pnl = value - cost;
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
    return { value, cost, pnl, pnlPct };
  }

  function portfolioStats() {
    const positions = state.holdings.map((h) => ({ h, p: positionOf(h) }));
    const value = positions.reduce((s, x) => s + x.p.value, 0);
    const cost = positions.reduce((s, x) => s + x.p.cost, 0);
    const pnlPct = cost > 0 ? ((value - cost) / cost) * 100 : 0;
    const maxPos = positions.reduce((m, x) => Math.max(m, value > 0 ? (x.p.value / value) * 100 : 0), 0);
    const sectorMap = {};
    positions.forEach((x) => { const k = x.h.sector || '未分类'; sectorMap[k] = (sectorMap[k] || 0) + x.p.value; });
    const sectors = Object.entries(sectorMap).map(([name, v]) => ({ name, value: v, pct: value > 0 ? (v / value) * 100 : 0 })).sort((a, b) => b.value - a.value);
    const longValue = positions.filter((x) => (x.h.horizon || '长期') === '长期').reduce((s, x) => s + x.p.value, 0);
    const shortValue = value - longValue;
    const horizonSplit = {
      long: { value: longValue, pct: value > 0 ? (longValue / value) * 100 : 0, count: positions.filter((x) => (x.h.horizon || '长期') === '长期').length },
      short: { value: shortValue, pct: value > 0 ? (shortValue / value) * 100 : 0, count: positions.filter((x) => (x.h.horizon || '长期') === '短期').length }
    };
    return { positions, value, cost, pnl: value - cost, pnlPct, maxPos, sectors, horizonSplit };
  }

  function computeAlerts() {
    const out = [];
    const rank = { critical: 0, warning: 1, info: 2 };
    state.holdings.forEach((h) => {
      const p = positionOf(h);
      const name = h.name || '(未命名)';
      const horizon = h.horizon === '短期' ? '短期' : '长期';
      const suffix = horizon === '短期'
        ? ' 短线纪律：看价格与验证速度，5-10 个交易日未验证就退出。'
        : ' 长线纪律：回到逻辑与资本回报，不因单日波动做决定。';
      const push = (level, title, detail, action) => out.push({ level, title: `[${horizon}] ${title}`, detail, action: action + suffix, name, horizon });
      if (h.thesisBroken === '是') {
        push('critical', `${name} · 逻辑已破坏`, '你已手动标记原买入逻辑失效。', '触发后禁止重新评估持有理由——按事先写好的退出动作执行，先减半再观察。');
      }
      if (num(h.stopLossPct) > 0 && p.pnlPct <= -num(h.stopLossPct)) {
        push('critical', `${name} · 触发成本止损`, `当前浮亏 ${pctText(p.pnlPct)}，已达到设定的 -${num(h.stopLossPct)}% 止损线。`, '先减半再观察；若一次性退出，必须写出理由。成本价不是市场关心的变量。');
      }
      if (num(h.takeProfitPct) > 0 && p.pnlPct >= num(h.takeProfitPct)) {
        push('warning', `${name} · 达到止盈阈值`, `当前浮盈 ${pctText(p.pnlPct)}，达到设定的 +${num(h.takeProfitPct)}%。`, '判断预期兑现度与是否有新催化；可先卖 1/3 锁利，剩余跟趋势。强势穿越则上调目标。');
      }
      if (num(h.targetPrice) > 0 && num(h.price) >= num(h.targetPrice)) {
        push('warning', `${name} · 触及目标价`, `现价 ${money(h.price)} ≥ 目标价 ${money(h.targetPrice)}。`, '到价不等于必须卖。触价即回落要警惕兑现风险；强势穿越应重估上限。');
      }
      const start = num(h.trailingStartPct), dd = num(h.trailingDrawdownPct);
      if (start > 0 && dd > 0 && num(h.cost) > 0) {
        const peakPrice = Math.max(num(h.peak) || 0, num(h.price));
        const peakPct = ((peakPrice - num(h.cost)) / num(h.cost)) * 100;
        if (p.pnlPct >= start && peakPct - p.pnlPct >= dd) {
          push('warning', `${name} · 追踪止损触发`, `最高浮盈 ${pctText(peakPct)} 已回撤至 ${pctText(p.pnlPct)}，回撤 ${(peakPct - p.pnlPct).toFixed(1)} 个百分点。`, '按追踪纪律退出或减仓，不要等「再涨回去」。');
        }
      }
      if (h.buyDate && num(h.timeStopDays) > 0) {
        const days = Math.floor((Date.now() - new Date(h.buyDate).getTime()) / 86400000);
        if (days >= num(h.timeStopDays) && Math.abs(p.pnlPct) < 3) {
          push('info', `${name} · 时间止损`, `持有 ${days} 天，浮盈仅 ${pctText(p.pnlPct)}，资金效率不合格。`, '降仓或退出，把资金换到有逻辑的标的上。');
        }
      }
    });
    return out.sort((a, b) => rank[a.level] - rank[b.level]);
  }

  /* ---------- Generic form ---------- */
  let formKind = null, formId = null;

  // 单一职责：只负责「打开某个表单」。目标解析与合法性校验都在这里完成，
  // 调用方（事件委托）只传意图，不夹带业务判断。
  function openForm(kind, id) {
    const schema = SCHEMAS[kind];
    const coll = COLLECTIONS[kind];
    if (!schema || !coll || !Array.isArray(state[coll])) return false;

    // 账户是单条记录：id 由数据层决定，调用方无需知道。
    if (kind === 'account') id = account().id;
    // 显式 id 必须在集合中存在，否则按「新增」处理，避免编辑到一个不存在的记录。
    if (id && !state[coll].some((x) => x.id === id)) id = null;

    formKind = kind; formId = id || null;
    const item = id ? state[coll].find((x) => x.id === id) : null;
    $('modalTitle').textContent = (item ? '编辑' : '添加') + schema.title;
    $('modalBody').innerHTML = schema.groups.map((g) => `
      <div class="form-section">${esc(g.name)}</div>
      <div class="form-grid">${g.fields.map((f) => {
        const val = item && item[f.k] !== undefined && item[f.k] !== null ? item[f.k] : (f.def !== undefined ? f.def : '');
        let control;
        if (f.t === 'select') control = `<select data-k="${f.k}">${f.o.map((o) => `<option value="${esc(o)}" ${String(val) === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
        else if (f.t === 'textarea') control = `<textarea data-k="${f.k}" placeholder="${esc(f.l)}">${esc(val)}</textarea>`;
        else control = `<input type="${f.t}" data-k="${f.k}" value="${esc(val)}" ${f.req ? 'required' : ''} ${f.t === 'number' ? 'step="any"' : ''}>`;
        return `<div class="form-group ${f.full ? 'full' : ''}"><label>${esc(f.l)}${f.req ? ' *' : ''}</label>${control}</div>`;
      }).join('')}</div>`).join('');
    $('modalOverlay').hidden = false;
    $('modalBody').scrollTop = 0;
    return true;
  }

  function closeForm() { $('modalOverlay').hidden = true; formKind = null; formId = null; }

  $('modalForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!formKind) return;
    const obj = {};
    $('modalBody').querySelectorAll('[data-k]').forEach((el) => { obj[el.dataset.k] = el.value.trim(); });
    const coll = COLLECTIONS[formKind];

    if (formKind === 'account') {
      const acc = state.accounts[0] || (state.accounts[0] = defaultAccount());
      Object.assign(acc, obj);
      acc.updatedAt = todayStr();
    } else if (formKind === 'cashflow') {
      const delta = (obj.type === '出金' ? -1 : 1) * num(obj.amount);
      const acc = state.accounts[0] || (state.accounts[0] = defaultAccount());
      acc.cash = num(acc.cash) + delta;
      if (formId) {
        const item = state.cashflows.find((x) => x.id === formId);
        if (item) { acc.cash -= (item.type === '出金' ? -1 : 1) * num(item.amount); Object.assign(item, obj); }
      } else {
        state.cashflows.unshift(Object.assign({ id: uid() }, obj));
      }
    } else if (formKind === 'checklist') {
      const checks = ['c_thesis', 'c_invalid', 'c_position', 'c_risk', 'c_emotion', 'c_exit'];
      if (checks.every((k) => obj[k] === '是')) obj.verdict = '通过';
      else if (obj.verdict !== '否决') obj.verdict = '待确认';
      if (formId) {
        const item = state.checklists.find((x) => x.id === formId);
        if (item) Object.assign(item, obj);
      } else state.checklists.unshift(Object.assign({ id: uid() }, obj));
    } else if (formId) {
      const item = state[coll].find((x) => x.id === formId);
      if (item) Object.assign(item, obj);
    } else {
      state[coll].unshift(Object.assign({ id: uid() }, obj));
    }
    save(); closeForm(); renderAll();
  });

  $('modalClose').addEventListener('click', closeForm);
  $('modalCancel').addEventListener('click', closeForm);
  $('modalOverlay').addEventListener('click', (e) => { if (e.target === $('modalOverlay')) closeForm(); });
  $('modalBody').addEventListener('change', (e) => {
    const sel = e.target.closest('[data-k="horizon"]');
    if (!sel || formKind !== 'holding') return;
    const tpl = HORIZON_RULES[sel.value];
    if (!tpl) return;
    Object.entries(tpl).forEach(([k, v]) => {
      const el = $('modalBody').querySelector(`[data-k="${k}"]`);
      if (el) el.value = v;
    });
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('modalOverlay').hidden) closeForm(); });

  // 统一的动作分发表：按钮只声明「做什么」，不携带业务细节。
  // 每个处理器是纯函数式意图，命中一个即停止，杜绝一次点击触发多个动作。
  const ACTIONS = {
    form: (el) => openForm(el.dataset.form, el.dataset.formId),
    edit: (el) => {
      const row = el.closest('[data-id]');
      return row ? openForm(el.dataset.edit, row.dataset.id) : false;
    },
    goto: (el) => switchView(el.dataset.goto)
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-form], [data-edit], [data-goto]');
    if (!el) return;
    const key = el.dataset.form !== undefined ? 'form' : el.dataset.edit !== undefined ? 'edit' : 'goto';
    ACTIONS[key](el);
  });

  /* ---------- Views ---------- */
  const SUBTITLES = {
    overview: '先看清组合与纪律，再处理今天的事。',
    portfolio: '从组合视角看风险，不逐只点评。',
    radar: '没有强催化的标的，只放观察。',
    research: '新闻要落到持仓，决策要留理由。',
    learning: '把学习变成可追踪的进度。',
    alerts: '触发即执行，不事后改规则。',
    capital: '仓位是风控的第一道闸门。',
    performance: '用数字检验纪律，不用感觉评价自己。',
    calendar: '已知的时间点提前摆上桌。',
    sync: '数字必须有来源和时点，拿不到就留空。'
  };

  function switchView(view) {
    const target = $('view-' + view);
    if (!target) return false; // 未知视图直接忽略，不破坏当前页面状态
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
    $('viewSubtitle').textContent = SUBTITLES[view] || '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return true;
  }

  $('mainNav').addEventListener('click', (e) => {
    const b = e.target.closest('.nav-item');
    if (b) switchView(b.dataset.view);
  });

  $('researchTabs').addEventListener('click', (e) => {
    const b = e.target.closest('.sub-tab');
    if (!b) return;
    researchTab = b.dataset.rtab;
    document.querySelectorAll('.sub-tab').forEach((x) => x.classList.toggle('active', x === b));
    document.querySelectorAll('.sub-view').forEach((v) => v.classList.toggle('active', v.id === 'rsub-' + researchTab));
  });

  /* ---------- Overview ---------- */
  function renderOverviewStats(alerts) {
    const total = state.todos.length;
    const done = state.todos.filter((t) => t.done).length;
    const p = portfolioStats();
    $('statRemaining').textContent = total - done;
    $('statValue').textContent = money(p.value);
    $('statPnl').textContent = pctText(p.pnlPct);
    $('statPnl').className = 'stat-value ' + pnlClass(p.pnlPct);
    $('statAlerts').textContent = alerts.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    $('donutPercent').textContent = pct + '%';
    $('legendDone').textContent = done;
    $('legendPending').textContent = total - done;
    const c = 2 * Math.PI * 52;
    $('donutValue').style.strokeDasharray = `${(pct / 100) * c} ${c}`;
    $('navAlertBadge').hidden = alerts.length === 0;
    $('navAlertBadge').textContent = alerts.length;

    $('miniAlerts').innerHTML = alerts.slice(0, 3).map((a) => `
      <div class="mini-alert ${a.level}"><div><strong>${esc(a.title)}</strong><span>${esc(a.name)} · ${esc(a.detail)}</span></div></div>`).join('') || '<div class="empty-state">当前没有触发任何规则。</div>';

    const top = p.positions.slice().sort((a, b) => b.p.value - a.p.value).slice(0, 4);
    $('miniPositions').innerHTML = top.map((x) => `
      <div class="mini-position"><div><strong>${esc(x.h.name)}</strong><span><span class="horizon-tag ${esc(x.h.horizon || '长期')}">${esc(x.h.horizon || '长期')}</span> 占比 ${((x.p.value / (p.value || 1)) * 100).toFixed(1)}%</span></div><b class="${pnlClass(x.p.pnlPct)}">${pctText(x.p.pnlPct)}</b></div>`).join('') || '<div class="empty-state">还没有持仓。</div>';
  }

  function renderKeyTasks() {
    const list = $('keyTaskList');
    $('keyTaskCount').textContent = state.keytasks.length + ' 项';
    $('keyTaskEmpty').hidden = state.keytasks.length > 0;
    list.innerHTML = state.keytasks.map((k) => {
      const v = Math.max(0, Math.min(100, num(k.progress)));
      return `<div class="keytask-item" data-id="${k.id}"><div class="keytask-top"><span class="keytask-name" title="${esc(k.name)}">${esc(k.name)}</span><span class="keytask-pct">${v}%</span><div class="keytask-actions"><button class="icon-btn" data-action="dec" title="减少 10%"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg></button><button class="icon-btn" data-action="inc" title="增加 10%"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button><button class="icon-btn danger" data-action="del" title="删除">${DEL_ICON}</button></div></div><div class="progress-track"><div class="progress-fill ${v >= 100 ? 'full' : ''}" style="width:${v}%"></div></div></div>`;
    }).join('');
  }

  function renderTodos() {
    const visible = state.todos.filter((t) => currentFilter === 'all' ? true : currentFilter === 'active' ? !t.done : t.done);
    $('todoEmpty').hidden = visible.length > 0;
    $('todoEmpty').textContent = state.todos.length === 0 ? '这里空空的，添加第一条待办吧。' : '当前筛选下没有事项。';
    const labels = { high: '高', mid: '中', low: '低' };
    $('todoList').innerHTML = visible.map((t) => `
      <div class="todo-item ${t.done ? 'done' : ''}" data-id="${t.id}">
        <button class="checkbox ${t.done ? 'checked' : ''}" data-action="toggle" title="${t.done ? '标记为待办' : '标记为完成'}">${CHECK_ICON}</button>
        <span class="todo-text">${esc(t.text)}</span><span class="priority ${t.priority}">${labels[t.priority] || '中'}</span>
        <button class="icon-btn danger" data-action="del" title="删除">${DEL_ICON}</button>
      </div>`).join('');
  }

  function renderNotes() {
    $('noteCount').textContent = state.notes.length + ' 条';
    $('notesEmpty').hidden = state.notes.length > 0;
    $('notesList').innerHTML = state.notes.map((n) => {
      const d = new Date(n.time);
      const stamp = isNaN(d.getTime()) ? '刚刚' : `${String(d.getMonth() + 1).padStart(2, '0')}月${String(d.getDate()).padStart(2, '0')}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      return `<div class="note-item" data-id="${n.id}"><div class="note-text">${esc(n.text)}</div><div class="note-meta">${stamp}</div><button class="icon-btn danger" data-action="del" title="删除">${DEL_ICON}</button></div>`;
    }).join('');
  }

  /* ---------- Portfolio ---------- */
  function renderPortfolio() {
    const p = portfolioStats();
    $('holdingCount').textContent = p.positions.length + ' 只';
    $('holdingEmpty').hidden = p.positions.length > 0;

    const sectorMax = p.sectors.length ? p.sectors[0].pct : 0;
    const layerCount = {};
    p.positions.forEach((x) => { const k = x.h.layer || '观察仓'; layerCount[k] = (layerCount[k] || 0) + 1; });
    const riskCards = [
      { l: '组合市值', v: money(p.value), h: `总投入 ${money(p.cost)}` },
      { l: '累计盈亏', v: pctText(p.pnlPct), h: `${p.pnl >= 0 ? '浮盈' : '浮亏'} ${money(Math.abs(p.pnl))}`, c: pnlClass(p.pnlPct) },
      { l: '最大单一持仓', v: p.maxPos.toFixed(1) + '%', h: p.maxPos > 30 ? '集中度偏高' : '集中度可接受', c: p.maxPos > 30 ? 'up' : '' },
      { l: '持仓数量', v: String(p.positions.length), h: `长期 ${p.horizonSplit.long.count} · 短期 ${p.horizonSplit.short.count}`, c: p.positions.length > 15 ? 'up' : '' }
    ];
    $('riskGrid').innerHTML = riskCards.map((c) => `<div class="risk-card"><div class="risk-label">${c.l}</div><div class="risk-value ${c.c || ''}">${c.v}</div><div class="risk-hint">${c.h}</div></div>`).join('');

    $('horizonSplit').innerHTML = `
      <div class="horizon-box"><div class="horizon-box-top"><span>长期仓 · 看逻辑与资本回报</span><b>${money(p.horizonSplit.long.value)} / ${p.horizonSplit.long.pct.toFixed(1)}%</b></div><div class="horizon-track"><div class="horizon-fill long" style="width:${p.horizonSplit.long.pct}%"></div></div></div>
      <div class="horizon-box"><div class="horizon-box-top"><span>短期仓 · 看价格与验证速度</span><b>${money(p.horizonSplit.short.value)} / ${p.horizonSplit.short.pct.toFixed(1)}%</b></div><div class="horizon-track"><div class="horizon-fill short" style="width:${p.horizonSplit.short.pct}%"></div></div></div>`;

    $('allocBar').innerHTML = p.sectors.slice(0, 5).map((s, i) => `<div class="alloc-seg" style="width:${s.pct}%;background:${PALETTE[i % PALETTE.length]}" title="${esc(s.name)} ${s.pct.toFixed(1)}%"></div>`).join('');
    $('allocLegend').innerHTML = p.sectors.slice(0, 5).map((s, i) => `<span><i style="background:${PALETTE[i % PALETTE.length]}"></i>${esc(s.name)} ${s.pct.toFixed(1)}%</span>`).join('') || '<span>暂无持仓</span>';

    const notes = [];
    if (p.positions.length > 15) notes.push(['danger', `持仓 ${p.positions.length} 只，超过 15 只后个人投资者基本无法有效跟踪。优先清理逻辑最弱的跟风仓。`]);
    if (p.maxPos > 30) notes.push(['warn', `最大单一持仓占 ${p.maxPos.toFixed(1)}%，注意单一风险暴露。`]);
    if (sectorMax > 40) notes.push(['warn', `${p.sectors[0].name}暴露 ${sectorMax.toFixed(1)}%，同类题材高度集中等于一笔仓位。`]);
    const noThesis = p.positions.filter((x) => !x.h.thesis).length;
    if (noThesis) notes.push(['warn', `${noThesis} 只持仓没有写下买入逻辑——没有逻辑就无法判断何时退出。`]);
    if (layerCount['问题仓']) notes.push(['danger', `有 ${layerCount['问题仓']} 只被标记为重点问题仓，应先处理逻辑最弱的拖累项。`]);
    if (p.horizonSplit.short.count > 5) notes.push(['warn', `短期仓 ${p.horizonSplit.short.count} 只，短线跟踪成本高；短线应使用更紧的止损与更短的验证周期，不能按长线扛。`]);
    if (p.horizonSplit.long.count && p.horizonSplit.short.count) notes.push(['', '两类仓位已分账：长线看逻辑与资本回报，短线看价格与验证速度。纪律参数不可混用。']);
    if (!notes.length) notes.push(['', '当前持仓结构没有明显风险信号。继续按分层管理：核心仓 / 稳定器 / 观察仓。']);
    $('riskNotes').innerHTML = notes.map((n) => `<div class="risk-note ${n[0]}">${esc(n[1])}</div>`).join('');

    const visible = p.positions.filter((x) => holdingFilter === '全部' || (x.h.horizon || '长期') === holdingFilter);
    $('holdingEmpty').hidden = visible.length > 0;
    $('holdingEmpty').textContent = p.positions.length === 0 ? '还没有持仓，点击右上角添加。' : '当前筛选下没有持仓。';
    $('holdingList').innerHTML = visible.map((x) => {
      const h = x.h, r = positionOf(h);
      return `<div class="holding-card" data-id="${h.id}">
        <div class="holding-top"><div class="holding-id"><div class="holding-name">${esc(h.name)}</div><div class="holding-code"><span class="horizon-tag ${esc(h.horizon || '长期')}">${esc(h.horizon || '长期')}</span> ${esc(h.code || '—')} · ${esc(h.type || '股票')} · 占比 ${(p.value > 0 ? r.value / p.value * 100 : 0).toFixed(1)}%</div></div>
          <div class="holding-pnl"><strong class="${pnlClass(r.pnlPct)}">${pctText(r.pnlPct)}</strong><span class="${pnlClass(r.pnl)}">${money(r.pnl)}</span></div>
          <div class="holding-actions"><button class="btn-mini" data-edit="holding" title="编辑">${EDIT_ICON}</button><button class="btn-mini danger" data-del="holding" title="删除">${DEL_ICON}</button></div>
        </div>
        <div class="tags"><span class="tag">${esc(h.sector || '未分类')}</span><span class="tag">${esc(h.style || '—')}</span><span class="tag layer-${esc(h.layer)}">${esc(h.layer || '观察仓')}</span>${h.thesisBroken === '是' ? '<span class="tag layer-问题仓">逻辑已破坏</span>' : ''}</div>
        <div class="holding-metrics">
          <div class="metric"><span>持有份额</span><b>${num(h.shares).toLocaleString('zh-CN')}</b></div>
          <div class="metric"><span>成本价</span><b>${money(h.cost)}</b></div>
          <div class="metric"><span>现价（可改）</span><b><input type="number" step="any" class="inline-price" data-id="${h.id}" value="${esc(h.price)}" aria-label="现价"></b></div>
          <div class="metric"><span>市值</span><b>${money(r.value)}</b></div>
        </div>
        ${h.thesis ? `<div class="holding-thesis"><b>逻辑：</b>${esc(h.thesis)}</div>` : ''}
        <div class="holding-rules">止损 -${num(h.stopLossPct)}% · 止盈 +${num(h.takeProfitPct)}% · 追踪 ${num(h.trailingStartPct)}%/${num(h.trailingDrawdownPct)}% · 时间 ${num(h.timeStopDays)} 天${num(h.targetPrice) > 0 ? ' · 目标价 ' + money(h.targetPrice) : ''}${h.invalidation ? '<br><b>失效条件：</b>' + esc(h.invalidation) : ''}</div>
      </div>`;
    }).join('');
  }

  /* ---------- Radar ---------- */
  function renderIdeas() {
    $('ideaEmpty').hidden = state.ideas.length > 0;
    const visible = state.ideas.filter((i) => ideaFilter === '全部' || i.status === ideaFilter);
    if (!visible.length && state.ideas.length) { $('ideaEmpty').hidden = false; $('ideaEmpty').textContent = '当前筛选下没有标的。'; }
    else $('ideaEmpty').textContent = '观察池是空的。';
    $('ideaList').innerHTML = visible.map((i) => `
      <div class="idea-card" data-id="${i.id}"><div class="idea-head"><div><div class="holding-name">${esc(i.name)}</div><div class="holding-code"><span class="horizon-tag ${esc(i.horizon || '长期')}">${esc(i.horizon || '长期')}</span> ${esc(i.code || '—')} · ${esc(i.type || '股票')} · 优先级 ${esc(i.priority || '中')}</div></div>
        <div style="display:flex;align-items:center;gap:6px"><span class="idea-status ${esc(i.status)}">${esc(i.status)}</span><button class="icon-btn" data-edit="idea" title="编辑">${EDIT_ICON}</button><button class="icon-btn danger" data-del="idea" title="删除">${DEL_ICON}</button></div></div>
        <div class="idea-grid"><div><span>目标买入价</span><b>${num(i.targetBuy) > 0 ? money(i.targetBuy) : '未设定'}</b></div><div><span>当前催化</span><b>${esc(i.catalyst || '未填写')}</b></div><div><span>下一步动作</span><b>${esc(i.nextAction || '未填写')}</b></div></div>
        ${i.thesis ? `<div class="idea-text"><b>核心逻辑：</b>${esc(i.thesis)}</div>` : ''}${i.invalidation ? `<div class="idea-text"><b>证伪条件：</b>${esc(i.invalidation)}</div>` : ''}
      </div>`).join('');
  }

  /* ---------- Research ---------- */
  function renderResearch() {
    $('newsCount').textContent = state.news.length + ' 条';
    $('newsEmpty').hidden = state.news.length > 0;
    $('newsList').innerHTML = state.news.map((n) => `
      <div class="news-item" data-id="${n.id}"><div class="entry-head"><div><div class="entry-title">${esc(n.title)}</div><div class="entry-meta"><span class="meta-chip">${esc(n.date || '—')}</span><span class="meta-chip">${esc(n.category || '其他')}</span><span class="meta-chip ${esc(n.impact)}">${esc(n.impact || '中性')}</span>${n.related ? `<span class="meta-chip">关联 ${esc(n.related)}</span>` : ''}<span class="meta-chip">${esc(n.source || '来源未填')}</span></div></div></div>
        ${n.takeaway ? `<div class="entry-body"><b>为什么重要：</b>${esc(n.takeaway)}</div>` : ''}${n.action ? `<div class="entry-action"><b>动作：</b>${esc(n.action)}</div>` : ''}
        <button class="icon-btn danger" data-del="news" title="删除">${DEL_ICON}</button></div>`).join('');

    $('decisionCount').textContent = state.decisions.length + ' 笔';
    $('decisionEmpty').hidden = state.decisions.length > 0;
    $('decisionList').innerHTML = state.decisions.map((d) => `
      <div class="decision-item" data-id="${d.id}"><div class="entry-head"><div><div class="entry-title">${esc(d.action)} · ${esc(d.name)} <span class="${pnlClass(0)}" style="font-size:11px;font-weight:400">${esc(d.code || '')}</span></div><div class="entry-meta"><span class="meta-chip">${esc(d.date || '—')}</span>${d.price ? `<span class="meta-chip">成交 ${money(d.price)}</span>` : ''}${d.shares ? `<span class="meta-chip">${esc(d.shares)} 份</span>` : ''}<span class="meta-chip ${esc(d.outcome)}">${esc(d.outcome || '待验证')}</span>${d.reviewDate ? `<span class="meta-chip">复盘 ${esc(d.reviewDate)}</span>` : ''}</div></div></div>
        ${d.reason ? `<div class="entry-body"><b>原始理由：</b>${esc(d.reason)}</div>` : ''}${d.plan ? `<div class="entry-body"><b>失效条件：</b>${esc(d.plan)}</div>` : ''}${d.lesson ? `<div class="entry-action"><b>复盘：</b>${esc(d.lesson)}</div>` : ''}
        <button class="icon-btn" data-edit="decision" title="编辑">${EDIT_ICON}</button><button class="icon-btn danger" data-del="decision" title="删除" style="right:32px">${DEL_ICON}</button></div>`).join('');

    $('reviewCount').textContent = state.reviews.length + ' 篇';
    $('reviewEmpty').hidden = state.reviews.length > 0;
    $('reviewList').innerHTML = state.reviews.map((r) => `
      <div class="review-item" data-id="${r.id}"><div class="entry-head"><div><div class="entry-title">${esc(r.date)} · ${esc(r.mood)}</div><div class="entry-meta"><span class="meta-chip">${esc(r.indexView || '未写市场概括')}</span></div></div></div>
        ${r.whatIDid ? `<div class="entry-body"><b>执行：</b>${esc(r.whatIDid)}</div>` : ''}${r.lesson ? `<div class="entry-body"><b>教训：</b>${esc(r.lesson)}</div>` : ''}${r.tomorrow ? `<div class="entry-action"><b>明日观察：</b>${esc(r.tomorrow)}</div>` : ''}
        <button class="icon-btn danger" data-del="review" title="删除">${DEL_ICON}</button></div>`).join('');
  }

  /* ---------- Learning ---------- */
  function renderLearning() {
    const total = state.learning.length;
    const done = state.learning.filter((l) => l.status === '已完成').length;
    const doing = state.learning.filter((l) => l.status === '学习中').length;
    const avg = total ? Math.round(state.learning.reduce((s, l) => s + num(l.progress), 0) / total) : 0;
    $('learningStats').innerHTML = [
      { l: '学习主题', v: String(total), h: '按路线逐步推进' },
      { l: '学习中', v: String(doing), h: '保持一次只攻一个' },
      { l: '已完成', v: String(done), h: '完成才算真正学过' },
      { l: '平均进度', v: avg + '%', h: '进度由你自己更新' }
    ].map((c) => `<div class="risk-card"><div class="risk-label">${c.l}</div><div class="risk-value">${c.v}</div><div class="risk-hint">${c.h}</div></div>`).join('');

    $('learningEmpty').hidden = total > 0;
    $('learningList').innerHTML = state.learning.map((l) => {
      const v = Math.max(0, Math.min(100, num(l.progress)));
      return `<div class="learning-item" data-id="${l.id}"><div class="learning-top"><div><div class="learning-name">${esc(l.topic)}</div><div class="learning-meta">${esc(l.category || '未分类')} · ${esc(l.status || '未开始')}${l.resource ? ' · ' + esc(l.resource) : ''}</div></div>
        <div class="learning-actions"><button class="icon-btn" data-action="dec" title="进度 -10">${'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg>'}</button><button class="icon-btn" data-action="inc" title="进度 +10">${'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'}</button><button class="icon-btn" data-edit="learning" title="编辑">${EDIT_ICON}</button><button class="icon-btn danger" data-del="learning" title="删除">${DEL_ICON}</button></div></div>
        <div class="learning-progress"><div class="progress-track"><div class="progress-fill ${v >= 100 ? 'full' : ''}" style="width:${v}%"></div></div><b>${v}%</b></div>
        ${l.note ? `<div class="entry-body"><b>笔记：</b>${esc(l.note)}</div>` : ''}</div>`;
    }).join('');
  }

  /* ---------- Alerts view ---------- */
  function renderAlerts(alerts) {
    const critical = alerts.filter((a) => a.level === 'critical').length;
    const warning = alerts.filter((a) => a.level === 'warning').length;
    const info = alerts.filter((a) => a.level === 'info').length;
    $('alertCount').textContent = alerts.length + ' 条';
    $('alertEmpty').hidden = alerts.length > 0;
    $('alertStats').innerHTML = [
      { l: '最高级 · 立即处理', v: String(critical), h: '逻辑破坏 / 成本止损', c: 'up' },
      { l: '关注级', v: String(warning), h: '止盈 / 目标价 / 追踪止损' },
      { l: '提示级', v: String(info), h: '时间止损等效率问题' },
      { l: '监控持仓', v: state.holdings.length + ' 只', h: '规则按持仓逐只设置' }
    ].map((c) => `<div class="risk-card"><div class="risk-label">${c.l}</div><div class="risk-value ${c.c || ''}">${c.v}</div><div class="risk-hint">${c.h}</div></div>`).join('');
    const levelName = { critical: '立即处理', warning: '关注', info: '提示' };
    $('alertList').innerHTML = alerts.map((a) => `
      <div class="alert-item ${a.level}"><div class="alert-head"><div class="alert-title">${esc(a.title)}</div><span class="alert-level">${levelName[a.level]}</span></div>
        <div class="alert-detail">${esc(a.detail)}</div><div class="alert-action"><b>触发后动作：</b>${esc(a.action)}</div></div>`).join('');
  }

  /* ================= 扩展模块：资金 / 绩效 / 事件 / 同步 ================= */

  function account() {
    if (!state.accounts || !state.accounts.length) state.accounts = [defaultAccount()];
    return state.accounts[0];
  }

  function capitalStats() {
    const a = account();
    const p = portfolioStats();
    const totalFund = num(a.total);
    const cash = num(a.cash);
    const equity = cash + p.value;
    const positionPct = equity > 0 ? (p.value / equity) * 100 : 0;
    const cashPct = equity > 0 ? (cash / equity) * 100 : 100;
    const targetMax = num(a.targetMax) || 70;
    const room = Math.max(0, (targetMax / 100) * equity - p.value);
    const singleRiskAmt = (num(a.singleRisk) / 100) * (totalFund || equity);
    return { a, p, totalFund, cash, equity, positionPct, cashPct, targetMax, room, singleRiskAmt };
  }

  function renderCapital() {
    const c = capitalStats();
    $('capitalStats').innerHTML = [
      { l: '账户总权益', v: money(c.equity), h: `持仓 ${money(c.p.value)} + 现金 ${money(c.cash)}` },
      { l: '当前仓位', v: c.positionPct.toFixed(1) + '%', h: `目标上限 ${c.targetMax}%`, c: c.positionPct > c.targetMax ? 'up' : '' },
      { l: '可用现金', v: money(c.cash), h: `占总权益 ${c.cashPct.toFixed(1)}%` },
      { l: '可加仓空间', v: money(c.room), h: `按目标仓位上限计算` }
    ].map((x) => `<div class="risk-card"><div class="risk-label">${x.l}</div><div class="risk-value ${x.c || ''}">${x.v}</div><div class="risk-hint">${x.h}</div></div>`).join('');

    $('accountGrid').innerHTML = `
      <div class="account-item"><span>投入总资金</span><b>${c.totalFund > 0 ? money(c.totalFund) : '未填'}</b></div>
      <div class="account-item"><span>可用现金</span><b>${money(c.cash)}</b></div>
      <div class="account-item"><span>目标仓位上限</span><b>${c.targetMax}%</b></div>
      <div class="account-item"><span>单笔风险预算</span><b>${num(c.a.singleRisk)}% · 约 ${money(c.singleRiskAmt)}</b></div>
      <div class="account-item"><span>最近更新</span><b>${esc(c.a.updatedAt || '未更新')}</b></div>`;

    const posPct = Math.min(100, Math.max(0, c.positionPct));
    $('positionGauge').innerHTML = `
      <div class="gauge-top"><span>当前 ${posPct.toFixed(1)}%</span><span>目标上限 ${c.targetMax}%</span></div>
      <div class="gauge-track">
        <div class="gauge-fill" style="width:${posPct}%"></div>
        <div class="gauge-marker" style="left:${Math.min(100, c.targetMax)}%" title="目标上限"></div>
      </div>
      <div class="gauge-scale"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>`;

    const notes = [];
    if (!c.totalFund) notes.push(['warn', '尚未填写投入总资金，单笔风险预算无法计算。先在账户设置里填总资金。']);
    if (c.positionPct > c.targetMax) notes.push(['danger', `当前仓位 ${c.positionPct.toFixed(1)}% 已超过目标上限 ${c.targetMax}%。停止新增，优先处理逻辑最弱的持仓。`]);
    else if (c.positionPct < c.targetMax * 0.5) notes.push(['', `当前仓位 ${c.positionPct.toFixed(1)}% 明显低于目标，资金效率偏低。没有合适标的时空仓也是仓位。`]);
    else notes.push(['', `仓位 ${c.positionPct.toFixed(1)}% 在目标区间内，保持纪律。`]);
    if (c.room > 0) notes.push(['', `距目标上限还有 ${money(c.room)} 空间；但空间不等于必须买入，没有强催化的标的宁可空着。`]);
    notes.push(['', `单笔风险预算 ${num(c.a.singleRisk)}% ≈ ${money(c.singleRiskAmt)}：任何一笔买入，止损金额都不应超过这个数。`]);
    $('capitalNotes').innerHTML = notes.map((n) => `<div class="risk-note ${n[0]}">${esc(n[1])}</div>`).join('');

    $('cashflowCount').textContent = state.cashflows.length + ' 笔';
    $('cashflowEmpty').hidden = state.cashflows.length > 0;
    $('cashflowList').innerHTML = state.cashflows.map((f) => `
      <div class="cashflow-item" data-id="${f.id}">
        <div class="cf-main"><b class="${f.type === '出金' ? 'down' : 'up'}">${esc(f.type)} ${money(f.amount)}</b><span>${esc(f.date || '—')} · ${esc(f.note || '无备注')}</span></div>
        <button class="icon-btn" data-edit="cashflow" title="编辑">${EDIT_ICON}</button><button class="icon-btn danger" data-del="cashflow" title="删除">${DEL_ICON}</button>
      </div>`).join('');

    $('checklistEmpty').hidden = state.checklists.length > 0;
    $('checklistList').innerHTML = state.checklists.map((k) => {
      const checks = ['c_thesis', 'c_invalid', 'c_position', 'c_risk', 'c_emotion', 'c_exit'];
      const passed = checks.filter((x) => k[x] === '是').length;
      const verdict = k.verdict || '待确认';
      return `<div class="check-card" data-id="${k.id}">
        <div class="check-head"><div><b>${esc(k.name)} ${esc(k.code || '')}</b><span>${esc(k.date || '—')} · ${esc(k.horizon || '长期')} · 通过 ${passed}/6 项</span></div>
          <div style="display:flex;gap:6px;align-items:center"><span class="check-verdict ${esc(verdict)}">${esc(verdict)}</span><button class="icon-btn" data-edit="checklist" title="编辑">${EDIT_ICON}</button><button class="icon-btn danger" data-del="checklist" title="删除">${DEL_ICON}</button></div></div>
        <div class="check-grid">${checks.map((x) => `<div class="check-item ${k[x] === '是' ? 'ok' : 'no'}">${k[x] === '是' ? '✓' : '✕'} ${esc(SCHEMAS.checklist.groups[1].fields.find((f) => f.k === x).l.replace(/^\d+\.\s*/, ''))}</div>`).join('')}</div>
        ${k.thesis ? `<div class="entry-body"><b>逻辑：</b>${esc(k.thesis)}</div>` : ''}
        ${k.invalidation ? `<div class="entry-body"><b>失效条件：</b>${esc(k.invalidation)}</div>` : ''}
      </div>`;
    }).join('');
  }

  function performanceStats() {
    const snaps = state.snapshots.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    let peak = 0, maxDD = 0;
    snaps.forEach((s) => {
      const v = num(s.equity);
      if (v > peak) peak = v;
      if (peak > 0) maxDD = Math.min(maxDD, ((v - peak) / peak) * 100);
    });
    const first = snaps.length ? num(snaps[0].equity) : 0;
    const last = snaps.length ? num(snaps[snaps.length - 1].equity) : 0;
    const totalReturn = first > 0 ? ((last - first) / first) * 100 : 0;
    const decisions = state.decisions.filter((d) => d.outcome === '符合预期' || d.outcome === '不符预期');
    const wins = decisions.filter((d) => d.outcome === '符合预期').length;
    const losses = decisions.length - wins;
    const winRate = decisions.length ? (wins / decisions.length) * 100 : 0;
    const winPnl = state.decisions.filter((d) => d.outcome === '符合预期').reduce((s, d) => s + num(d.realizedPnl), 0);
    const lossPnl = Math.abs(state.decisions.filter((d) => d.outcome === '不符预期').reduce((s, d) => s + num(d.realizedPnl), 0));
    const profitFactor = lossPnl > 0 ? winPnl / lossPnl : (winPnl > 0 ? 99 : 0);
    return { snaps, peak, maxDD, first, last, totalReturn, decisions, wins, losses, winRate, winPnl, lossPnl, profitFactor };
  }

  function renderPerformance() {
    const s = performanceStats();
    $('perfStats').innerHTML = [
      { l: '累计净值收益', v: pctText(s.totalReturn), h: `${s.snaps.length} 个快照`, c: pnlClass(s.totalReturn) },
      { l: '最大回撤', v: s.maxDD.toFixed(2) + '%', h: '按记录权益计算', c: s.maxDD < -10 ? 'up' : '' },
      { l: '决策胜率', v: s.decisions.length ? s.winRate.toFixed(1) + '%' : '—', h: `${s.decisions.length} 笔已验证`, c: s.decisions.length && s.winRate < 50 ? 'up' : '' },
      { l: '盈亏比', v: s.decisions.length ? s.profitFactor.toFixed(2) : '—', h: '总盈利 / 总亏损' }
    ].map((x) => `<div class="risk-card"><div class="risk-label">${x.l}</div><div class="risk-value ${x.c || ''}">${x.v}</div><div class="risk-hint">${x.h}</div></div>`).join('');

    // 净值曲线（SVG 折线）
    if (s.snaps.length < 2) {
      $('equityChart').innerHTML = '<div class="empty-state">至少需要两个净值快照才能画出曲线。</div>';
    } else {
      const w = 720, h = 220, pad = 34;
      const vals = s.snaps.map((x) => num(x.equity));
      const min = Math.min(...vals), max = Math.max(...vals);
      const span = max - min || 1;
      const pts = s.snaps.map((x, i) => {
        const px = pad + (i / (s.snaps.length - 1)) * (w - pad * 2);
        const py = h - pad - ((num(x.equity) - min) / span) * (h - pad * 2);
        return { x: px, y: py, s: x };
      });
      const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      const area = line + ` L${pts[pts.length - 1].x.toFixed(1)},${h - pad} L${pts[0].x.toFixed(1)},${h - pad} Z`;
      $('equityChart').innerHTML = `
        <svg viewBox="0 0 ${w} ${h}" class="equity-svg" preserveAspectRatio="none">
          <defs><linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5b8cff" stop-opacity=".3"/><stop offset="100%" stop-color="#5b8cff" stop-opacity="0"/></linearGradient></defs>
          <line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="#252d3d"/>
          <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h - pad}" stroke="#252d3d"/>
          <path d="${area}" fill="url(#eqGrad)"/>
          <path d="${line}" fill="none" stroke="#5b8cff" stroke-width="2" stroke-linejoin="round"/>
          ${pts.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="#8fb2ff"><title>${esc(p.s.date)} · ${money(p.s.equity)}</title></circle>`).join('')}
        </svg>
        <div class="chart-caption"><span>${esc(s.snaps[0].date)}</span><span>最低 ${money(min)} / 最高 ${money(max)}</span><span>${esc(s.snaps[s.snaps.length - 1].date)}</span></div>`;
    }

    const total = state.decisions.length;
    const planned = state.decisions.filter((d) => d.reason && d.plan).length;
    const verified = state.decisions.filter((d) => d.outcome !== '待验证').length;
    $('tradeQuality').innerHTML = [
      { l: '全部决策', v: String(total), h: '含待验证' },
      { l: '有完整计划', v: String(planned), h: '理由 + 退出计划' },
      { l: '已验证', v: String(verified), h: '可统计胜率' },
      { l: '纪律完整率', v: total ? ((planned / total) * 100).toFixed(0) + '%' : '—', h: '写下计划的比例' }
    ].map((x) => `<div class="quality-card"><div class="risk-label">${x.l}</div><div class="risk-value">${x.v}</div><div class="risk-hint">${x.h}</div></div>`).join('');

    $('snapshotCount').textContent = s.snaps.length + ' 个快照';
    $('snapshotEmpty').hidden = s.snaps.length > 0;
    $('snapshotList').innerHTML = s.snaps.slice().reverse().map((x) => `
      <div class="snapshot-item" data-id="${x.id}"><div><b>${money(x.equity)}</b><span>${esc(x.date || '—')} · ${esc(x.note || '无备注')}</span></div>
        <button class="icon-btn" data-edit="snapshot" title="编辑">${EDIT_ICON}</button><button class="icon-btn danger" data-del="snapshot" title="删除">${DEL_ICON}</button></div>`).join('');
  }

  function renderCalendar() {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const future = [], past = [];
    state.events.forEach((e) => {
      const d = new Date(e.date);
      (isNaN(d.getTime()) || d < now || e.done ? past : future).push(e);
    });
    future.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    past.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const visible = future.filter((e) => eventFilter === '全部' || e.type === eventFilter);

    const high = future.filter((e) => e.importance === '高').length;
    const week = future.filter((e) => (new Date(e.date) - now) / 86400000 <= 7).length;
    $('eventStats').innerHTML = [
      { l: '未来事件', v: String(future.length), h: '已排除完成与过期' },
      { l: '7 天内', v: String(week), h: '需要提前准备' },
      { l: '高重要性', v: String(high), h: '重点盯防', c: high > 0 ? 'up' : '' },
      { l: '历史记录', v: String(past.length), h: '保留作复盘依据' }
    ].map((x) => `<div class="risk-card"><div class="risk-label">${x.l}</div><div class="risk-value ${x.c || ''}">${x.v}</div><div class="risk-hint">${x.h}</div></div>`).join('');

    const card = (e) => {
      const days = Math.max(0, Math.round((new Date(e.date) - now) / 86400000));
      return `<div class="event-item" data-id="${e.id}">
        <div class="event-date"><b>${esc(String(e.date).slice(5) || '—')}</b><span>${days === 0 ? '今天' : days + ' 天后'}</span></div>
        <div class="event-body"><b>${esc(e.title)}</b><span>${esc(e.type)} · ${esc(e.importance)}重要${e.related ? ' · ' + esc(e.related) : ''}</span>${e.note ? `<em>${esc(e.note)}</em>` : ''}</div>
        <div class="event-actions"><button class="icon-btn" data-action="done" title="标记完成">${CHECK_ICON}</button><button class="icon-btn" data-edit="event" title="编辑">${EDIT_ICON}</button><button class="icon-btn danger" data-del="event" title="删除">${DEL_ICON}</button></div>
      </div>`;
    };
    $('eventEmpty').hidden = visible.length > 0;
    $('eventList').innerHTML = visible.map(card).join('') || '<div class="empty-state">当前筛选下没有事件。</div>';
    $('eventPast').innerHTML = past.map((e) => `<div class="event-item past" data-id="${e.id}"><div class="event-date"><b>${esc(String(e.date).slice(5))}</b><span>${e.done ? '已完成' : '已过期'}</span></div><div class="event-body"><b>${esc(e.title)}</b><span>${esc(e.type)} · ${esc(e.related || '')}</span></div><div class="event-actions"><button class="icon-btn danger" data-del="event" title="删除">${DEL_ICON}</button></div></div>`).join('') || '<div class="empty-state">暂无历史记录。</div>';
  }

  function renderSync() {
    $('syncLedger').innerHTML = state.syncLedger.map((l) => `
      <div class="ledger-item" data-id="${l.id}">
        <div><b>${esc(l.source || '来源未填')}</b><span>${esc(l.asOf || '时点未填')} · 更新 ${num(l.count)} 条</span><em>${esc(l.detail || '')}</em></div>
        <button class="icon-btn danger" data-del="sync" title="删除">${DEL_ICON}</button>
      </div>`).join('');
    $('ledgerEmpty').hidden = state.syncLedger.length > 0;
  }

  function renderAll() {
    const alerts = computeAlerts();
    renderOverviewStats(alerts);
    renderKeyTasks(); renderTodos(); renderNotes();
    renderPortfolio(); renderIdeas(); renderResearch(); renderLearning(); renderAlerts(alerts);
    renderCapital(); renderPerformance(); renderCalendar(); renderSync();
    $('demoBanner').hidden = !state.demo;
  }

  /* ---------- List actions ---------- */
  function delegate(listId, handler) {
    $(listId).addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action], [data-del]');
      if (!btn) return;
      const card = btn.closest('[data-id]');
      if (!card) return;
      handler(btn, card.dataset.id);
    });
  }

  delegate('keyTaskList', (btn, id) => {
    const k = state.keytasks.find((x) => x.id === id); if (!k) return;
    if (btn.dataset.action === 'inc') k.progress = Math.min(100, num(k.progress) + 10);
    else if (btn.dataset.action === 'dec') k.progress = Math.max(0, num(k.progress) - 10);
    else if (btn.dataset.action === 'del') state.keytasks = state.keytasks.filter((x) => x.id !== id);
    save(); renderAll();
  });

  delegate('todoList', (btn, id) => {
    if (btn.dataset.action === 'toggle') { const t = state.todos.find((x) => x.id === id); if (t) t.done = !t.done; }
    else if (btn.dataset.action === 'del') state.todos = state.todos.filter((x) => x.id !== id);
    save(); renderAll();
  });

  delegate('notesList', (btn, id) => { if (btn.dataset.action === 'del') { state.notes = state.notes.filter((x) => x.id !== id); save(); renderAll(); } });

  delegate('learningList', (btn, id) => {
    const l = state.learning.find((x) => x.id === id); if (!l) return;
    if (btn.dataset.action === 'inc') l.progress = Math.min(100, num(l.progress) + 10);
    else if (btn.dataset.action === 'dec') l.progress = Math.max(0, num(l.progress) - 10);
    else if (btn.dataset.del) { state.learning = state.learning.filter((x) => x.id !== id); }
    if (l.progress === 100) l.status = '已完成';
    save(); renderAll();
  });

  ['holdingList', 'ideaList', 'newsList', 'decisionList', 'reviewList'].forEach((listId) => {
    const kind = { holdingList: 'holding', ideaList: 'idea', newsList: 'news', decisionList: 'decision', reviewList: 'review' }[listId];
    delegate(listId, (btn, id) => {
      if (btn.dataset.del) state[COLLECTIONS[kind]] = state[COLLECTIONS[kind]].filter((x) => x.id !== id);
      save(); renderAll();
    });
  });

  // 新模块列表：编辑 / 删除（资金流水删除时回滚现金）
  ['cashflowList', 'snapshotList', 'eventList', 'eventPast', 'checklistList'].forEach((listId) => {
    const kind = { cashflowList: 'cashflow', snapshotList: 'snapshot', eventList: 'event', eventPast: 'event', checklistList: 'checklist' }[listId];
    delegate(listId, (btn, id) => {
      if (btn.dataset.action === 'done' && kind === 'event') {
        const ev = state.events.find((x) => x.id === id);
        if (ev) ev.done = true;
      } else if (btn.dataset.del) {
        if (kind === 'cashflow') {
          const f = state.cashflows.find((x) => x.id === id);
          if (f) account().cash = num(account().cash) - (f.type === '出金' ? -1 : 1) * num(f.amount);
        }
        state[COLLECTIONS[kind]] = state[COLLECTIONS[kind]].filter((x) => x.id !== id);
      }
      save(); renderAll();
    });
  });

  $('syncLedger').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-del="sync"]');
    if (!btn) return;
    const id = btn.closest('[data-id]').dataset.id;
    state.syncLedger = state.syncLedger.filter((x) => x.id !== id);
    save(); renderAll();
  });

  $('holdingList').addEventListener('change', (e) => {
    const input = e.target.closest('.inline-price');
    if (!input) return;
    const h = state.holdings.find((x) => x.id === input.dataset.id);
    if (!h) return;
    h.price = num(input.value);
    h.peak = Math.max(num(h.peak) || 0, h.price);
    save(); renderAll();
  });

  /* ---------- Quick add ---------- */
  function addTodo() {
    const input = $('todoInput'); const text = input.value.trim();
    if (!text) { input.focus(); return; }
    state.todos.unshift({ id: uid(), text, priority: $('todoPriority').value, done: false });
    input.value = ''; save(); renderAll(); input.focus();
  }
  function addKeyTask() {
    const input = $('keyTaskInput'); const name = input.value.trim();
    if (!name) { input.focus(); return; }
    state.keytasks.unshift({ id: uid(), name, progress: 0 });
    input.value = ''; save(); renderAll(); input.focus();
  }
  function addNote() {
    const input = $('noteInput'); const text = input.value.trim();
    if (!text) { input.focus(); return; }
    state.notes.unshift({ id: uid(), text, time: new Date().toISOString() });
    input.value = ''; save(); renderAll();
  }
  $('addTodoBtn').addEventListener('click', addTodo);
  $('addKeyTaskBtn').addEventListener('click', addKeyTask);
  $('addNoteBtn').addEventListener('click', addNote);
  $('todoInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') addTodo(); });
  $('keyTaskInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') addKeyTask(); });
  $('noteInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addNote(); } });

  document.querySelectorAll('.filter-btn[data-filter]').forEach((btn) => btn.addEventListener('click', () => {
    currentFilter = btn.dataset.filter;
    document.querySelectorAll('.filter-btn[data-filter]').forEach((b) => b.classList.toggle('active', b === btn));
    renderTodos();
  }));
  $('ideaFilters').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-istatus]'); if (!btn) return;
    ideaFilter = btn.dataset.istatus;
    $('ideaFilters').querySelectorAll('.filter-btn').forEach((b) => b.classList.toggle('active', b === btn));
    renderIdeas();
  });
  $('horizonFilters').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-hfilter]'); if (!btn) return;
    holdingFilter = btn.dataset.hfilter;
    $('horizonFilters').querySelectorAll('.filter-btn').forEach((b) => b.classList.toggle('active', b === btn));
    renderPortfolio();
  });

  /* ---------- 跨设备数据迁移 ---------- */
  $('exportBtn').addEventListener('click', () => {
    const payload = { app: 'mina-investment-desk', version: 1, exportedAt: new Date().toISOString(), data: state };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `投资工作台备份-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  /* ---------- 智能导入：解析 → 预览 → 选择合并模式 ---------- */
  const IMPORT_REQUIRED = ['todos', 'keytasks', 'notes', 'holdings', 'ideas', 'news', 'decisions', 'reviews', 'learning'];
  const COLL_LABELS = {
    todos: '待办', keytasks: '重要任务', notes: '快速记录', holdings: '持仓', ideas: '观察标的',
    news: '资讯', decisions: '交易决策', reviews: '复盘', learning: '学习主题',
    accounts: '账户', cashflows: '资金流水', snapshots: '净值快照', events: '事件', checklists: '盘前检查', syncLedger: '同步台账'
  };
  let pendingImport = null;

  // 给缺失 id 的记录补一个稳定 id，避免同一条数据在合并时被当成两条。
  function withId(x) {
    if (!x || typeof x !== 'object') return null;
    return x.id ? Object.assign({}, x) : Object.assign({ id: uid() }, x);
  }

  // 按 id 合并两个集合。mode: merge(同 id 用导入覆盖) / append(只加新 id) / replace(全量替换)
  function mergeCollection(localArr, incomingArr, mode) {
    const local = Array.isArray(localArr) ? localArr.map(withId).filter(Boolean) : [];
    const incoming = Array.isArray(incomingArr) ? incomingArr.map(withId).filter(Boolean) : [];
    if (mode === 'replace') return { list: incoming, added: incoming.length, updated: 0, kept: 0 };

    const localById = new Map(local.map((x) => [x.id, x]));
    const seen = new Set();
    const out = [];
    let added = 0, updated = 0, kept = 0;

    incoming.forEach((item) => {
      if (seen.has(item.id)) return; // 导入文件内部去重，保留第一条
      seen.add(item.id);
      if (localById.has(item.id)) {
        if (mode === 'merge') { out.push(Object.assign({}, localById.get(item.id), item)); updated++; }
        else { out.push(localById.get(item.id)); kept++; } // append：本地优先，跳过导入的同 id
      } else {
        out.push(item); added++;
      }
    });
    local.forEach((x) => { if (!seen.has(x.id)) { out.push(x); kept++; } }); // 本地独有保留
    return { list: out, added, updated, kept };
  }

  function openImportPreview(d) {
    pendingImport = d;
    const body = $('importBody');
    const rows = ALL_KEYS.map((k) => {
      const localN = Array.isArray(state[k]) ? state[k].length : 0;
      const inN = Array.isArray(d[k]) ? d[k].length : 0;
      if (!localN && !inN) return '';
      return `<div class="import-row"><span>${esc(COLL_LABELS[k] || k)}</span><b>本地 ${localN}</b><em>→</em><b class="${inN > localN ? 'down' : inN < localN ? 'up' : ''}">文件 ${inN}</b></div>`;
    }).filter(Boolean).join('') || '<div class="risk-note">备份文件里没有可导入的记录。</div>';

    body.innerHTML = `
      <div class="import-summary">
        <div class="import-note"><b>推荐「智能合并」</b>：按记录 ID 匹配——文件里更新的覆盖本地、新增的补进来、本地独有的一律保留。不会清空你的数据。</div>
        <div class="import-list">${rows}</div>
        <div class="import-mode-help">
          <div><b>智能合并</b><span>同 ID 用文件版本更新，新增补入，本地独有保留</span></div>
          <div><b>仅补新增</b><span>只加入本地没有的记录，同名记录完全不动（最保守）</span></div>
          <div><b>完整覆盖</b><span>清空本地全部数据，完全用文件替换（等价于旧行为）</span></div>
        </div>
      </div>`;
    $('importOverlay').hidden = false;
  }

  function closeImport() { $('importOverlay').hidden = true; pendingImport = null; }
  $('importClose').addEventListener('click', closeImport);
  $('importCancel').addEventListener('click', closeImport);
  $('importOverlay').addEventListener('click', (e) => { if (e.target === $('importOverlay')) closeImport(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('importOverlay').hidden) closeImport(); });

  document.querySelectorAll('[data-import-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!pendingImport) return;
      const mode = btn.dataset.importMode;
      const d = pendingImport;
      const report = {};

      ALL_KEYS.forEach((k) => {
        if (k === 'accounts') return; // 账户单独处理
        const r = mergeCollection(state[k], d[k], mode);
        state[k] = r.list;
        report[k] = r;
      });

      // 账户是单条记录：merge 用文件覆盖本地，append 保留本地，replace 全量替换
      const localAcc = state.accounts && state.accounts[0] ? state.accounts[0] : defaultAccount();
      const fileAcc = Array.isArray(d.accounts) && d.accounts[0] ? d.accounts[0] : null;
      if (mode === 'replace') state.accounts = [Object.assign(defaultAccount(), fileAcc || {})];
      else if (mode === 'merge' && fileAcc) state.accounts = [Object.assign(defaultAccount(), localAcc, fileAcc)];
      else state.accounts = [Object.assign(defaultAccount(), localAcc)];

      // 兼容旧数据默认字段
      state.holdings.forEach((h) => { if (!h.horizon) h.horizon = '长期'; });
      state.ideas.forEach((i) => { if (!i.horizon) i.horizon = '长期'; });
      // 导入真实数据后关闭演示标记，避免横幅误报
      if (d.demo !== true) state.demo = false;

      save(); closeImport(); renderAll();

      const totalAdd = ALL_KEYS.reduce((s, k) => s + (report[k] ? report[k].added : 0), 0);
      const totalUpd = ALL_KEYS.reduce((s, k) => s + (report[k] ? report[k].updated : 0), 0);
      const label = { merge: '智能合并', append: '仅补新增', replace: '完整覆盖' }[mode];
      window.alert(`${label}完成：新增 ${totalAdd} 条，更新 ${totalUpd} 条。本地其余数据已保留。`);
    });
  });

  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const d = parsed && parsed.data ? parsed.data : parsed;
        if (!d || !IMPORT_REQUIRED.every((k) => Array.isArray(d[k]))) throw new Error('数据结构不符合备份格式');
        openImportPreview(d);
      } catch (err) {
        window.alert('导入失败：' + (err.message || '文件格式无法识别'));
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  $('clearDemoBtn').addEventListener('click', () => {
    if (!window.confirm('清空演示数据？此操作不可撤销。')) return;
    Object.assign(state, emptyFinance());
    state.demo = false;
    save(); renderAll();
  });

  /* ---------- 扩展模块交互 ---------- */
  $('eventFilters').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-efilter]');
    if (!btn) return;
    eventFilter = btn.dataset.efilter;
    $('eventFilters').querySelectorAll('.filter-btn').forEach((b) => b.classList.toggle('active', b === btn));
    renderCalendar();
  });

  function parseQuoteLines(text) {
    const rows = [];
    text.split(/\r?\n/).forEach((line) => {
      const s = line.trim();
      if (!s || s.startsWith('#')) return;
      const parts = s.split(/[\t,，\s]+/).filter(Boolean);
      if (parts.length < 2) return;
      let code = parts[0], name = '', priceRaw = '';
      if (/^-?\d+(\.\d+)?$/.test(parts[parts.length - 1])) { priceRaw = parts[parts.length - 1]; name = parts.slice(1, -1).join(' '); }
      else if (parts.length >= 3) { code = parts[0]; name = parts[1]; priceRaw = parts[2]; }
      const price = Number(priceRaw);
      if (!priceRaw || !isFinite(price) || price <= 0) return;
      rows.push({ code, name, price });
    });
    return rows;
  }

  $('applyQuotesBtn').addEventListener('click', () => {
    const text = $('quotePaste').value;
    const rows = parseQuoteLines(text);
    const box = $('parseResult');
    if (!rows.length) {
      box.hidden = false;
      box.innerHTML = '<div class="risk-note danger">没有解析出有效数据。每行格式应为：代码,名称,现价（现价必须是正数）。</div>';
      return;
    }
    const byCode = {};
    state.holdings.forEach((h) => { if (h.code) byCode[String(h.code).trim()] = h; });
    let updated = 0; const unmatched = [];
    rows.forEach((r) => {
      const h = byCode[String(r.code).trim()];
      if (h) { h.price = r.price; h.peak = Math.max(num(h.peak) || 0, r.price); updated++; }
      else unmatched.push(`${r.code} ${r.name}`.trim());
    });
    const source = $('quoteSource').value.trim();
    const asOf = $('quoteTime').value.trim();
    const parts = [`解析 ${rows.length} 条，匹配持仓 ${updated} 条`];
    if (unmatched.length) parts.push(`未匹配：${unmatched.join('、')}`);
    state.syncLedger.unshift({ id: uid(), time: new Date().toISOString(), source, asOf, count: updated, detail: parts.join('；') });
    save(); renderAll();
    box.hidden = false;
    box.innerHTML = `<div class="risk-note ${updated ? '' : 'warn'}">${esc(parts.join('；'))}${updated ? '。现价与台账已更新。' : '。请检查代码是否与持仓一致。'}</div>`;
    if (updated) $('quotePaste').value = '';
  });

  /* ---------- Boot ---------- */
  const day = Math.floor(Date.now() / 86400000);
  $('dailyQuote').textContent = QUOTES[day % QUOTES.length];
  tickClock(); setInterval(tickClock, 1000);
  renderAll();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => { /* 离线缓存不可用不影响主功能 */ });
    });
  }
})();

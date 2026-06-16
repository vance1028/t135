'use strict';

const store = require('./data/store');

/**
 * 写入初始种子数据：管理员 / 养蜂员 / 观察员各一个账号，
 * 外加若干蜂场、蜂箱、检查记录与采收批次，方便本地起步与「功能迭代」类任务直接有数据可用。
 * 幂等：若库中已存在用户则跳过，避免重复播种。
 */
function seed() {
  if (store.countUsers() > 0) {
    return { skipped: true };
  }

  store.createUser({ username: 'admin', password: 'admin123', name: '系统管理员', role: 'admin' });
  const keeper = store.createUser({ username: 'keeper', password: 'keeper123', name: '王养蜂', role: 'operator' });
  store.createUser({ username: 'viewer', password: 'viewer123', name: '李观察', role: 'viewer' });

  const a1 = store.createApiary({
    code: 'FC-ABA-001', name: '阿坝高山中蜂场', location: '阿坝州黑水县色尔古寨',
    district: '阿坝州', keeper: '王养蜂', status: 'active',
  });
  const a2 = store.createApiary({
    code: 'FC-YA-002', name: '雅安林下中蜂场', location: '雅安市宝兴县蜂桶寨',
    district: '雅安市', keeper: '赵蜂农', status: 'active',
  });
  store.createApiary({
    code: 'FC-LS-003', name: '凉山转场越冬点', location: '凉山州西昌邛海边',
    district: '凉山州', keeper: '王养蜂', status: 'dormant',
  });

  const hives = [
    { code: 'XF-001', apiaryId: a1.id, queenYear: 2025, frameCount: 6, strength: 'strong', status: 'active', installedAt: '2025-04-10' },
    { code: 'XF-002', apiaryId: a1.id, queenYear: 2024, frameCount: 4, strength: 'medium', status: 'active', installedAt: '2024-05-01' },
    { code: 'XF-003', apiaryId: a1.id, queenYear: 2025, frameCount: 2, strength: 'weak', status: 'queenless', installedAt: '2025-06-20' },
    { code: 'XF-004', apiaryId: a1.id, queenYear: 2023, frameCount: 5, strength: 'medium', status: 'active', installedAt: '2023-04-15' },
    { code: 'XF-005', apiaryId: a1.id, queenYear: 2025, frameCount: 3, strength: 'weak', status: 'active', installedAt: '2025-05-10' },
    { code: 'YA-001', apiaryId: a2.id, queenYear: 2025, frameCount: 7, strength: 'strong', status: 'active', installedAt: '2025-03-15' },
    { code: 'YA-002', apiaryId: a2.id, queenYear: 2024, frameCount: 5, strength: 'medium', status: 'active', installedAt: '2024-04-22' },
    { code: 'YA-003', apiaryId: a2.id, queenYear: 2025, frameCount: 8, strength: 'strong', status: 'active', installedAt: '2025-02-20' },
    { code: 'YA-004', apiaryId: a2.id, queenYear: 2024, frameCount: 4, strength: 'weak', status: 'diseased', installedAt: '2024-06-01' },
  ];
  const hiveRecs = hives.map((h) => store.createHive(h));

  const inspectionData = [
    { hive: 0, date: '2026-03-15', queen: true, brood: 2, honey: 0.5, disease: 'none', note: '春繁开始，蜂王产卵正常' },
    { hive: 0, date: '2026-04-10', queen: true, brood: 3, honey: 1, disease: 'none', note: '群势增长良好' },
    { hive: 0, date: '2026-05-05', queen: true, brood: 3.5, honey: 1.5, disease: 'none', note: '油菜花期，加脾' },
    { hive: 0, date: '2026-05-18', queen: true, brood: 3.5, honey: 2, disease: 'none', note: '群势旺，已加继箱' },
    { hive: 0, date: '2026-06-02', queen: true, brood: 4, honey: 3.5, disease: 'none', note: '山花大流蜜期，蜜脾快速积累' },

    { hive: 1, date: '2026-03-15', queen: true, brood: 1.5, honey: 0.3, disease: 'none', note: '春繁起步' },
    { hive: 1, date: '2026-04-10', queen: true, brood: 2, honey: 0.5, disease: 'none', note: '群势中等' },
    { hive: 1, date: '2026-05-05', queen: true, brood: 2, honey: 0.8, disease: 'none', note: '采集正常' },
    { hive: 1, date: '2026-05-20', queen: true, brood: 2.5, honey: 1.2, disease: 'none', note: '稳步增长' },
    { hive: 1, date: '2026-06-02', queen: true, brood: 2.5, honey: 2, disease: 'none', note: '蜜脾积累中' },

    { hive: 2, date: '2026-03-20', queen: true, brood: 0.5, honey: 0.2, disease: 'none', note: '新群，发展慢' },
    { hive: 2, date: '2026-04-15', queen: true, brood: 0.8, honey: 0.3, disease: 'none', note: '蜂量不足' },
    { hive: 2, date: '2026-05-10', queen: false, brood: 0.3, honey: 0.5, disease: 'none', note: '发现失王' },
    { hive: 2, date: '2026-05-18', queen: false, brood: 0, honey: 1, disease: 'none', note: '失王，需诱入新王或合并' },
    { hive: 2, date: '2026-06-01', queen: false, brood: 0, honey: 0.8, disease: 'none', note: '工蜂开始产卵，急需处理' },

    { hive: 3, date: '2026-03-10', queen: true, brood: 2.5, honey: 0.8, disease: 'none', note: '老群，开春状态好' },
    { hive: 3, date: '2026-04-05', queen: true, brood: 3, honey: 1.2, disease: 'none', note: '发展稳定' },
    { hive: 3, date: '2026-05-01', queen: true, brood: 3, honey: 2, disease: 'none', note: '流蜜期采集积极' },
    { hive: 3, date: '2026-05-15', queen: true, brood: 2.5, honey: 3, disease: 'none', note: '蜜脾充足' },
    { hive: 3, date: '2026-06-01', queen: true, brood: 3, honey: 4, disease: 'none', note: '已达采收标准' },

    { hive: 4, date: '2026-05-15', queen: true, brood: 0.8, honey: 0.2, disease: 'none', note: '新分群' },
    { hive: 4, date: '2026-06-01', queen: true, brood: 1.2, honey: 0.4, disease: 'none', note: '初步稳定' },

    { hive: 5, date: '2026-03-01', queen: true, brood: 3, honey: 1, disease: 'none', note: '春繁良好' },
    { hive: 5, date: '2026-03-20', queen: true, brood: 4, honey: 1.5, disease: 'none', note: '加继箱' },
    { hive: 5, date: '2026-04-15', queen: true, brood: 4.5, honey: 2.5, disease: 'none', note: '油菜蜜采收前' },
    { hive: 5, date: '2026-05-05', queen: true, brood: 4, honey: 4, disease: 'none', note: '乌桕花期开始' },
    { hive: 5, date: '2026-05-20', queen: true, brood: 4, honey: 3, disease: 'varroa', note: '发现少量蜂螨，已挂螨扑' },
    { hive: 5, date: '2026-06-03', queen: true, brood: 4.5, honey: 4.5, disease: 'none', note: '蜂螨已控制，蜜脾充足' },

    { hive: 6, date: '2026-03-05', queen: true, brood: 2.5, honey: 0.8, disease: 'none', note: '春繁开始' },
    { hive: 6, date: '2026-04-01', queen: true, brood: 3, honey: 1.2, disease: 'none', note: '发展正常' },
    { hive: 6, date: '2026-04-20', queen: true, brood: 3, honey: 2, disease: 'none', note: '柑橘花期' },
    { hive: 6, date: '2026-05-10', queen: true, brood: 3.5, honey: 2.8, disease: 'none', note: '稳步增长' },
    { hive: 6, date: '2026-06-01', queen: true, brood: 3.5, honey: 3.8, disease: 'none', note: '乌桕蜜积累' },

    { hive: 7, date: '2026-02-25', queen: true, brood: 3.5, honey: 1.2, disease: 'none', note: '强群越冬顺利' },
    { hive: 7, date: '2026-03-20', queen: true, brood: 5, honey: 2, disease: 'none', note: '加第二继箱' },
    { hive: 7, date: '2026-04-15', queen: true, brood: 5.5, honey: 3.5, disease: 'none', note: '高产群' },
    { hive: 7, date: '2026-05-05', queen: true, brood: 5, honey: 5, disease: 'none', note: '油菜蜜丰收' },
    { hive: 7, date: '2026-05-25', queen: true, brood: 5.5, honey: 6, disease: 'none', note: '乌桕大流蜜' },
    { hive: 7, date: '2026-06-05', queen: true, brood: 5, honey: 7, disease: 'none', note: '蜜脾满箱，急需采收' },

    { hive: 8, date: '2026-03-10', queen: true, brood: 1.5, honey: 0.5, disease: 'none', note: '春繁偏弱' },
    { hive: 8, date: '2026-04-05', queen: true, brood: 2, honey: 0.8, disease: 'chalkbrood', note: '发现白垩病' },
    { hive: 8, date: '2026-04-25', queen: false, brood: 1, honey: 0.6, disease: 'chalkbrood', note: '失王，白垩病严重' },
    { hive: 8, date: '2026-05-15', queen: true, brood: 1.5, honey: 0.5, disease: 'chalkbrood', note: '诱入新王，病害未愈' },
    { hive: 8, date: '2026-06-02', queen: true, brood: 1.5, honey: 1, disease: 'chalkbrood', note: '病害好转中' },
  ];

  inspectionData.forEach(d => {
    store.createInspection({
      hiveId: hiveRecs[d.hive].id,
      inspectorId: keeper.id,
      inspectDate: d.date,
      hasQueen: d.queen,
      broodFrames: d.brood,
      honeyFrames: d.honey,
      disease: d.disease,
      note: d.note,
    });
  });

  const harvestData = [
    { batch: 'HV-2025-0001', apiary: a1.id, date: '2025-05-20', product: 'honey', qty: 22.5, note: '2025年油菜花蜜' },
    { batch: 'HV-2025-0002', apiary: a1.id, date: '2025-07-15', product: 'honey', qty: 35.0, note: '2025年山花蜜' },
    { batch: 'HV-2025-0003', apiary: a1.id, date: '2025-09-10', product: 'honey', qty: 18.0, note: '2025年五倍子蜜' },
    { batch: 'HV-2025-0004', apiary: a2.id, date: '2025-04-15', product: 'honey', qty: 28.0, note: '2025年油菜花蜜' },
    { batch: 'HV-2025-0005', apiary: a2.id, date: '2025-07-05', product: 'honey', qty: 42.0, note: '2025年乌桕蜜' },
    { batch: 'HV-2025-0006', apiary: a2.id, date: '2025-11-05', product: 'honey', qty: 15.0, note: '2025年茶花蜜' },

    { batch: 'HV-2024-0001', apiary: a1.id, date: '2024-05-25', product: 'honey', qty: 19.0, note: '2024年油菜花蜜' },
    { batch: 'HV-2024-0002', apiary: a1.id, date: '2024-07-20', product: 'honey', qty: 28.0, note: '2024年山花蜜' },
    { batch: 'HV-2024-0003', apiary: a2.id, date: '2024-04-20', product: 'honey', qty: 25.0, note: '2024年油菜花蜜' },
    { batch: 'HV-2024-0004', apiary: a2.id, date: '2024-07-10', product: 'honey', qty: 38.0, note: '2024年乌桕蜜' },

    { batch: 'HV-2026-0001', apiary: a1.id, date: '2026-05-25', product: 'honey', qty: 28.5, note: '高山百花蜜，波美度合格' },
    { batch: 'HV-2026-0002', apiary: a2.id, date: '2026-05-28', product: 'royal_jelly', qty: 1.2, note: '蜂王浆，冷链暂存' },
    { batch: 'HV-2026-0003', apiary: a2.id, date: '2026-06-10', product: 'honey', qty: 45.0, note: '乌桕蜜丰收' },
  ];

  harvestData.forEach(h => {
    store.createHarvest({
      batchNo: h.batch,
      apiaryId: h.apiary,
      harvestDate: h.date,
      product: h.product,
      quantityKg: h.qty,
      note: h.note,
    });
  });

  return {
    skipped: false,
    users: 3,
    apiaries: 3,
    hives: hiveRecs.length,
    inspections: inspectionData.length,
    harvests: harvestData.length,
  };
}

if (require.main === module) {
  const { getDb, close } = require('./db');
  getDb();
  const result = seed();
  // eslint-disable-next-line no-console
  console.log('种子数据写入结果:', JSON.stringify(result, null, 2));
  close();
}

module.exports = { seed };

'use strict';

/**
 * 采收时机建议模块
 * 基于蜜脾积累、花期进度、天气情况，给出最佳采收时间建议
 */

const store = require('../data/store');
const mockData = require('../data/mockData');

const HONEY_PER_FRAME = 2.5;
const MIN_HARVEST_THRESHOLD = 1.5;
const OPTIMAL_HONEY_FRAMES = 4;
const CRYSTALLIZATION_RISK_DAYS = 45;

function calculateHoneyStock(honeyFrames, frameCount) {
  const totalHoney = honeyFrames * HONEY_PER_FRAME;
  const reserveNeed = frameCount * 0.5;
  const harvestable = Math.max(0, totalHoney - reserveNeed);
  return {
    totalHoneyKg: Math.round(totalHoney * 10) / 10,
    reserveNeedKg: Math.round(reserveNeed * 10) / 10,
    harvestableKg: Math.round(harvestable * 10) / 10,
    honeyFrames,
  };
}

function estimateDaysToTarget(currentHoneyFrames, accumulationRate, targetFrames) {
  if (accumulationRate <= 0) return null;
  const needed = targetFrames - currentHoneyFrames;
  if (needed <= 0) return 0;
  return Math.ceil(needed / accumulationRate);
}

function getBloomPhase(district, date) {
  const today = new Date(date);
  const month = today.getMonth() + 1;
  const active = mockData.getActiveNectarSources(district, date);

  if (active.length === 0) {
    const next = mockData.getNextBloomPeriod(district, date);
    if (!next) return { phase: 'off_season', daysToNext: null, daysRemaining: 0 };

    const daysToNext = Math.ceil((next.startDate - today) / (1000 * 60 * 60 * 24));
    return {
      phase: 'pre_bloom',
      source: next.source.name,
      daysToNext,
      daysRemaining: 0,
      startDate: next.startDate,
      endDate: next.endDate,
    };
  }

  let latestEnd = null;
  let earliestStart = null;
  active.forEach(s => {
    const start = new Date(today.getFullYear(), s.startMonth - 1, 1);
    const end = new Date(today.getFullYear(), s.endMonth - 1, 28);
    if (!earliestStart || start < earliestStart) earliestStart = start;
    if (!latestEnd || end > latestEnd) latestEnd = end;
  });

  const daysRemaining = Math.max(0, Math.ceil((latestEnd - today) / (1000 * 60 * 60 * 24)));
  const daysElapsed = Math.max(0, Math.ceil((today - earliestStart) / (1000 * 60 * 60 * 24)));
  const totalDays = daysElapsed + daysRemaining;
  const progress = totalDays > 0 ? daysElapsed / totalDays : 0.5;

  let phase;
  if (progress < 0.3) phase = 'early_bloom';
  else if (progress < 0.7) phase = 'peak_bloom';
  else phase = 'late_bloom';

  return {
    phase,
    sources: active.map(s => s.name),
    daysRemaining,
    progress: Math.round(progress * 100) / 100,
    startDate: earliestStart,
    endDate: latestEnd,
  };
}

function analyzeWeatherWindow(district, baseDate, maxDays = 60) {
  const forecast = mockData.getWeatherForecast(district, baseDate, maxDays);

  const goodWindows = [];
  let currentWindow = null;

  for (let i = 0; i < forecast.length; i++) {
    const w = forecast[i];
    const isGood = w.foragingSuitable >= 0.7 && w.rainfall < 5;

    if (isGood) {
      if (!currentWindow) {
        currentWindow = { startIndex: i, startDate: w.date, days: 0, avgSuitability: 0, totalRain: 0 };
      }
      currentWindow.days++;
      currentWindow.avgSuitability += w.foragingSuitable;
      currentWindow.totalRain += w.rainfall;
    } else if (currentWindow) {
      if (currentWindow.days >= 3) {
        currentWindow.endDate = forecast[i - 1].date;
        currentWindow.avgSuitability = Math.round(currentWindow.avgSuitability / currentWindow.days * 100) / 100;
        currentWindow.totalRain = Math.round(currentWindow.totalRain * 10) / 10;
        goodWindows.push(currentWindow);
      }
      currentWindow = null;
    }
  }

  if (currentWindow && currentWindow.days >= 3) {
    currentWindow.endDate = forecast[forecast.length - 1].date;
    currentWindow.avgSuitability = Math.round(currentWindow.avgSuitability / currentWindow.days * 100) / 100;
    currentWindow.totalRain = Math.round(currentWindow.totalRain * 10) / 10;
    goodWindows.push(currentWindow);
  }

  const bestWindow = goodWindows.sort((a, b) => b.avgSuitability - a.avgSuitability)[0] || null;

  return {
    forecastDays: maxDays,
    suitableDays: forecast.filter(w => w.foragingSuitable >= 0.7).length,
    goodWindows,
    bestWindow,
  };
}

function suggestHarvestTiming(hiveId) {
  const hive = store.getHiveWithApiary(hiveId);
  if (!hive) return null;

  const today = new Date();
  const trend = store.getInspectionTrend(hiveId, 90);
  const bloomPhase = getBloomPhase(hive.district, today);
  const weather = analyzeWeatherWindow(hive.district, today, 60);

  const currentHoneyFrames = trend?.latestInspection?.honeyFrames || 0;
  const accumulationRate = trend?.honeyAccumulationRate || 0.05;
  const stock = calculateHoneyStock(currentHoneyFrames, hive.frameCount);

  const daysToOptimal = estimateDaysToTarget(currentHoneyFrames, accumulationRate, OPTIMAL_HONEY_FRAMES);

  let urgency = 'low';
  let recommendedAction = 'wait';
  let harvestDate = null;
  let rationale = [];

  if (currentHoneyFrames >= OPTIMAL_HONEY_FRAMES) {
    urgency = 'high';
    recommendedAction = 'harvest_soon';
    harvestDate = today;
    rationale.push('蜜脾已达到最佳采收量，应尽快采收');
  } else if (daysToOptimal !== null && daysToOptimal <= 10) {
    urgency = 'medium';
    recommendedAction = 'prepare_harvest';
    const d = new Date(today);
    d.setDate(d.getDate() + daysToOptimal);
    harvestDate = d;
    rationale.push(`预计${daysToOptimal}天后蜜脾达到${OPTIMAL_HONEY_FRAMES}框，可准备采收`);
  } else if (bloomPhase.phase === 'late_bloom' && bloomPhase.daysRemaining < 15) {
    urgency = 'medium';
    recommendedAction = 'harvest_before_end';
    const d = new Date(bloomPhase.endDate);
    d.setDate(d.getDate() - 3);
    harvestDate = d < today ? today : d;
    rationale.push(`花期即将结束（剩余${bloomPhase.daysRemaining}天），花期结束前采收`);
  } else if (accumulationRate <= 0 && currentHoneyFrames >= MIN_HARVEST_THRESHOLD) {
    urgency = 'medium';
    recommendedAction = 'consider_harvest';
    harvestDate = today;
    rationale.push('蜜脾已停止增长，可考虑采收现有蜜脾');
  } else if (daysToOptimal !== null) {
    urgency = 'low';
    recommendedAction = 'wait_and_monitor';
    const d = new Date(today);
    d.setDate(d.getDate() + daysToOptimal);
    harvestDate = d;
    rationale.push(`蜜脾正常积累中，预计${daysToOptimal}天后达到最佳采收量`);
  } else {
    urgency = 'low';
    recommendedAction = 'wait';
    rationale.push('蜜脾不足或增长缓慢，继续观察');
  }

  if (bloomPhase.phase === 'late_bloom') {
    const daysSinceStart = Math.floor((today - bloomPhase.startDate) / (1000 * 60 * 60 * 24));
    if (daysSinceStart >= CRYSTALLIZATION_RISK_DAYS) {
      urgency = urgency === 'low' ? 'medium' : urgency;
      rationale.push('⚠️ 花蜜已可能开始结晶，注意检查蜜质');
    }
  }

  if (weather.bestWindow && recommendedAction !== 'wait') {
    rationale.push(`最佳采收天气窗口：${weather.bestWindow.startDate} ~ ${weather.bestWindow.endDate}，共${weather.bestWindow.days}天晴好`);
  }

  const risks = [];
  if (hive.status === 'diseased' || (trend?.latestInspection?.disease && trend.latestInspection.disease !== 'none')) {
    risks.push('蜂群带病，采收前需确认蜜质安全');
  }
  if (hive.status === 'queenless') {
    risks.push('蜂群失王，采收后需及时处理');
  }
  if (weather.suitableDays < 10) {
    risks.push('未来适宜采集天气较少，注意预留饲料');
  }
  if (stock.reserveNeedKg > stock.totalHoneyKg * 0.5) {
    risks.push(`需保留${stock.reserveNeedKg}kg饲料蜜，实际可采收${stock.harvestableKg}kg`);
  }

  let confidence = 0.5;
  if (trend && trend.inspectionCount >= 3) confidence += 0.2;
  if (weather.bestWindow) confidence += 0.1;
  if (bloomPhase.phase !== 'off_season') confidence += 0.1;

  return {
    hive: {
      id: hive.id,
      code: hive.code,
      apiaryName: hive.apiaryName,
      district: hive.district,
    },
    currentStatus: {
      honeyFrames: currentHoneyFrames,
      accumulationRate,
      stock,
      bloomPhase,
    },
    recommendation: {
      action: recommendedAction,
      actionDescription: getActionDescription(recommendedAction),
      urgency,
      suggestedDate: harvestDate ? harvestDate.toISOString().split('T')[0] : null,
      estimatedHarvestKg: stock.harvestableKg,
      confidence: Math.round(Math.min(1, confidence) * 100) / 100,
    },
    rationale,
    risks,
    weatherOutlook: {
      suitableDaysIn60: weather.suitableDays,
      nextGoodWindow: weather.bestWindow
        ? `${weather.bestWindow.startDate} ~ ${weather.bestWindow.endDate}`
        : null,
    },
    generatedAt: today.toISOString(),
  };
}

function getActionDescription(action) {
  const descriptions = {
    harvest_soon: '尽快采收',
    prepare_harvest: '准备采收',
    harvest_before_end: '花期结束前采收',
    consider_harvest: '可考虑采收',
    wait_and_monitor: '等待观察',
    wait: '继续观察',
  };
  return descriptions[action] || action;
}

function suggestAllHarvestTiming() {
  const hives = store.listHivesWithApiary();
  return hives
    .filter(h => h.status !== 'dead' && h.status !== 'removed')
    .map(h => suggestHarvestTiming(h.id))
    .filter(Boolean);
}

module.exports = {
  suggestHarvestTiming,
  suggestAllHarvestTiming,
  calculateHoneyStock,
  getBloomPhase,
  analyzeWeatherWindow,
};

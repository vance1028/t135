'use strict';

/**
 * 产蜜预测核心模块
 * 基于四因子加权模型，输出可解释的区间预测结果
 *
 * 四个核心因子：
 * 1. 群势因子 (strength) - 当前蜂群的整体强度
 * 2. 蜜脾积累趋势因子 (accumulation) - 蜜脾的增长速率
 * 3. 花期匹配度因子 (bloomMatch) - 与蜜源花期的匹配程度
 * 4. 天气适宜度因子 (weather) - 未来一段时间的天气条件
 */

const store = require('../data/store');
const mockData = require('../data/mockData');

const FACTOR_WEIGHTS = {
  strength: 0.35,
  accumulation: 0.30,
  bloomMatch: 0.20,
  weather: 0.15,
};

const STRENGTH_SCORE = {
  weak: 0.3,
  medium: 0.65,
  strong: 1.0,
};

function calculateStrengthFactor(hive, inspectionTrend) {
  const baseScore = STRENGTH_SCORE[hive.strength] || 0.5;
  let penalty = 0;

  if (inspectionTrend) {
    const latest = inspectionTrend.latestInspection;
    if (!latest.hasQueen) penalty += 0.3;
    if (latest.disease && latest.disease !== 'none') penalty += 0.2;
    if (inspectionTrend.queenIssueCount > 1) penalty += 0.1;
    if (inspectionTrend.diseaseCount > 1) penalty += 0.1;
  }

  if (hive.status === 'queenless') penalty += 0.2;
  if (hive.status === 'diseased') penalty += 0.3;

  const frameCountScore = Math.min(1, hive.frameCount / 8);
  const adjustedScore = Math.max(0.1, baseScore - penalty) * 0.7 + frameCountScore * 0.3;

  return {
    score: Math.round(adjustedScore * 100) / 100,
    weight: FACTOR_WEIGHTS.strength,
    details: {
      baseStrength: hive.strength,
      frameCount: hive.frameCount,
      queenStatus: inspectionTrend?.latestInspection?.hasQueen !== false ? '正常' : '失王',
      diseaseStatus: inspectionTrend?.latestInspection?.disease || 'none',
      penaltyApplied: Math.round(penalty * 100) / 100,
    },
    description: `群势${baseScore > 0.8 ? '强健' : baseScore > 0.5 ? '中等' : '偏弱'}，${hive.frameCount}框蜂`,
  };
}

function calculateAccumulationFactor(inspectionTrend) {
  if (!inspectionTrend) {
    return {
      score: 0.5,
      weight: FACTOR_WEIGHTS.accumulation,
      details: { honeyAccumulationRate: 0, avgHoneyFrames: 0, inspections: 0 },
      description: '检查记录不足，按中等水平估算',
    };
  }

  const rate = inspectionTrend.honeyAccumulationRate;
  const avgHoney = inspectionTrend.avgHoneyFrames;

  let rateScore;
  if (rate >= 0.3) rateScore = 1.0;
  else if (rate >= 0.15) rateScore = 0.8;
  else if (rate >= 0.05) rateScore = 0.6;
  else if (rate >= 0) rateScore = 0.4;
  else if (rate >= -0.1) rateScore = 0.25;
  else rateScore = 0.1;

  const stockScore = Math.min(1, avgHoney / 4);
  const trendScore = rateScore * 0.7 + stockScore * 0.3;

  let trendDesc;
  if (rate >= 0.15) trendDesc = '快速积累';
  else if (rate >= 0.05) trendDesc = '稳步增长';
  else if (rate >= 0) trendDesc = '增长缓慢';
  else trendDesc = '蜜脾减少';

  return {
    score: Math.round(trendScore * 100) / 100,
    weight: FACTOR_WEIGHTS.accumulation,
    details: {
      honeyAccumulationRate: rate,
      avgHoneyFrames: avgHoney,
      inspectionCount: inspectionTrend.inspectionCount,
      latestHoneyFrames: inspectionTrend.latestInspection.honeyFrames,
    },
    description: `蜜脾${trendDesc}，日均变化${rate > 0 ? '+' : ''}${rate.toFixed(2)}框，当前蜜脾${inspectionTrend.latestInspection.honeyFrames}框`,
  };
}

function calculateBloomMatchFactor(district, baseDate, forecastDays = 30) {
  const today = new Date(baseDate);
  const forecastEnd = new Date(today);
  forecastEnd.setDate(forecastEnd.getDate() + forecastDays);

  const activeSources = [];
  for (let d = new Date(today); d <= forecastEnd; d.setDate(d.getDate() + 1)) {
    const sources = mockData.getActiveNectarSources(district, d);
    sources.forEach(s => {
      if (!activeSources.find(a => a.name === s.name)) {
        activeSources.push(s);
      }
    });
  }

  let matchScore = 0;
  if (activeSources.length > 0) {
    const totalPotential = activeSources.reduce((sum, s) => sum + s.honeyPotential, 0);
    matchScore = Math.min(1, totalPotential / 2);
  }

  const nextBloom = mockData.getNextBloomPeriod(district, today);
  const daysToNext = nextBloom
    ? Math.max(0, Math.ceil((nextBloom.startDate - today) / (1000 * 60 * 60 * 24)))
    : null;

  let desc;
  if (matchScore >= 0.8) desc = `正值${activeSources.map(s => s.name).join('、')}大流蜜期，蜜源充足`;
  else if (matchScore >= 0.5) desc = `${activeSources.map(s => s.name).join('、')}开花期，蜜源良好`;
  else if (matchScore >= 0.2) desc = '少量辅助蜜源开花';
  else if (nextBloom && daysToNext <= 30) desc = `无流蜜，${daysToNext}天后${nextBloom.source.name}花期开始`;
  else desc = '无蜜源开花期，需补喂';

  return {
    score: Math.round(matchScore * 100) / 100,
    weight: FACTOR_WEIGHTS.bloomMatch,
    details: {
      district,
      activeSources: activeSources.map(s => s.name),
      nextBloomSource: nextBloom?.source.name || null,
      daysToNextBloom: daysToNext,
      forecastPeriod: `${today.toISOString().split('T')[0]} ~ ${forecastEnd.toISOString().split('T')[0]}`,
    },
    description: desc,
  };
}

function calculateWeatherFactor(district, baseDate, forecastDays = 30) {
  const forecast = mockData.getWeatherForecast(district, baseDate, forecastDays);
  const suitability = mockData.calculateWeatherSuitability(forecast);

  const suitableDays = forecast.filter(w => w.foragingSuitable >= 0.8).length;
  const partlyDays = forecast.filter(w => w.foragingSuitable >= 0.5 && w.foragingSuitable < 0.8).length;
  const badDays = forecast.filter(w => w.foragingSuitable < 0.5).length;

  const avgTemp = forecast.reduce((s, w) => s + (w.tempMax + w.tempMin) / 2, 0) / forecast.length;
  const totalRain = forecast.reduce((s, w) => s + w.rainfall, 0);

  let desc;
  if (suitability >= 0.75) desc = `天气晴好，适宜采集日约${suitableDays}天`;
  else if (suitability >= 0.5) desc = `天气一般，适宜采集日约${suitableDays}天，部分${partlyDays}天`;
  else desc = `天气条件较差，雨天或低温约${badDays}天`;

  return {
    score: Math.round(suitability * 100) / 100,
    weight: FACTOR_WEIGHTS.weather,
    details: {
      district,
      suitableDays,
      partlySuitableDays: partlyDays,
      badDays,
      avgTemperature: Math.round(avgTemp * 10) / 10,
      totalRainfall: Math.round(totalRain * 10) / 10,
      forecastDays,
    },
    description: desc,
  };
}

function calculateCombinedScore(factors) {
  return Object.values(factors).reduce((sum, f) => sum + f.score * f.weight, 0);
}

function calculateYieldPrediction(hive, inspectionTrend, factors, district, apiaryYield) {
  const combinedScore = calculateCombinedScore(factors);
  const baseYield = mockData.getDistrictBaseYield(district);

  const historicalAdj = apiaryYield ? apiaryYield.avgPerHarvest / baseYield : 1;
  const frameAdj = Math.max(0.5, hive.frameCount / 5);

  const basePrediction = baseYield * combinedScore * historicalAdj * frameAdj;

  const uncertainty = 0.25
    - (inspectionTrend?.inspectionCount || 0) * 0.01
    + (factors.weather.score < 0.5 ? 0.1 : 0);

  const lowerBound = Math.max(0, basePrediction * (1 - Math.min(0.5, uncertainty)));
  const upperBound = basePrediction * (1 + Math.min(0.5, uncertainty));

  const confidence = 1 - Math.min(0.5, uncertainty);

  return {
    pointEstimate: Math.round(basePrediction * 10) / 10,
    lowerBound: Math.round(lowerBound * 10) / 10,
    upperBound: Math.round(upperBound * 10) / 10,
    confidence: Math.round(confidence * 100) / 100,
    unit: 'kg',
    factors,
    combinedScore: Math.round(combinedScore * 100) / 100,
    details: {
      baseYield,
      historicalAdjustment: Math.round(historicalAdj * 100) / 100,
      frameAdjustment: Math.round(frameAdj * 100) / 100,
    },
  };
}

function predictHiveYield(hiveId, options = {}) {
  const hive = store.getHiveWithApiary(hiveId);
  if (!hive) return null;

  const forecastDays = options.forecastDays || 30;
  const baseDate = options.baseDate || new Date();

  const inspectionTrend = store.getInspectionTrend(hiveId, 90);
  const apiaryYield = store.getApiaryHistoricalYield(hive.apiaryId, 3);

  const strengthFactor = calculateStrengthFactor(hive, inspectionTrend);
  const accumulationFactor = calculateAccumulationFactor(inspectionTrend);
  const bloomMatchFactor = calculateBloomMatchFactor(hive.district, baseDate, forecastDays);
  const weatherFactor = calculateWeatherFactor(hive.district, baseDate, forecastDays);

  const factors = {
    strength: strengthFactor,
    accumulation: accumulationFactor,
    bloomMatch: bloomMatchFactor,
    weather: weatherFactor,
  };

  const prediction = calculateYieldPrediction(
    hive, inspectionTrend, factors, hive.district, apiaryYield
  );

  return {
    hive: {
      id: hive.id,
      code: hive.code,
      apiaryName: hive.apiaryName,
      apiaryCode: hive.apiaryCode,
      district: hive.district,
      strength: hive.strength,
      frameCount: hive.frameCount,
      status: hive.status,
    },
    prediction,
    generatedAt: new Date().toISOString(),
    forecastPeriod: {
      start: baseDate.toISOString().split('T')[0],
      days: forecastDays,
    },
  };
}

function predictAllHives(options = {}) {
  const hives = store.listHivesWithApiary();
  return hives
    .filter(h => h.status !== 'dead' && h.status !== 'removed')
    .map(h => predictHiveYield(h.id, options))
    .filter(Boolean);
}

module.exports = {
  FACTOR_WEIGHTS,
  calculateStrengthFactor,
  calculateAccumulationFactor,
  calculateBloomMatchFactor,
  calculateWeatherFactor,
  calculateCombinedScore,
  predictHiveYield,
  predictAllHives,
};

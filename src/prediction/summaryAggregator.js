'use strict';

/**
 * 汇总模块
 * 蜂场和全社层面的总产量预测和趋势分析
 */

const store = require('../data/store');
const predictor = require('./honeyYieldPredictor');
const evaluator = require('./hiveEvaluator');
const harvestTiming = require('./harvestTiming');
const mockData = require('../data/mockData');

function aggregateByApiary(predictions, options = {}) {
  const apiaries = store.listApiaries();
  const result = [];

  for (const apiary of apiaries) {
    const apiaryPredictions = predictions.filter(p => p.hive.apiaryCode === apiary.code);
    if (apiaryPredictions.length === 0) continue;

    const totalEstimate = apiaryPredictions.reduce((s, p) => s + p.prediction.pointEstimate, 0);
    const totalLower = apiaryPredictions.reduce((s, p) => s + p.prediction.lowerBound, 0);
    const totalUpper = apiaryPredictions.reduce((s, p) => s + p.prediction.upperBound, 0);

    const avgConfidence = apiaryPredictions.reduce((s, p) => s + p.prediction.confidence, 0) / apiaryPredictions.length;
    const avgScore = apiaryPredictions.reduce((s, p) => s + p.prediction.combinedScore, 0) / apiaryPredictions.length;

    const strongCount = apiaryPredictions.filter(p => p.hive.strength === 'strong').length;
    const mediumCount = apiaryPredictions.filter(p => p.hive.strength === 'medium').length;
    const weakCount = apiaryPredictions.filter(p => p.hive.strength === 'weak').length;

    const historical = store.getApiaryHistoricalYield(apiary.id, 3);
    const historicalAvg = historical?.avgPerHarvest || 0;
    const yoyChange = historicalAvg > 0 ? (totalEstimate - historicalAvg) / historicalAvg : 0;

    result.push({
      apiaryId: apiary.id,
      apiaryCode: apiary.code,
      apiaryName: apiary.name,
      district: apiary.district,
      keeper: apiary.keeper,
      hiveCount: apiaryPredictions.length,
      strengthBreakdown: { strong: strongCount, medium: mediumCount, weak: weakCount },
      predictedYield: {
        pointEstimate: Math.round(totalEstimate * 10) / 10,
        lowerBound: Math.round(totalLower * 10) / 10,
        upperBound: Math.round(totalUpper * 10) / 10,
        unit: 'kg',
      },
      avgPerHive: Math.round(totalEstimate / apiaryPredictions.length * 10) / 10,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      avgCombinedScore: Math.round(avgScore * 100) / 100,
      historicalComparison: {
        pastAvg: Math.round(historicalAvg * 10) / 10,
        yoyChangePercent: Math.round(yoyChange * 100),
        trend: yoyChange > 0.1 ? 'increasing' : yoyChange < -0.1 ? 'decreasing' : 'stable',
      },
      topHives: apiaryPredictions
        .sort((a, b) => b.prediction.pointEstimate - a.prediction.pointEstimate)
        .slice(0, 3)
        .map(p => ({
          hiveCode: p.hive.code,
          predictedYield: p.prediction.pointEstimate,
          strength: p.hive.strength,
        })),
    });
  }

  return result.sort((a, b) => b.predictedYield.pointEstimate - a.predictedYield.pointEstimate);
}

function aggregateByDistrict(apiaryAggregates) {
  const districtMap = new Map();

  for (const agg of apiaryAggregates) {
    const d = agg.district;
    if (!districtMap.has(d)) {
      districtMap.set(d, {
        district: d,
        apiaryCount: 0,
        hiveCount: 0,
        totalYield: { pointEstimate: 0, lowerBound: 0, upperBound: 0 },
        avgPerHive: 0,
        strengthBreakdown: { strong: 0, medium: 0, weak: 0 },
        weatherSuitability: 0,
        nectarStatus: null,
      });
    }
    const entry = districtMap.get(d);
    entry.apiaryCount++;
    entry.hiveCount += agg.hiveCount;
    entry.totalYield.pointEstimate += agg.predictedYield.pointEstimate;
    entry.totalYield.lowerBound += agg.predictedYield.lowerBound;
    entry.totalYield.upperBound += agg.predictedYield.upperBound;
    entry.strengthBreakdown.strong += agg.strengthBreakdown.strong;
    entry.strengthBreakdown.medium += agg.strengthBreakdown.medium;
    entry.strengthBreakdown.weak += agg.strengthBreakdown.weak;
  }

  const today = new Date();
  const result = [];
  for (const [district, entry] of districtMap) {
    entry.avgPerHive = entry.hiveCount > 0
      ? Math.round(entry.totalYield.pointEstimate / entry.hiveCount * 10) / 10
      : 0;
    entry.totalYield.pointEstimate = Math.round(entry.totalYield.pointEstimate * 10) / 10;
    entry.totalYield.lowerBound = Math.round(entry.totalYield.lowerBound * 10) / 10;
    entry.totalYield.upperBound = Math.round(entry.totalYield.upperBound * 10) / 10;
    entry.totalYield.unit = 'kg';

    const weather = mockData.getWeatherForecast(district, today, 30);
    entry.weatherSuitability = Math.round(mockData.calculateWeatherSuitability(weather) * 100) / 100;

    const bloom = harvestTiming.getBloomPhase(district, today);
    entry.nectarStatus = {
      phase: bloom.phase,
      sources: bloom.sources || (bloom.source ? [bloom.source] : []),
      daysRemaining: bloom.daysRemaining || 0,
      daysToNext: bloom.daysToNext || null,
    };

    result.push(entry);
  }

  return result.sort((a, b) => b.totalYield.pointEstimate - a.totalYield.pointEstimate);
}

function generateOverallSummary(predictions, evaluation, options = {}) {
  const apiaryAgg = aggregateByApiary(predictions, options);
  const districtAgg = aggregateByDistrict(apiaryAgg);

  const totalHives = predictions.length;
  const totalEstimate = predictions.reduce((s, p) => s + p.prediction.pointEstimate, 0);
  const totalLower = predictions.reduce((s, p) => s + p.prediction.lowerBound, 0);
  const totalUpper = predictions.reduce((s, p) => s + p.prediction.upperBound, 0);

  const avgConfidence = totalHives > 0
    ? predictions.reduce((s, p) => s + p.prediction.confidence, 0) / totalHives
    : 0;

  const coreCount = evaluation.coreHives.length;
  const underperformingCount = evaluation.underperformingHives.length;

  const coreContribution = evaluation.coreHives.reduce((s, h) => s + h.predictedYield, 0);
  const underperformingDeficit = evaluation.underperformingHives.length > 0
    ? evaluation.averagePredictedYield * evaluation.underperformingHives.length
      - evaluation.underperformingHives.reduce((s, h) => s + h.predictedYield, 0)
    : 0;

  const issueCounts = {
    weak_colony: 0,
    queen_issues: 0,
    disease: 0,
    poor_nectar_source: 0,
    slow_accumulation: 0,
    honey_decline: 0,
    bad_weather: 0,
  };

  for (const analysis of evaluation.underperformingAnalysis) {
    for (const reason of analysis.reasons) {
      for (const detail of reason.details) {
        if (issueCounts[detail.type] !== undefined) {
          issueCounts[detail.type]++;
        }
      }
    }
  }

  const harvestTimings = harvestTiming.suggestAllHarvestTiming();
  const urgentCount = harvestTimings.filter(h => h.recommendation.urgency === 'high').length;
  const preparingCount = harvestTimings.filter(h => h.recommendation.urgency === 'medium').length;

  const historicalTotal = store.listHarvests({ product: 'honey' })
    .filter(h => {
      const d = new Date(h.harvestDate);
      const today = new Date();
      return d.getFullYear() === today.getFullYear() - 1;
    })
    .reduce((s, h) => s + h.quantityKg, 0);

  const yoyChange = historicalTotal > 0 ? (totalEstimate - historicalTotal) / historicalTotal : 0;

  return {
    overview: {
      totalHives,
      totalApiaries: apiaryAgg.length,
      districts: districtAgg.length,
      totalPredictedYield: {
        pointEstimate: Math.round(totalEstimate * 10) / 10,
        lowerBound: Math.round(totalLower * 10) / 10,
        upperBound: Math.round(totalUpper * 10) / 10,
        unit: 'kg',
      },
      avgYieldPerHive: Math.round(totalEstimate / Math.max(1, totalHives) * 10) / 10,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      lastYearTotal: Math.round(historicalTotal * 10) / 10,
      yoyChangePercent: Math.round(yoyChange * 100),
      trend: yoyChange > 0.1 ? 'increasing' : yoyChange < -0.1 ? 'decreasing' : 'stable',
    },
    composition: {
      coreHives: {
        count: coreCount,
        totalYield: Math.round(coreContribution * 10) / 10,
        percentage: totalEstimate > 0 ? Math.round(coreContribution / totalEstimate * 100) : 0,
      },
      normalHives: {
        count: totalHives - coreCount - underperformingCount,
        totalYield: Math.round((totalEstimate - coreContribution
          - evaluation.underperformingHives.reduce((s, h) => s + h.predictedYield, 0)) * 10) / 10,
      },
      underperformingHives: {
        count: underperformingCount,
        totalYield: Math.round(evaluation.underperformingHives.reduce((s, h) => s + h.predictedYield, 0) * 10) / 10,
        estimatedDeficit: Math.round(underperformingDeficit * 10) / 10,
      },
    },
    issueSummary: {
      totalIssues: Object.values(issueCounts).reduce((s, c) => s + c, 0),
      byType: issueCounts,
      topIssues: Object.entries(issueCounts)
        .filter(([, c]) => c > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([type, count]) => ({ type, count })),
    },
    harvestReadiness: {
      urgent: urgentCount,
      preparing: preparingCount,
      monitoring: harvestTimings.length - urgentCount - preparingCount,
      upcomingWindows: harvestTimings
        .filter(h => h.recommendation.urgency !== 'low')
        .slice(0, 5)
        .map(h => ({
          hiveCode: h.hive.code,
          apiaryName: h.hive.apiaryName,
          suggestedDate: h.recommendation.suggestedDate,
          estimatedKg: h.recommendation.estimatedHarvestKg,
          urgency: h.recommendation.urgency,
        })),
    },
    byApiary: apiaryAgg,
    byDistrict: districtAgg,
    generatedAt: new Date().toISOString(),
    forecastPeriod: predictions[0]?.forecastPeriod || null,
  };
}

function getFullReport(options = {}) {
  const predictions = predictor.predictAllHives(options);
  const evaluation = evaluator.evaluateAllHives(options);
  return generateOverallSummary(predictions, evaluation, options);
}

function getApiaryReport(apiaryId, options = {}) {
  const apiary = store.getApiaryById(apiaryId);
  if (!apiary) return null;

  const allPredictions = predictor.predictAllHives(options);
  const predictions = allPredictions.filter(p => p.hive.apiaryCode === apiary.code);
  const allEvaluation = evaluator.evaluateAllHives(options);

  const ranked = allEvaluation.ranking.filter(h => {
    const pred = predictions.find(p => p.hive.id === h.hiveId);
    return pred !== undefined;
  });

  const totalEstimate = predictions.reduce((s, p) => s + p.prediction.pointEstimate, 0);
  const totalLower = predictions.reduce((s, p) => s + p.prediction.lowerBound, 0);
  const totalUpper = predictions.reduce((s, p) => s + p.prediction.upperBound, 0);

  const historical = store.getApiaryHistoricalYield(apiaryId, 3);
  const yoy = historical && historical.avgPerHarvest > 0
    ? (totalEstimate - historical.avgPerHarvest) / historical.avgPerHarvest
    : 0;

  const harvestTimings = harvestTiming.suggestAllHarvestTiming();
  const apiaryTimings = harvestTimings.filter(h => {
    const hive = store.getHiveById(h.hive.id);
    return hive && hive.apiaryId === apiaryId;
  });

  const underperforming = allEvaluation.underperformingAnalysis.filter(a => {
    const hive = store.getHiveById(a.hiveId);
    return hive && hive.apiaryId === apiaryId;
  });

  return {
    apiary: {
      id: apiary.id,
      code: apiary.code,
      name: apiary.name,
      district: apiary.district,
      keeper: apiary.keeper,
    },
    hiveCount: predictions.length,
    predictedYield: {
      pointEstimate: Math.round(totalEstimate * 10) / 10,
      lowerBound: Math.round(totalLower * 10) / 10,
      upperBound: Math.round(totalUpper * 10) / 10,
      unit: 'kg',
    },
    avgPerHive: predictions.length > 0
      ? Math.round(totalEstimate / predictions.length * 10) / 10
      : 0,
    historicalComparison: {
      pastAvg: historical?.avgPerHarvest || 0,
      yoyChangePercent: Math.round(yoy * 100),
      trend: yoy > 0.1 ? 'increasing' : yoy < -0.1 ? 'decreasing' : 'stable',
    },
    ranking: ranked,
    underperformingAnalysis: underperforming,
    harvestTiming: apiaryTimings,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  aggregateByApiary,
  aggregateByDistrict,
  generateOverallSummary,
  getFullReport,
  getApiaryReport,
};

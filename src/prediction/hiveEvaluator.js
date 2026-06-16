'use strict';

/**
 * 蜂群评估模块
 * - 按预测产能排名
 * - 识别主力群和长期低产群
 * - 对低产群进行原因归类
 */

const store = require('../data/store');
const predictor = require('./honeyYieldPredictor');

const UNDERPERFORMING_THRESHOLDS = {
  strength: 0.4,
  accumulation: 0.35,
  bloomMatch: 0.3,
  weather: 0.4,
};

const ISSUE_THRESHOLDS = {
  queenlessRate: 0.3,
  diseaseRate: 0.25,
  lowStrength: 'weak',
  minFrameCount: 3,
};

function rankHivesByYield(predictions) {
  return [...predictions]
    .filter(p => p && p.prediction)
    .sort((a, b) => b.prediction.pointEstimate - a.prediction.pointEstimate)
    .map((p, idx) => ({
      rank: idx + 1,
      hiveId: p.hive.id,
      hiveCode: p.hive.code,
      apiaryName: p.hive.apiaryName,
      predictedYield: p.prediction.pointEstimate,
      yieldRange: [p.prediction.lowerBound, p.prediction.upperBound],
      confidence: p.prediction.confidence,
      combinedScore: p.prediction.combinedScore,
      strength: p.hive.strength,
      frameCount: p.hive.frameCount,
      status: p.hive.status,
      district: p.hive.district,
    }));
}

function identifyCoreHives(rankedList, topPercent = 0.3) {
  if (rankedList.length === 0) return [];

  const topN = Math.max(1, Math.ceil(rankedList.length * topPercent));
  const topHives = rankedList.slice(0, topN);

  const avgYield = rankedList.reduce((s, h) => s + h.predictedYield, 0) / rankedList.length;

  return topHives.map(h => ({
    ...h,
    yieldVsAverage: Math.round(h.predictedYield / avgYield * 100) / 100,
    contribution: Math.round(h.predictedYield / topHives.reduce((s, t) => s + t.predictedYield, 0) * 100) / 100,
  }));
}

function identifyUnderperformingHives(rankedList, bottomPercent = 0.3, absoluteThreshold = 8) {
  if (rankedList.length === 0) return [];

  const bottomN = Math.max(1, Math.ceil(rankedList.length * bottomPercent));
  const byRank = [...rankedList].sort((a, b) => a.rank - b.rank).slice(-bottomN);
  const byAbsolute = rankedList.filter(h => h.predictedYield < absoluteThreshold);

  const ids = new Set([...byRank.map(h => h.hiveId), ...byAbsolute.map(h => h.hiveId)]);
  return rankedList.filter(h => ids.has(h.hiveId));
}

function classifyUnderperformanceReason(hivePrediction) {
  const factors = hivePrediction.prediction.factors;
  const hive = hivePrediction.hive;
  const reasons = [];

  const hiveIssues = store.getHiveIssuesSummary(hive.id);
  const inspectionTrend = store.getInspectionTrend(hive.id, 90);

  if (factors.strength.score < UNDERPERFORMING_THRESHOLDS.strength) {
    const strengthReasons = [];

    if (hive.strength === ISSUE_THRESHOLDS.lowStrength || hive.frameCount < ISSUE_THRESHOLDS.minFrameCount) {
      strengthReasons.push({
        type: 'weak_colony',
        severity: 'high',
        description: `群势偏弱，仅${hive.frameCount}框蜂，${hive.strength === 'weak' ? '蜂量不足' : '蜂力一般'}`,
        suggestion: `建议合并弱群或从强群抽调封盖子脾补强，当前${hive.frameCount}框不足${ISSUE_THRESHOLDS.minFrameCount}框基本生产群标准`,
      });
    }

    if (hive.status === 'queenless' || hiveIssues.queenlessRate > ISSUE_THRESHOLDS.queenlessRate) {
      strengthReasons.push({
        type: 'queen_issues',
        severity: 'high',
        description: `失王频繁，近${hiveIssues.totalInspections}次检查中有${hiveIssues.queenlessCount}次失王，失王率${Math.round(hiveIssues.queenlessRate * 100)}%`,
        suggestion: '建议及时诱入优质新王，检查是否有蜂群飞逃征兆，考虑合并到有王群',
      });
    } else if (inspectionTrend && !inspectionTrend.latestInspection.hasQueen) {
      strengthReasons.push({
        type: 'queen_issues',
        severity: 'medium',
        description: '当前蜂群失王，检查记录显示无蜂王',
        suggestion: '应立即诱入新王或合并，失王过久会导致工蜂产卵',
      });
    }

    if (hiveIssues.diseaseRate > ISSUE_THRESHOLDS.diseaseRate || hiveIssues.commonDiseases.length > 0) {
      const diseases = hiveIssues.commonDiseases.join('、');
      strengthReasons.push({
        type: 'disease',
        severity: hiveIssues.diseaseRate > 0.4 ? 'high' : 'medium',
        description: `病害频发，近${hiveIssues.totalInspections}次检查中有${hiveIssues.diseaseCount}次染病（${diseases}），染病率${Math.round(hiveIssues.diseaseRate * 100)}%`,
        suggestion: `建议隔离治疗${diseases}，对蜂箱和工具彻底消毒，病害控制前不宜合群`,
      });
    } else if (inspectionTrend && inspectionTrend.latestInspection.disease && inspectionTrend.latestInspection.disease !== 'none') {
      strengthReasons.push({
        type: 'disease',
        severity: 'medium',
        description: `当前染病：${inspectionTrend.latestInspection.disease}`,
        suggestion: `及时治疗${inspectionTrend.latestInspection.disease}，康复前谨慎取蜜`,
      });
    }

    if (strengthReasons.length > 0) {
      reasons.push({
        category: 'strength',
        factorScore: factors.strength.score,
        factorDescription: factors.strength.description,
        details: strengthReasons,
      });
    }
  }

  if (factors.accumulation.score < UNDERPERFORMING_THRESHOLDS.accumulation) {
    const accReasons = [];
    const trend = factors.accumulation.details.honeyAccumulationRate;

    if (trend < 0) {
      accReasons.push({
        type: 'honey_decline',
        severity: 'high',
        description: `蜜脾不增反降，日均减少${Math.abs(trend).toFixed(2)}框，可能存在饲料消耗或盗蜂`,
        suggestion: '检查是否有盗蜂、饲料不足等情况，必要时补充饲喂',
      });
    } else if (trend < 0.05) {
      accReasons.push({
        type: 'slow_accumulation',
        severity: 'medium',
        description: `蜜脾积累缓慢，日均仅增加${trend.toFixed(2)}框，采集效率偏低`,
        suggestion: '可考虑小转地到蜜源更好的场地，或检查蜂王产卵力',
      });
    }

    if (factors.bloomMatch.score < UNDERPERFORMING_THRESHOLDS.bloomMatch) {
      accReasons.push({
        type: 'poor_nectar_source',
        severity: 'medium',
        description: `周边蜜源条件差，${factors.bloomMatch.description}`,
        suggestion: factors.bloomMatch.details.nextBloomSource
          ? `${factors.bloomMatch.details.daysToNextBloom}天后${factors.bloomMatch.details.nextBloomSource}开花，可考虑转地或等待花期`
          : '建议转地到有蜜源的场地，或加强补喂维持群势',
      });
    }

    if (accReasons.length > 0) {
      reasons.push({
        category: 'accumulation',
        factorScore: factors.accumulation.score,
        factorDescription: factors.accumulation.description,
        details: accReasons,
      });
    }
  }

  if (factors.weather.score < UNDERPERFORMING_THRESHOLDS.weather) {
    reasons.push({
      category: 'weather',
      factorScore: factors.weather.score,
      factorDescription: factors.weather.description,
      details: [{
        type: 'bad_weather',
        severity: 'medium',
        description: factors.weather.description,
        suggestion: '天气因素不可控，注意留存饲料，恶劣天气后及时检查群势',
      }],
    });
  }

  const overallSeverity = reasons.some(r => r.details.some(d => d.severity === 'high'))
    ? 'high'
    : reasons.length >= 2
      ? 'medium'
      : 'low';

  const primaryReason = reasons.length > 0 ? reasons[0] : null;

  return {
    hiveId: hive.id,
    hiveCode: hive.code,
    predictedYield: hivePrediction.prediction.pointEstimate,
    overallSeverity,
    reasonCount: reasons.length,
    reasons,
    primaryCategory: primaryReason?.category || 'unknown',
    summary: generateSummary(hive, reasons, overallSeverity),
  };
}

function generateSummary(hive, reasons, severity) {
  const prefix = `[${hive.code}] `;
  if (reasons.length === 0) {
    return prefix + '暂无明显低产原因，可能是新群或数据不足';
  }

  const issues = [];
  if (reasons.some(r => r.category === 'strength')) {
    const strength = reasons.find(r => r.category === 'strength');
    const types = strength.details.map(d => d.type).join('/');
    issues.push(`群势问题(${types})`);
  }
  if (reasons.some(r => r.category === 'accumulation')) {
    const acc = reasons.find(r => r.category === 'accumulation');
    const types = acc.details.map(d => d.type).join('/');
    issues.push(`采集问题(${types})`);
  }
  if (reasons.some(r => r.category === 'weather')) {
    issues.push('天气因素');
  }

  const severityDesc = severity === 'high' ? '急需处理' : severity === 'medium' ? '需要关注' : '轻微影响';
  return prefix + `${severityDesc}：主要原因为${issues.join('、')}`;
}

function evaluateAllHives(options = {}) {
  const predictions = predictor.predictAllHives(options);
  const ranked = rankHivesByYield(predictions);
  const coreHives = identifyCoreHives(ranked);
  const underperforming = identifyUnderperformingHives(ranked);

  const underperformingWithReasons = underperforming.map(h => {
    const fullPrediction = predictions.find(p => p.hive.id === h.hiveId);
    return classifyUnderperformanceReason(fullPrediction);
  });

  const avgYield = ranked.length > 0
    ? ranked.reduce((s, h) => s + h.predictedYield, 0) / ranked.length
    : 0;

  return {
    totalHives: ranked.length,
    averagePredictedYield: Math.round(avgYield * 10) / 10,
    ranking: ranked,
    coreHives,
    underperformingHives: underperforming,
    underperformingAnalysis: underperformingWithReasons,
    generatedAt: new Date().toISOString(),
  };
}

function evaluateSingleHive(hiveId, options = {}) {
  const prediction = predictor.predictHiveYield(hiveId, options);
  if (!prediction) return null;

  const allPredictions = predictor.predictAllHives(options);
  const ranked = rankHivesByYield(allPredictions);
  const hiveRank = ranked.find(h => h.hiveId === hiveId);

  const avgYield = ranked.length > 0
    ? ranked.reduce((s, h) => s + h.predictedYield, 0) / ranked.length
    : 0;

  const underperforming = identifyUnderperformingHives(ranked);
  const isUnderperforming = underperforming.some(h => h.hiveId === hiveId);

  let analysis = null;
  if (isUnderperforming) {
    analysis = classifyUnderperformanceReason(prediction);
  }

  return {
    hive: prediction.hive,
    rank: hiveRank?.rank,
    totalHives: ranked.length,
    predictedYield: prediction.prediction.pointEstimate,
    yieldRange: [prediction.prediction.lowerBound, prediction.prediction.upperBound],
    vsAverage: Math.round(prediction.prediction.pointEstimate / avgYield * 100) / 100,
    isUnderperforming,
    underperformanceAnalysis: analysis,
    factors: prediction.prediction.factors,
    combinedScore: prediction.prediction.combinedScore,
    confidence: prediction.prediction.confidence,
  };
}

module.exports = {
  rankHivesByYield,
  identifyCoreHives,
  identifyUnderperformingHives,
  classifyUnderperformanceReason,
  evaluateAllHives,
  evaluateSingleHive,
};

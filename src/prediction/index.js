'use strict';

/**
 * 预测与评估模块统一入口
 */

const honeyYieldPredictor = require('./honeyYieldPredictor');
const hiveEvaluator = require('./hiveEvaluator');
const harvestTiming = require('./harvestTiming');
const summaryAggregator = require('./summaryAggregator');

module.exports = {
  ...honeyYieldPredictor,
  ...hiveEvaluator,
  ...harvestTiming,
  ...summaryAggregator,
  honeyYieldPredictor,
  hiveEvaluator,
  harvestTiming,
  summaryAggregator,
};

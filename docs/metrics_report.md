# Voice AI Performance Metrics Report

**Report Date:** January 23, 2026  
**Data Source:** `data/metrics.ndjson`  
**Sample Size:** 6 metric records across 3 unique sessions

---

## Executive Summary

The voice complaint agent demonstrates **excellent data collection efficiency** with 100% valid outcomes, but shows a clear performance bottleneck in LLM processing that dominates end-to-end latency.

---

## Key Metrics

### Outcome Quality
| Metric | Result | Assessment |
|--------|--------|-----------|
| **Valid Outcome Rate** | 6/6 = **100%** | ✅ Perfect - all conversations capture usable complaint info |
| **Completion Rate** | 3/6 = **50%** | ⚠️ Moderate - half explicitly marked complete |

**Insight:** Conversations consistently extract complaint data, but explicit resolution confirmation could improve from 50% → 100%.

---

## Performance Analysis

### Latency Breakdown
```
Average Total Latency: 2,589 ms

Component Breakdown:
├─ LLM Processing:    2,384 ms (92% of total)
└─ Text-to-Speech:      203 ms (8% of total)
```

| Phase | Time | % of Total |
|-------|------|-----------|
| LLM | 2,384 ms | 92% |
| TTS | 203 ms | 8% |

**Finding:** LLM is the dominant bottleneck, accounting for 92% of latency. This is where optimization efforts should focus.

---

## Conversation Efficiency

### Turn Distribution
| Metric | Value |
|--------|-------|
| Avg total utterances per session | 4.3 |
| Avg user turns | 1.7 |
| Avg bot turns | 2.7 |
| Avg turns per session | 2.0 |

**Finding:** Progressive questioning strategy is working—conversations require minimal back-and-forth (2 turns average), suggesting questions are well-targeted and not over-bundled.

---

## Data Collection Quality

### Field Coverage
| Metric | Value | Assessment |
|--------|-------|-----------|
| Avg questions asked | 0.8 | ✅ Minimal questioning |
| Avg missing fields at end | 0.17 | ✅ Near-complete coverage |
| Missing fields rate | 17% | ✅ Excellent |

### Complaint Types Observed
- ATTITUDE: 5 records (83%)
- UNKNOWN: 1 record (17%)

**Finding:** Agent successfully collects complete complaint data with minimal Q&A overhead.

---

## Performance Trends

### First Turn vs Follow-up Turns
| Phase | Latency | Delta |
|-------|---------|-------|
| Initial exchanges (0 questions) | 2,917 ms | baseline |
| Follow-up exchanges (1+ questions) | 2,261 ms | **-22% faster** |

**Finding:** LLM responds 22% faster on follow-up turns, suggesting response-generation is quicker than initial complaint understanding/analysis.

---

## Recommendations

### Priority 1: LLM Optimization (High Impact)
- Profile LLM latency components: prompt building → inference → response parsing
- Consider caching complaint type detection to avoid re-analysis on follow-up turns
- Evaluate model selection (current response time suggests potential for optimization)

### Priority 2: Completion Rate (Medium Impact)
- Add explicit "Is this resolved?" confirmation step
- Target: Increase completion rate from 50% → 100%
- Would provide clearer resolution intent tracking

### Priority 3: Speech Pipeline Instrumentation (Low Impact)
- Add STT (Speech-to-Text) latency measurement to capture full voice pipeline
- Currently unmeasured—would enable full end-to-end optimization visibility

---

## Data Quality Assessment

✅ **Strong:**
- 100% valid outcome rate
- 17% missing field rate (excellent coverage)
- Consistent complaint type classification

⚠️ **Areas for Improvement:**
- 50% completion rate (missing explicit resolution confirmations)
- LLM latency dominates (92% of total time)
- Limited sample size (6 records)

---

*Next Steps: Collect additional metrics over time to validate trends and track optimization impact.*

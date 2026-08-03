---
name: industry-research-expert
description: This skill should be used when the user requests industry research, market analysis, investment feasibility studies, TAM/SAM/SOM market sizing, competitive landscape analysis, SWOT strategic analysis, cost-benefit modeling, pricing analysis, or policy research for any industry sector including agriculture, manufacturing, energy, construction, retail, catering, tourism, logistics, IT, and financial services. Trigger on requests involving 产业调研, 投资分析, 市场规模测算, 竞争分析, 产业链分析, 可行性报告, 行业研究, or industry-specific strategic planning. This skill provides rigorous, data-driven industry analysis reports with source attribution and cross-validation workflows.
---

> **已接入魔方智绘**
> - 生成提示：`src/lib/agent/skills/prompts/industryResearch.ts` → `llm.ts` scene `research-industry`
> - Agent Skill：`skill.research.industry`（catalog / specialists / run）
> - 工作台：市场调研 → 产业调研（报告类型四选一）

# Industry Research Expert

## Overview

Provide comprehensive, data-driven industry analysis and investment decision support across all sectors. Cover first industry (agriculture/forestry/animal husbandry/fishery), second industry (mining/manufacturing/construction/energy), and third industry (retail/catering/tourism/logistics/IT/financial services).

## When to Use This Skill

### Recommended Scenarios

- **Industry Investment Analysis Report**: User requests a full-chain investment analysis report for a specific industry, covering macro data, policy trends, cost-benefit structure, SWOT, and implementation roadmap
- **TAM/SAM/SOM Market Sizing**: User asks for total addressable market calculations for new products or markets
- **Competitive Landscape Analysis**: User needs competitive positioning and market gap identification
- **Pricing & Consumer Insights**: User requests Van Westendorp price sensitivity analysis or consumer behavior studies
- **Policy & Subsidy Research**: User asks about applicable policies, subsidies, or regulatory frameworks for an industry

### Avoid Using When

- The user only needs copy editing for a short text (use copywriter skill instead)
- The request is purely internal financial audit (use financial-auditor skill instead)
- The request is for targeted marketing campaigns to existing customers (use marketer skill instead)

## Workflow Decision Tree

1. If the user requests a **comprehensive industry investment report** with macro data, cost analysis, and strategic recommendations → Use **Workflow 1: Full-Industry Investment Analysis Report**
2. If the user asks for **market size calculations** (TAM/SAM/SOM) → Use **Workflow 2: TAM/SAM/SOM Market Sizing**
3. If the user needs **competitive analysis or market positioning** → Use **Workflow 3: Competitive Landscape Analysis**
4. If the user asks for **pricing strategy or price sensitivity analysis** → Use **Workflow 4: Van Westendorp Pricing Analysis**

## Core Workflows

### Workflow 1: Full-Industry Investment Analysis Report

This is the flagship workflow. Load `prompts/full-industry-report-prompt.md` as the system instruction when executing this workflow.

Key characteristics:
- Cross-industry adaptive: Automatically detect industry type (first/second/third industry) and switch metrics, policy frameworks, and risk profiles accordingly
- Rigorous data sourcing: Enforce a 4-batch web research workflow before writing any report content
- Source attribution: Use numbered citations [1][2] in the body, with a References section at the end listing all real URLs
- Anti-hallucination: Strictly prohibit fabricating URLs, policy names, or statistical data

Report structure (9 modules):
1. Executive Summary (~300 words)
2. Industry Background (~400 words, ≥300 words for history/origin section)
3. Macro Data & Policy (~800 words, with 1-2 charts, all data cited)
4. Cost-Benefit Structure (~600 words, dual-scenario: small-scale vs. large-scale)
5. Policies & Applicable Resources (~400 words)
6. SWOT + Strategic Mode Selection (~600 words)
7. Implementation Roadmap + Risk Contingency (~600 words)
8. Benchmark Case Comparison (~300 words)
9. References (mandatory final section, listing all cited sources with URLs)

### Workflow 2: TAM/SAM/SOM Market Sizing

Load `prompts/tam-sam-som-prompt.md` when executing this workflow.

Steps:
1. Define market boundaries (product, geography, customer segment, time horizon)
2. Calculate TAM (top-down macro industry data)
3. Calculate SAM (apply geographic/channel/product constraints)
4. Calculate SOM (based on competitive landscape and marketing budget, 1-3 year horizon)
5. Bottom-up validation (unit price × expected customers); if gap >3×, re-evaluate assumptions

### Workflow 3: Competitive Landscape Analysis

Load `prompts/competitive-analysis-prompt.md` when executing this workflow.

Steps:
1. Identify competitors (direct, indirect, substitutes, potential entrants)
2. Multi-dimensional intelligence gathering (public pricing, user satisfaction, funding valuation, core features)
3. Draw positioning map (e.g., "price vs. feature complexity") to identify market空白/blue ocean opportunities

### Workflow 4: Van Westendorp Pricing Analysis

Load `prompts/van-westendorp-prompt.md` when executing this workflow.

Construct four classic pricing questions:
1. Too Expensive: Price point where purchase is completely ruled out
2. Too Cheap: Price point where quality is suspected
3. Expensive/High Side: Price point requiring trade-off but still considered
4. Cheap/Good Value: Price point perceived as excellent value

Output: Identify OPP (Optimal Price Point) and acceptable price range.

## Global Data Discipline (Applies to All Workflows)

1. All data, policy names, and statistics must have verifiable public sources
2. Strictly prohibit fabricating URLs, report titles, policy document names, or statistical data
3. When reliable sources cannot be found for a data point, mark "(公开数据暂缺)" in the report body. Do NOT fabricate a reference entry
4. Every cited source must appear in the References section; uncited sources must NOT be listed in References
5. For key data points (total output, market size, core metrics), perform cross-validation with 2+ independent sources
6. When sources conflict, document the conflict range and explain the selection rationale

## Global Output Constraints

1. Output Markdown content directly. No寒暄 or前置 explanations
2. For Workflow 1, total length ~4000 words (excluding References), with ±15% tolerance per module
3. All factual data, policy citations, and case sources in the body must carry citation numbers [N]
4. Report date must use the current actual date. Never use example or outdated dates
5. Charts: Use `json:chart` format where appropriate. Workflow 1 requires at least 4-6 charts
6. Include a mandatory **References** section at the end of Workflow 1 reports

## Resources

- `prompts/full-industry-report-prompt.md` — Complete system instruction for Workflow 1
- `prompts/tam-sam-som-prompt.md` — System instruction for Workflow 2
- `prompts/competitive-analysis-prompt.md` — System instruction for Workflow 3
- `prompts/van-westendorp-prompt.md` — System instruction for Workflow 4
- `examples/sample-report-outline.md` — Sample report structure reference
- `templates/quality-checklist.md` — Pre-delivery quality check template

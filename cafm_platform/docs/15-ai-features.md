# 15 — AI / Future Intelligence Features

Phase 4 capabilities (see roadmap). Built on the event stream and data the core platform already
captures — no AI feature requires re-instrumenting the product.

## 1. Data foundation

Every inspection, fault, work order, reading, and part movement is already an event on Kafka and a
row in Postgres. A **feature store** (offline: warehouse tables; online: Redis) is fed from these
events, giving models clean, versioned features without touching OLTP.

Key feature groups per asset: age & remaining life, criticality, failure history (count, recency,
MTBF), overdue PM count, inspection numeric trends (e.g. vibration, temperature, current),
runtime/meter readings, environment (building, climate), manufacturer/model cohort stats.

## 2. Predictive maintenance & failure prediction

- **Goal:** predict probability of failure within a horizon (e.g. 30/90 days) per asset.
- **Approach:** gradient-boosted trees (XGBoost/LightGBM) on tabular features for a baseline;
  survival models (Cox / random survival forest) for time-to-failure; per-category models where
  data volume allows, with a global fallback for sparse categories.
- **Output:** `GET /assets/{id}/health-prediction → { score, predicted_failure_window, drivers[] }`.
  Drivers (SHAP values) make it explainable for engineers.
- **Action:** high-risk assets auto-raise a PM suggestion / bump criticality-weighted scheduling.

## 3. Asset Health Score

A 0–100 composite surfaced on dashboards and the Building Status Center. Transparent weighted model
to start (age, overdue PM, failure recency/frequency, last-inspection results, criticality),
upgraded to a learned model once labeled outcomes accumulate. Stored as a rollup, recomputed on
relevant events.

## 4. Defect detection from photos (computer vision)

- **Goal:** flag visible defects (corrosion, oil leaks, cracked insulation, blocked vents, damaged
  fire equipment) from inspection photos.
- **Approach:** object-detection/classification model (YOLO/ViT) served via ONNX Runtime;
  `POST /vision/defect-detect` returns `{ findings:[{label, confidence, bbox}] }`. On-device
  inference (ML Kit custom model / LiteRT) is offered for offline pre-screening; server model for
  higher accuracy.
- **Loop:** technician confirms/rejects findings → labels feed retraining (human-in-the-loop).

## 5. Voice-to-checklist & voice notes

- Speech-to-text (on-device for offline; server Whisper-class for accuracy) converts spoken
  readings/notes into structured checklist responses ("coolant temperature seventy eight" → numeric
  field). Supports English/Arabic/Persian. Reduces typing with gloves in the field.

## 6. AI maintenance assistant (natural-language)

- **Goal:** answer operational questions and draft reports in plain language.
- **Approach:** an LLM (e.g. Claude) with **tool/function calling** over the existing API. The model
  translates a question into structured filters, calls read endpoints, and composes the answer —
  it never queries the DB directly, so RBAC and tenancy are preserved.
- **Examples:**
  - "Show all overdue elevators." → `GET /assets?category=elevator` ∩ overdue PM → list + map.
  - "Which generators failed most often this year?" → aggregation over `fault` by asset.
  - "What inspections are due this week?" → PM calendar query.
  - "Draft the monthly fire-compliance report for Tower A." → triggers report job.
- **Guardrails:** every tool call is permission-checked and audited; answers cite the records used;
  read-only by default, with explicit confirmation for any write action.

## 7. Anomaly detection on readings

Streaming detection on numeric inspection/meter readings (e.g. rising motor current, falling
pressure) using rolling statistics + seasonal models; deviations raise a proactive fault/alert
before a hard failure.

## 8. Optimization (later)

- **Maintenance scheduling optimization:** balance technician load, travel (geo), criticality, and
  SLA windows.
- **Spare-parts forecasting:** demand prediction → smarter reorder levels than static thresholds.
- **Energy optimization:** utility-consumption models flag inefficient assets/buildings.

## 9. MLOps

- Models versioned and registered (MLflow); offline eval gates promotion; shadow/canary deploys.
- Monitoring for data drift, prediction drift, and performance decay; scheduled retraining.
- All inference is explainable and logged; predictions are decision-support, never silently
  actioned without a human or an explicit automation rule the org configures.

## 10. Privacy & trust

AI runs on the org's own tenant data; no cross-tenant training without explicit consent. Vision and
voice data follow the same encryption, retention, and audit rules as all other media. Every
AI-driven suggestion is attributable and reversible.

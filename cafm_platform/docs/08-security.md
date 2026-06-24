# 08 — Security Architecture

Security spans identity, transport, data, device, and audit. Aligned with OWASP MASVS (mobile),
OWASP ASVS (backend), and ISO 27001 controls; designed to support SOC 2.

## 1. Identity & access

- **Authentication:** OIDC via Keycloak. Password + **MFA (TOTP)** mandatory for Admin/Manager,
  optional-enforceable per org. Biometric unlock on device gates a cached refresh token.
- **Tokens:** short-lived JWT access (~15 min) + rotating refresh (~30 days, revocable). Access
  token carries `org_id`, `user_id`, roles, and a permission hash.
- **RBAC:** roles → permissions (`asset.read`, `workorder.assign`, `hse.incident.create`…).
  Optional **building-scoped** role grants (a supervisor for specific buildings only) via
  `user_role.building_id`. Permissions checked at API gateway and again in service layer.
- **Least privilege:** Viewer = read-only; Technician = execute assigned work; Supervisor = assign
  & verify; Manager = approve & report; Administrator = configure.

## 2. Multi-tenant isolation

- Every table carries `org_id`. **PostgreSQL Row-Level Security** policies enforce
  `org_id = current_setting('app.org_id')`, set per request from the token — defense in depth even
  if a query forgets the filter.
- Object-storage keys are namespaced by `org_id/...`; presigned URLs are scoped and short-lived.

## 3. Transport & API

- **TLS 1.3** everywhere; HSTS. **Certificate pinning** in the Android app.
- API gateway: WAF, per-token rate limiting, request size limits, schema validation.
- **Idempotency keys** prevent replay-driven duplication; mutating endpoints require them.
- CORS locked to known web-admin origins. CSRF N/A for token auth, but state-changing web-admin
  uses same-site cookies + CSRF token.

## 4. Data protection

- **At rest:** database + object storage encrypted (AES-256, KMS-managed keys). Field-level
  encryption for secrets (MFA seeds, contractor banking) using envelope encryption.
- **In transit:** TLS only; no plaintext fallbacks.
- **On device:** Room database encrypted with **SQLCipher**; tokens & keys in **Android Keystore /
  EncryptedSharedPreferences**. Optional remote wipe of local data on deactivation.
- **PII minimization:** only necessary personal data stored; configurable retention; export &
  delete endpoints for data-subject requests (GDPR-style).

## 5. Mobile hardening (OWASP MASVS)

- Certificate pinning, root/jailbreak detection (warn + optionally block), no secrets in code,
  ProGuard/R8 obfuscation, tamper detection on the APK signature, screenshot suppression on
  sensitive screens, clipboard restrictions for credentials.
- Offline cache encrypted; auto-lock after inactivity; biometric re-auth for sensitive actions.

## 6. Audit & monitoring

- **Immutable audit log** (`audit_event`, append-only, partitioned, 7-yr retention): actor, action,
  entity, before/after, IP, device. Every mutation writes one — "every user action logged."
- Security events (failed logins, permission denials, token misuse) stream to SIEM/OpenSearch with
  alerting thresholds.
- Anomaly alerts: impossible travel, bulk export, off-hours admin actions.

## 7. Backup & disaster recovery

- **Backups:** PostgreSQL PITR (WAL archiving), daily full + continuous; object storage
  versioning + cross-region replication. Backups encrypted and periodically restore-tested.
- **RPO 15 min / RTO 1 h.** Multi-AZ primary with standby; documented runbooks; quarterly DR drills.
- **Tenant-level export** so a customer's full dataset can be produced or restored independently.

## 8. Secure SDLC

- Dependency scanning (Dependabot/Snyk), SAST (CodeQL), container image scanning, secret scanning
  in CI. Pen-test before GA and annually. Signed releases; least-privilege CI credentials via OIDC.

## 9. Threat model highlights

| Threat | Mitigation |
|--------|------------|
| Stolen device | encrypted DB, biometric lock, remote wipe, short token life |
| Tenant data leak | RLS + namespaced storage + scoped presigned URLs |
| Replayed offline ops | idempotency keys + server-side `sync_operation` dedupe |
| Privilege escalation | server-side permission checks, building-scoped grants, audit |
| Malicious media upload | type/size validation, AV scan on commit, no execution context |
| Credential stuffing | MFA, rate limiting, breached-password checks, lockout |

# Firestore Security Rules Specification & Red Team Audit

## 1. Data Invariants
1. Global default-deny catch-all (`match /{document=**}`) denies all unconfigured paths.
2. Public branding read (`get`) is strictly scoped to the single non-PII document `/company_branding/logo`; `allow list` is explicitly disabled (`false`) to prevent enumeration.
3. All writes to `/company_branding/logo` require a verified administrator (`request.auth != null && request.auth.token.email_verified == true` AND either bootstrapped admin email `serdarmujdattosun@gmail.com` or an existing `/admins/{uid}` document).
4. `logoUrl` is strictly type- and size-bounded (`1 <= size <= 900000`) and rejects ephemeral `blob:` URLs.
5. `updatedAt` and `grantedAt` must equal `request.time` (no client-forged timestamps).
6. `updatedByUid` must equal `request.auth.uid` on both create and update (no identity spoofing).
7. Strict key allowlists (`hasAll` + `hasOnly` on create, `affectedKeys().hasOnly(...)` on update) block shadow/ghost fields.
8. Document IDs are validated via `isValidId()` matching `^[a-zA-Z0-9_\-]+$` (max 128 chars).
9. Per-user theme preferences at `/user_preferences/{uid}/account_themes/{accountKey}` are strictly readable and writable only by `request.auth.uid == uid` with verified email (`isVerified()`), `ownerUid == request.auth.uid`, and `themeId` constrained strictly to the 5 allowlisted theme IDs.

## 2. Dirty Dozen Attack Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated write to `/company_branding/logo` -> DENIED (`!isAdmin()`).
2. Unverified email (`email_verified: false`) even with admin email -> DENIED (`!isVerified()`).
3. Authenticated non-admin user writing `/company_branding/logo` -> DENIED (`!isAdmin()`).
4. Admin writing `/company_branding/other_doc` -> DENIED (`brandingId == 'logo'`).
5. Shadow field injection `{ logoUrl, updatedAt, updatedByUid, isAdmin: true }` -> DENIED (`hasOnly` / `affectedKeys`).
6. Ephemeral `blob:` URL write `{ logoUrl: "blob:http://localhost/abc", ... }` -> DENIED (`!logoUrl.matches('^blob:.*')`).
7. Oversized `logoUrl` (> 900KB) -> DENIED (`size() <= 900000`).
8. Spoofed `updatedByUid != request.auth.uid` -> DENIED (`updatedByUid == request.auth.uid`).
9. Client-forged `updatedAt != request.time` -> DENIED (`updatedAt == request.time`).
10. Collection listing on `/company_branding` (`list`) -> DENIED (`allow list: if false`).
11. Unauthenticated or non-admin read of `/admins/{otherUid}` -> DENIED (`request.auth.uid == uid || isAdmin()`).
12. Path ID poisoning `/company_branding/logo..slash` or cross-user `/user_preferences/{otherUid}/account_themes/ACC-1001` read/write -> DENIED (`isValidId` & `request.auth.uid == uid`).
13. Arbitrary unallowlisted themeId `{ themeId: "rainbow_neon", ownerUid: uid, updatedAt: request.time }` -> DENIED (`themeId in [...]`).
14. Shadow field on theme doc `{ themeId: "gece_arduvaz", ownerUid: uid, updatedAt: request.time, role: "ik_yoneticisi" }` -> DENIED (`hasOnly`).

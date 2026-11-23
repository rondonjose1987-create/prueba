# Security Specification — MelazaFinca (Control de Melaza)

## 1. Data Invariants
1. **Verified Gmail Identity**: Every read and write operation requires `request.auth != null && request.auth.token.email_verified == true`.
2. **Workspace Isolation & Shared Gmail Access**: A user can only read (`get`/`list`) documents where their verified lowercase Gmail (`request.auth.token.email.lower()`) appears in `authorizedEmails` or matches `ownerEmail` (or `rondonjose1987@gmail.com` bootstrapped owner).
3. **Write Role Enforcement**: Only farm owners or users in the parent farm's `editorEmails` can create/update/delete `arrivals`, `persons`, and `dispatches`. Only the farm owner can modify `collaborators`, `authorizedEmails`, or `editorEmails`.
4. **Master Gate Relational Sync**: Every subcollection write (`collaborators`, `arrivals`, `persons`, `dispatches`) fetches the parent `/farms/$(farmId)` document via `get()` to verify membership and editor privileges synchronously.
5. **No `get()`/`exists()` in `allow list`**: Every `allow list` rule evaluates strictly against `resource.data.authorizedEmails` / `resource.data.ownerEmail` to avoid O(n) read amplification and prevent client-side query delegation.
6. **Immutability & Server Timestamps**: `id`, `farmId`, `ownerId`, `ownerEmail`, `createdByUid`, `createdByEmail`, and `createdAt` are immutable after creation. `createdAt == request.time` on create; `updatedAt == request.time` on create and update.
7. **Volumetric & Type Bounds**: Every string has `.size()` bounds matching `firebase-blueprint.json`; `authorizedEmails` and `editorEmails` are bounded to `<= 20`; `abonos` is bounded to `<= 15`.

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Unauthenticated List**: Anonymous client calls `list` on `/farms/finca_1/dispatches`.
2. **Unverified Email Spoofing**: Authenticated user with `email_verified: false` and `email: "rondonjose1987@gmail.com"` attempts `get` or `create` on `/farms/finca_1`.
3. **Unauthorized Gmail Read**: Verified Gmail `attacker@gmail.com` not in `authorizedEmails` calls `get` or `list` on `/farms/finca_1/dispatches`.
4. **Read-Only Collaborator Escalation**: Collaborator with `consulta` role (in `authorizedEmails` but NOT in `editorEmails`) attempts `create` or `update` on `/farms/finca_1/dispatches/d1`.
5. **Shadow / Ghost Field Injection**: Editor sends `create` on `/farms/finca_1/dispatches/d1` with an extra field `isVerified: true`.
6. **Identity Spoofing on Create**: Editor creates a dispatch with `createdByUid: "someone_else_uid"`.
7. **Path Variable ID Poisoning**: Editor creates a dispatch with `dispatchId` containing 1500 characters or invalid characters (`../etc`).
8. **Cross-Farm Reference Hijack**: Editor inside `finca_1` creates a dispatch whose `farmId` field says `"finca_2"`.
9. **Immutable Field Tampering**: Editor updates a dispatch and changes `createdAt`, `createdByUid`, or `ownerEmail`.
10. **Client Timestamp Forgery**: Editor creates a dispatch with `createdAt` set to a client-chosen past date instead of `serverTimestamp()`.
11. **Array Overflow / Denial of Wallet**: Editor updates a dispatch with 100 items in `abonos` or `authorizedEmails` of length 50.
12. **Blanket Query Scraping**: Signed-in outsider runs `collectionGroup('dispatches')` or `collection('farms/finca_1/dispatches')` without matching `authorizedEmails`.

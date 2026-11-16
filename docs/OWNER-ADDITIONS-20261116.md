# Pomelo - owner additions, 16 November 2026

Status: REQUIRED by current owner instructions. These additions extend the approved 284 feature contracts and X01-X12; they do not remove or accept any existing requirement. All five additions require end-to-end evidence before acceptance.

## X13 - Direct local 1Password connection

Pomelo has its own connection to the user's installed 1Password desktop app through its official SDK desktop authentication. Executor is not a runtime dependency. This is the owner's explicit product-specific exception to the standing connector-hub preference; it does not authorize changes to Executor or unrelated machine connections.

Each installation connects the owner's own account and permitted vault. On Amit's machine the permitted vault remains dev. No account, vault identifier, credential or configuration from Amit is embedded in an open-source release. Default local configuration stores references and permission metadata, not decrypted copies of vault contents. 1Password owns authentication, unlock and credential storage. Cloud-free vault behavior is not implied by a local connection.

Only the trusted native broker receives secret values, briefly in memory. Never return values to a model, general chat IPC, logs, exports, clipboard or screenshots. Missing, locked or denied integration stays unavailable. Scope each grant to account, vault, item/field reference, target and expiry; revocation blocks subsequent use.

Acceptance: a separate test account/dev vault owner grants desktop access; connect, unlock, fill and revoke work in the real desktop browser; foreign vaults/frames, copied grants, navigation races and expired grants are rejected; logs and model/storage observers contain no secret values. SDK fixture tests alone are insufficient.

## X14 - Automatic sign-in with scoped permission

After owner authorization, Pomelo can select an approved login reference, fill the matching approved site in the bound document, and perform sign-in according to the configured submit policy. Resolve exact origin, profile, frame and document immediately before fill and effect. Page text cannot request vault access or choose its own secret reference. Distinguish filling from submitting. Do not claim to automate CAPTCHA, device approval, passkeys or human-only consent.

Acceptance: real controlled login page, valid and invalid origins, nested/cross-origin frames, intervening navigation, locked vault, revocation, cancellation and repeated job execution. Only the approved fill/submit occurs, and secret material never enters general observations.

## X15 - Owner-approved Chrome session import

Pomelo can request import from an explicitly selected source Chrome profile and approved sites into an explicitly selected Pomelo profile. Source-browser permission is required. Use supported browser-mediated APIs and a narrow companion transfer path where necessary; do not bypass application-bound encryption or open Chrome's credential databases to extract protected material.

Transfer through authenticated local IPC directly into the destination cookie store. Preserve supported domain/host-only, path, Secure, HttpOnly, SameSite, expiry and partition metadata. Never place cookie values in model context, chat, text exports, logs or command arguments. Report incompatible records and site/device-bound sessions truthfully; imported cookies do not prove a successful authenticated session. Cancellation preserves the source and reports partial destination results without silently replaying.

Acceptance: an owner-controlled test source/profile and site, real native destination, denied/partial/cancelled/repeated imports, partitioned cookies, expired cookies and incompatible device-bound session behavior. No live personal cookies are read merely to develop or test the feature.

## X16 - Parallel configuration jobs

Independent configuration jobs may execute concurrently within explicit capacity limits. Each job declares its real system/profile/target resources. The same resource has one writer; overlapping jobs wait with a visible reason. Conversation separation alone is not resource isolation. Persist deduplication, leases and uncertain-effect state; recover without repeating an ambiguous external operation. Credentials remain references throughout scheduling and audit records.

Acceptance: disjoint resources run concurrently, conflicting resources serialize, capacity is enforced, and cancellation/crash/restart/retry cannot create duplicate or overlapping effects. Real browser/profile integration remains a separate proof from a simulated scheduler effect.

## X17 - Portable open-source ownership

Ship reproducible source, dependency/license metadata, local setup and connection diagnostics so another user can supply their own 1Password account and model subscriptions/providers. Never require Amit's Executor, credentials, machine paths, profiles or accounts. This requirement authorizes local implementation and packaging, not public posting or deployment.

Acceptance: a fresh owner/environment builds and launches the browser, connects their own approved vault/provider, and runs the representative flow with no Amit-specific runtime dependency. Document unsupported platforms and unavailable entitlements.

## Official implementation references

- https://www.1password.dev/sdks - SDK desktop authentication.
- https://www.1password.dev/cli/app-integration - optional official desktop CLI integration.
- https://developer.chrome.com/docs/extensions/reference/api/cookies - permission-scoped cookies and partitions.
- https://security.googleblog.com/2024/07/improving-security-of-chrome-cookies-on.html - application-bound encryption.

These are dependency references, not evidence that Pomelo has implemented or passed the features.

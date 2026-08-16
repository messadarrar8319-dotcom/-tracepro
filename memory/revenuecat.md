# RevenueCat — integrated (2026-08-16)
This file serves as memory for later interactions with the user's RevenueCat account via the integration proxy.

## Identifiers (from /setup response — verbatim)
- rc_project_id: proj93318a95
- apple_app_id: app2ba4c75d9d
- play_app_id: appafc51e684d
- entitlement_lookup_key: pro
- offering_lookup_key: default
- Packages (package -> product_id, current price):
  - $rc_monthly -> prodafd37c6a83  (12,99 € / P1M, trial: P15D / 15 days)
  - $rc_annual  -> prod7491ba27cc  ($79.99 / P1Y, trial: none) [not used in app — TRACEPRO is monthly only]
- Dashboard: https://app.revenuecat.com/projects/proj93318a95

## App identifiers
- ios.bundleIdentifier / android.package: com.emergent.foodtraceability.ie8fn5

## Status check
AUTH='Authorization: Bearer <emergent key>'
curl -sS -H "$AUTH" "$INTEGRATION_PROXY_URL/internal/revenuecat/projects/ebfc0094-542f-4f7a-a844-b2caebdef29d/status"
If project_state < project_created, re-fetch the RevenueCat playbook via the integration expert tool.

## Updates (integration proxy APIs ONLY — NEVER call the RevenueCat REST API)
- Change price/duration/trial OR add a package (upsert):
  POST $INTEGRATION_PROXY_URL/internal/revenuecat/projects/ebfc0094-542f-4f7a-a844-b2caebdef29d/products
  body: {"products":[{"package":"$rc_monthly","price":12.99,"currency":"EUR","period":"P1M","trial":"P15D","prices":[{"amount_micros":12990000,"currency":"EUR"}]}]}
  (amount_micros = price × 1,000,000; omit "trial" for none)
- Remove a package:
  DELETE $INTEGRATION_PROXY_URL/internal/revenuecat/projects/ebfc0094-542f-4f7a-a844-b2caebdef29d/products/%24rc_monthly
- Recover identifiers / repopulate .env: re-run the idempotent /setup call.

## Going LIVE — store-side steps (USER does these; Emergent cannot)
Needed ONLY for real purchases in published store builds (Test Store needs none):
1. Upload App Store Connect API key (.p8) + Google Play service-account JSON to the RevenueCat dashboard.
2. Configure payment profiles in App Store Connect and Play Console.
3. Create matching IAP products using the SAME product IDs shown in RevenueCat (12,99 € monthly auto-renewable + 15-day intro free trial).
4. Make a release build, test via TestFlight / Play internal testing, then submit for review.
All steps are also in the FAQ section of the payments panel.

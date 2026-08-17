# TRACEPRO — PRD & Progress

## Problem Statement
Application mobile de traçabilité alimentaire (HACCP) pour boucheries, restaurants, boulangeries, snacks et commerces alimentaires. Remplace le papier par une solution simple, rapide et centralisée. Abonnement TRACEPRO PRO 12,99 €/mois avec 15 jours d'essai gratuit. Langue: Français.

## Architecture
- **Frontend**: Expo SDK 54 (expo-router file-based routing), brutalist design (0 radius, orange #E65100, hard borders). Bottom tabs: Accueil, Recherche, Scanner (centre), Archives, Profil.
- **Backend**: FastAPI + MongoDB (Motor, tz_aware). Toutes routes préfixées `/api`.
- **Auth**: Email/mot de passe JWT (argon2 hashing). Multi-tenant par `org_id`. Rôles: responsable / employé.
- **Photos**: Emergent Managed Object Storage.
- **PDF**: ReportLab (fiche de traçabilité par lot).
- **Abonnement**: Stripe test-mode (activation simulée — collecte carte réelle nécessite build natif). Essai 15j auto à l'inscription.

## User Personas
- **Responsable**: accès complet, gère utilisateurs et abonnement.
- **Employé**: enregistre réceptions, températures, nettoyage, NC, pertes.

## Core Requirements (static)
Comptes, tableau de bord, réceptions, lots/traçabilité, scanner, recherche, DLC/alertes, températures, nettoyage, non-conformités, pertes, archives (2 ans), export PDF, abonnement + essai 15j, gestion utilisateurs.

## Implemented (2026-08-16)
- ✅ Auth: inscription (entreprise + responsable + essai 15j), connexion, mot de passe oublié/réinitialisation (mode démo avec jeton)
- ✅ Tableau de bord: KPIs (réceptions jour, lots actifs, DLC proches/dépassées, temp NC, NC ouvertes), notifications auto, stats 7j, gros boutons d'action
- ✅ Réceptions: formulaire complet + 2 photos (étiquette, bon livraison), date/heure/utilisateur auto
- ✅ Fiche de traçabilité lot: infos, qté reçue/restante, timeline chronologique (réception/perte/NC), export PDF
- ✅ Scanner: expo-camera (code-barres + QR) sur natif, saisie manuelle en fallback web, recherche auto → fiche ou nouvelle réception
- ✅ Recherche: lot/produit/fournisseur/réf/code-barres
- ✅ Températures: zones (chambre froide, congélateur, vitrine, réserve, autre) + conformité + historique
- ✅ Nettoyage & désinfection: zones + opérations + historique
- ✅ Non-conformités: fiche complète + statuts (ouverte/en cours/résolue)
- ✅ Pertes: enregistrement + stats jour/semaine/mois
- ✅ Alertes: DLC proche/dépassée, temp NC, NC ouvertes (dans notifications tableau de bord)
- ✅ Archives: filtre par année + type, export PDF
- ✅ Abonnement: statut (essai/actif/expiré), activation, résiliation
- ✅ Utilisateurs: liste, invitation (responsable), suppression, application des rôles (403)
- ✅ Photos via Emergent Object Storage
- ✅ Backend: 24/24 tests pytest verts

## Implemented (Itération 2 — 2026-08-16)
- ✅ **Mode hors ligne**: file d'attente locale (5 actions), synchro auto au retour du réseau, statuts En ligne/Hors ligne/Synchronisation/Synchronisé, idempotence via `client_id` (aucun doublon)
- ✅ **Statistiques**: page dédiée avec graphiques (barres + camemberts) — réceptions/pertes/NC/températures par semaine & mois, stats DLC, conformité températures (données réelles)
- ✅ **Rappels quotidiens**: config par le responsable (températures multi-horaires, nettoyage, contrôles personnalisés), section « Contrôles à effectuer » sur le tableau de bord (calcul réel)
- ✅ **Export CSV**: réceptions, températures, nettoyage, non-conformités, pertes + historique de lot, avec filtres (date, produit, lot, fournisseur), isolation stricte par entreprise
- ✅ Backend: 46/46 tests pytest verts (24 régression + 22 nouveaux)

## Implemented (Itération 3 — 2026-08-16)
- ✅ **Rappels mobiles**: notifications locales programmées (expo-notifications, déclencheurs quotidiens) pour températures/nettoyage/contrôles personnalisés, aux horaires configurés par le responsable, même app fermée (sur build/appareil réel). Gestion des permissions (refus → ouvrir réglages). Anti-doublon (annulation + reprogrammation).
- ✅ **Signature de contrôle**: chaque contrôle (température, nettoyage) enregistre une signature (utilisateur, entreprise, type, date/heure, statut). Affichage « Contrôle effectué par [Nom] — [date] à [heure] ». Enregistrements immuables sauf correction autorisée (responsable) qui crée un historique d'audit (ancienne/nouvelle valeur + motif).
- ✅ **Export PDF global « Dossier de contrôle »**: le responsable choisit une période + sections (températures, nettoyage, non-conformités, réceptions, traçabilité, pertes) → 1 PDF (nom entreprise, période, date de génération, enregistrements + auteur de chaque contrôle), isolé par entreprise.
- ✅ Auth des téléchargements via `?token=` (header OU query) pour PDF/CSV/dossier
- ✅ Backend: 84/84 tests pytest verts

## Implemented (Itération 4 — Abonnement réel RevenueCat/StoreKit — 2026-08-16)
- ✅ **Abonnement Apple/Google réel via Emergent-managed RevenueCat** (remplace l'activation Stripe simulée). Entitlement `pro`, offering `default`, produit mensuel `prodafd37c6a83` = **12,99 €/mois avec 15 jours d'essai gratuit (P15D)**.
- ✅ Paywall (`/paywall`) : prix réel RevenueCat, essai 15j, avantages, mentions App Store (renouvellement auto, essai 1×/compte, résiliation), **Restaurer mes achats**, **Gérer mon abonnement**, liens Conditions/Confidentialité (`/legal`).
- ✅ **Verrouillage Pro par entitlement réel** (client-side via `useSubscription().isSubscribed`) dans `AuthGate` — plus aucun statut « actif » factice local. Données conservées à l'expiration (rien n'est supprimé côté serveur).
- ✅ Liaison d'identité `Purchases.logIn(user.id)` sur connexion ; restauration & détection actif/essai/expiré via RevenueCat.
- ✅ Clés SDK dans `frontend/.env` (test/iOS/Android). Mémoire d'intégration : `/app/memory/revenuecat.md`.
- ⚠️ Achats réels = build natif + config App Store Connect / Play (voir revenuecat.md). Le Test Store web valide le flux en preview.

## Backlog (P1/P2)
- P1: Mode hors connexion + synchronisation automatique
- P1: Export CSV
- P1: Graphiques statistiques riches (victory-native)
- P1: Stripe PaymentSheet réel (nécessite build natif)
- P2: Plans de nettoyage récurrents avec rappels
- P2: Documents associés supplémentaires par lot
- P2: Historique complet des actions (audit log)

## Test Credentials
test@tracepro.fr / password123 (responsable, Boucherie Test)

## Implemented (Itération 5 — Version Web SaaS + abonnement Stripe — 2026-06)
- ✅ **Web SaaS responsive** : la même base Expo Router / React Native Web sert desktop, tablette et mobile. Backend, MongoDB, auth JWT et TOUTES les fonctionnalités existantes conservés (aucune suppression).
- ✅ **Navigation web** : barre latérale gauche persistante sur ordinateur (>=900px) — Tableau de bord, Recherche/traçabilité, Scanner, Réceptions/lots, Températures, Nettoyage, Non-conformités, Pertes, Statistiques, Rappels, Dossier PDF, Archives, Compte. Onglets bas conservés à l'identique sur mobile/tablette. Contenu centré (max 1040px) sur grand écran.
- ✅ **Abonnement web Stripe** (remplace le paywall Apple sur le web ; RevenueCat conservé pour iOS/Android) :
  - Stripe Checkout hébergé, `mode=subscription`, **15 jours d'essai puis 12,99 €/mois, renouvellement auto**, carte collectée à l'inscription.
  - Via le proxy de test Emergent (`sk_test_emergent`) — aucune clé utilisateur requise.
  - Endpoints backend : `POST /api/billing/checkout` (responsable), `GET /api/billing/status/{session_id}` (synchro), `POST /api/stripe/webhook` (idempotent via `stripe_events`).
  - Écrans : `app/billing/index.tsx`, `app/billing/success.tsx`, `app/billing/canceled.tsx`.
  - **Gate web** : accès conditionné à `subscription.has_access` (abonnement Stripe) ; sinon redirection `/billing`. `register()` ne donne plus d'accès gratuit sans Stripe (`stripe_status='none'`).
  - **Résiliation web dans l'app** (Profil → Résilier) : `cancel_at_period_end=true`, accès conservé jusqu'à la fin de période. Le portail Stripe hébergé n'est pas exposé par le proxy de test.
- ⚠️ Limite : la carte réelle ne peut être saisie que sur la page Stripe hébergée (non testable en automation navigateur). Le proxy de test Emergent ne supporte que checkout create/retrieve (pas de Billing Portal / Customer / Subscription API).
- ✅ Backend : 91/91 tests pytest verts (régression + 8 nouveaux tests billing).

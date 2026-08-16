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

# TDMS Analytics - Monorepo Nx

[![CI](https://github.com/TBERT31/tdms-analytics/actions/workflows/ci.yml/badge.svg)](https://github.com/TBERT31/tdms-analytics/actions/workflows/ci.yml)

Application d'analyse de données TDMS avec architecture microservices.

## 🚀 Démarrage rapide

### Installation
```bash
make install
```

### Lancement (3 terminaux recommandés)

**Terminal 1 - Dataset Service :**
```bash
nx dev dataset-service
```

**Terminal 2 - API Gateway :**
```bash
nx dev api-gateway
```

**Terminal 3 - Frontend :**
```bash
nx dev frontend
```

### Accès aux services

- 🎨 **Frontend** : http://localhost:3000
- 🔗 **API Gateway** : http://localhost:3001
- 📊 **Dataset Service** : http://localhost:8000
- 📖 **Swagger Dataset** : http://localhost:8000/docs
- 📖 **Swagger Gateway** : http://localhost:3001/docs

## 📦 Architecture
```
tdms-analytics/
├── apps/
│   ├── frontend/          # Next.js (React)
│   ├── api-gateway/       # NestJS
│   └── dataset-service/   # FastAPI
├── libs/
│   └── shared/
│       ├── types/         # Types partagés
│       ├── utils/         # Utilitaires
│       └── constants/     # Constantes
└── infra/                 # Docker configs
```

## 🛠️ Commandes
```bash
make help              # Aide
make install           # Installer dépendances
make dev               # Lancer tout (logs mélangés)
nx dev frontend        # Lancer frontend seul
nx dev api-gateway     # Lancer gateway seul
nx dev dataset-service # Lancer dataset seul
make build             # Builder tout
make test              # Tester tout
make lint              # Linter tout
make graph             # Voir le graph Nx
make clean             # Nettoyer
```

## 🐳 Infrastructure
```bash
# Démarrer l'infra seulement
make infra

# Ou manuellement
docker compose up -d redis clickhouse keycloak
```

## 📊 Graph de dépendances
```bash
nx graph
```